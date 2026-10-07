import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as netease from '../../vendor/netease';
import type { NeteaseModule, NeteaseResponse } from '../../vendor/netease';

// Resolves to backend/ in both src/utils and compiled dist/utils.
const backendRoot = path.resolve(__dirname, '../..');
const modules: Record<string, NeteaseModule> = {
  '/login/qr/key': netease.login_qr_key,
  '/login/qr/check': netease.login_qr_check,
  '/login/status': netease.login_status,
  '/cloudsearch': netease.cloudsearch,
  '/song/url/v1': netease.song_url_v1,
  '/lyric': netease.lyric,
  '/user/account': netease.user_account,
  '/recommend/songs': netease.recommend_songs,
  '/personal_fm': netease.personal_fm,
  '/user/playlist': netease.user_playlist,
  '/likelist': netease.likelist,
  '/playmode/intelligence/list': netease.playmode_intelligence_list,
  '/playlist/user': netease.enhanced_user_playlist,
  '/playlist/search': netease.playlist_search,
  '/playlist/detail': netease.playlist_detail,
  '/song/detail': netease.song_detail,
};
const cacheableEndpoints = new Set(['/cloudsearch', '/lyric', '/song/detail']);
const cacheTtl = 120_000;
const cacheLimit = 100;
const cache = new Map<string, { expires: number; data: any }>();
const songDetails = new Map<string, { expires: number; song: any; privilege: any }>();
const pending = new Map<string, Promise<{ data: any }>>();
const invalidatedTasks = new WeakSet<Promise<{ data: any }>>();
let guestToken = '';
let guestTask: Promise<string> | null = null;

export interface RequestParams {
  params?: Record<string, string | number>;
}

export interface NeteaseClient {
  get(pathname: string, config?: RequestParams): Promise<{ data: any }>;
  dispose?(clearCache?: boolean): void;
}

export class NeteaseApiError extends Error {
  constructor(public readonly code: number = 502) {
    super('Netease API request failed (code=' + code + ')');
    this.name = 'NeteaseApiError';
  }
}

function readCredential(variable: string, filename: string): string {
  // Read lazily, after server.ts has loaded dotenv, without writing credentials.
  const configured = process.env[variable]?.trim();
  if (configured) return configured;
  try {
    return fs.readFileSync(path.join(backendRoot, filename), 'utf8').trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw new Error('Unable to read Netease credential file: ' + filename);
  }
}

async function getAnonymousToken(cookie: string, realIP: string): Promise<string> {
  const parsed = netease.cookieToJson(cookie);
  if (parsed.MUSIC_U || parsed.MUSIC_A) return '';
  const configured = readCredential('NETEASE_ANONYMOUS_TOKEN', 'anonymous_token');
  if (configured) return configured;
  if (guestToken) return guestToken;
  if (!guestTask) {
    guestTask = (async () => {
      try {
        const result = await netease.register_anonimous({ realIP, timeout: 15000 });
        for (const item of result.cookie) {
          const token = netease.cookieToJson(item).MUSIC_A;
          if (token) {
            guestToken = token;
            return token;
          }
        }
        throw new NeteaseApiError();
      } catch {
        throw new NeteaseApiError();
      } finally {
        guestTask = null;
      }
    })();
  }
  return guestTask;
}

export async function callNeteaseModule(pathname: string, cookie: string, params: Record<string, string | number> = {}): Promise<NeteaseResponse> {
  const module = modules[pathname];
  if (!module) throw new Error('Unsupported embedded Netease endpoint');
  try {
    return await module({ ...params, cookie, realIP: process.env.NETEASE_REAL_IP?.trim() || '116.25.146.177', timeout: 15000 });
  } catch (error) {
    const code = (error as { body?: { code?: unknown } })?.body?.code;
    throw new NeteaseApiError(typeof code === 'number' && Number.isSafeInteger(code) ? code : 502);
  }
}

