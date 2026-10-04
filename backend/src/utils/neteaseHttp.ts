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
const cacheableEndpoints = new Set(['/cloudsearch', '/lyric']);
const cacheTtl = 120_000;
const cacheLimit = 100;
const cache = new Map<string, { expires: number; data: any }>();
const pending = new Map<string, Promise<{ data: any }>>();
let guestToken = '';
let guestTask: Promise<string> | null = null;

export interface RequestParams {
  params?: Record<string, string | number>;
}

export interface NeteaseClient {
  get(pathname: string, config?: RequestParams): Promise<{ data: any }>;
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

async function get(cookie: string, onExpired: (() => void) | undefined, pathname: string, config?: RequestParams): Promise<{ data: any }> {
  const module = modules[pathname];
  if (!module) throw new Error('Unsupported embedded Netease endpoint');

  const realIP = process.env.NETEASE_REAL_IP?.trim() || '116.25.146.177';
  const anonymousToken = await getAnonymousToken(cookie, realIP);
  const params = config?.params || {};
  const canCache = cacheableEndpoints.has(pathname) && params.timestamp === undefined;
  const identity = crypto.createHash('sha256').update(cookie + '\0' + anonymousToken).digest('hex');
  const cacheKey = JSON.stringify([pathname, identity, realIP, Object.keys(params).sort().map(key => [key, params[key]])]);

  if (canCache) {
    const saved = cache.get(cacheKey);
    if (saved && saved.expires > Date.now()) return { data: saved.data };
    cache.delete(cacheKey);
    const running = pending.get(cacheKey);
    if (running) return running;
  }

  const task = (async () => {
    try {
      // Modules receive fresh cookie objects; their os/appver mutations stay local.
      const response = await module({ ...params, cookie, realIP, anonymousToken, timeout: 15000 });
      if (response.body?.code === 301 || response.body?.code === 401 ||
          (cookie && pathname === '/user/account' && response.body?.code === 200 && !response.body?.profile)) {
        onExpired?.();
        throw new NeteaseApiError(401);
      }
      if (canCache && response.body?.code === 200) {
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
      if (canCache) pending.delete(cacheKey);
    }
  })();
  if (canCache) pending.set(cacheKey, task);
  return task;
}

// Preserve the existing { data } facade; calls now stay inside this process.
export function createNeteaseClient(cookie: string, onExpired?: () => void): NeteaseClient {
  let reported = false;
  const expired = () => { if (!reported) { reported = true; onExpired?.(); } };
  return { get: (pathname, config) => get(cookie, expired, pathname, config) };
}

// Compatibility facade is always anonymous; room requests supply their own client.
export const neteaseHttp = createNeteaseClient('');

export async function verifyCookie(): Promise<boolean> {
  return false; // Global personal credentials no longer authorize rooms.
}