async function get(cookie: string, onExpired: (() => void) | undefined, pathname: string, config: RequestParams | undefined, isActive: () => boolean): Promise<{ data: any }> {
  const module = modules[pathname];
  if (!module) throw new Error('Unsupported embedded Netease endpoint');

  const realIP = process.env.NETEASE_REAL_IP?.trim() || '116.25.146.177';
  const anonymousToken = await getAnonymousToken(cookie, realIP);
  if (!isActive()) throw new NeteaseApiError(409);
  const params = config?.params || {};
  const canCache = cacheableEndpoints.has(pathname) && params.timestamp === undefined;
  const identity = crypto.createHash('sha256').update(cookie + '\0' + anonymousToken).digest('hex');
  const cacheKey = JSON.stringify([pathname, identity, realIP, Object.keys(params).sort().map(key => [key, params[key]])]);
  const ids = canCache && pathname === '/song/detail' && /^\d+(,\d+)*$/.test(String(params.ids || ''))
    ? [...new Set(String(params.ids).split(',').map(Number))] : [];
  const detailKey = (id: number) => JSON.stringify([identity, realIP, id]);
  const existing = new Map<number, { expires: number; song: any; privilege: any }>();
  for (const id of ids) {
    const key = detailKey(id), found = songDetails.get(key);
    if (found && found.expires > Date.now()) existing.set(id, found);
    else songDetails.delete(key);
  }
  const detailBody = (body: any) => ({ ...body,
    songs: ids.flatMap(id => existing.has(id) ? [existing.get(id)!.song] : []),
    privileges: ids.flatMap(id => existing.get(id)?.privilege ? [existing.get(id)!.privilege] : []),
  });
  if (ids.length && existing.size === ids.length) return { data: detailBody({ code: 200 }) };
  const requestParams = ids.length ? { ...params, ids: ids.filter(id => !existing.has(id)).join(',') } : params;

  if (canCache) {
    const saved = cache.get(cacheKey);
    if (saved && saved.expires > Date.now()) return { data: saved.data };
    cache.delete(cacheKey);
    const running = pending.get(cacheKey);
    if (running) return running;
  }

  let task!: Promise<{ data: any }>;
  task = (async () => {
    try {
      // Modules receive fresh cookie objects; their os/appver mutations stay local.
      const response = await module({ ...requestParams, cookie, realIP, anonymousToken, timeout: 15000 });
      if (response.body?.code === 301 || response.body?.code === 401 ||
          (cookie && pathname === '/user/account' && response.body?.code === 200 && !response.body?.profile)) {
        onExpired?.();
        throw new NeteaseApiError(401);
      }
      const canStore = canCache && response.body?.code === 200 && isActive() && !invalidatedTasks.has(task);
      if (ids.length && response.body?.code === 200 && Array.isArray(response.body.songs)) {
        const privileges = new Map((response.body.privileges || []).map((item: any) => [Number(item.id), item]));
        for (const song of response.body.songs) {
          const id = Number(song.id), value = { expires: Date.now() + cacheTtl, song, privilege: privileges.get(id) };
          if (!ids.includes(id)) continue;
          existing.set(id, value);
          if (canStore) {
            if (songDetails.size >= 1000) songDetails.delete(songDetails.keys().next().value!);
            songDetails.set(detailKey(id), value);
          }
        }
        // Also assemble partial batches for a live caller sharing a disposed client's request.
        response.body = detailBody(response.body);
      } else if (canStore && pathname !== '/song/detail') {
        if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { expires: Date.now() + cacheTtl, data: response.body });
      }
      return { data: response.body };
    } catch (error) {
      // Never expose upstream bodies, Set-Cookie headers or Axios request options.
      const upstreamCode = error instanceof NeteaseApiError ? error.code : (error as { body?: { code?: unknown } })?.body?.code;
      if (upstreamCode === 301 || upstreamCode === 401) onExpired?.();
      throw new NeteaseApiError(typeof upstreamCode === 'number' && Number.isSafeInteger(upstreamCode) ? upstreamCode : 502);
    } finally {
      if (canCache && pending.get(cacheKey) === task) pending.delete(cacheKey);
    }
  })();
  if (canCache) pending.set(cacheKey, task);
  return task;
}

// Preserve the existing { data } facade; calls now stay inside this process.
export function createNeteaseClient(cookie: string, onExpired?: () => void): NeteaseClient {
  let reported = false, disposed = false;
  const expired = () => { if (!reported && !disposed) { reported = true; onExpired?.(); } };
  return { get: async (pathname, config) => {
    if (disposed) throw new NeteaseApiError(409);
    try {
      const response = await get(cookie, expired, pathname, config, () => !disposed);
      if (disposed) throw new NeteaseApiError(409);
      return response;
    } catch (error) {
      // A coalesced request may belong to a client that was disposed meanwhile.
      if (error instanceof NeteaseApiError && [301, 401].includes(error.code)) expired();
      throw error;
    }
  }, dispose: clearCache => {
    disposed = true;
    if (clearCache && cookie) {
      const identity = crypto.createHash('sha256').update(cookie + '\0').digest('hex');
      for (const key of cache.keys()) if (JSON.parse(key)[1] === identity) cache.delete(key);
      for (const key of songDetails.keys()) if (JSON.parse(key)[0] === identity) songDetails.delete(key);
      for (const [key, task] of pending) if (JSON.parse(key)[1] === identity) { invalidatedTasks.add(task); pending.delete(key); }
    }
  } };
}

// Compatibility facade is always anonymous; room requests supply their own client.
export const neteaseHttp = createNeteaseClient('');

export async function verifyCookie(): Promise<boolean> {
  return false; // Global personal credentials no longer authorize rooms.
}
