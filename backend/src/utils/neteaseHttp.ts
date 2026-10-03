import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as netease from '../../vendor/netease';
import type { NeteaseModule } from '../../vendor/netease';

// Resolves to backend/ in both src/utils and compiled dist/utils.
const backendRoot = path.resolve(__dirname, '../..');
const modules: Record<string, NeteaseModule> = {
  '/cloudsearch': netease.cloudsearch,
  '/song/url/v1': netease.song_url_v1,
  '/lyric': netease.lyric,
  '/user/account': netease.user_account,
  '/recommend/songs': netease.recommend_songs,
  '/personal_fm': netease.personal_fm,
  '/user/playlist': netease.user_playlist,
  '/likelist': netease.likelist,
  '/playmode/intelligence/list': netease.playmode_intelligence_list,
};
const cacheableEndpoints = new Set(['/cloudsearch', '/lyric']);
const cacheTtl = 120_000;
const cacheLimit = 100;
const cache = new Map<string, { expires: number; data: any }>();
const pending = new Map<string, Promise<{ data: any }>>();
let guestToken = '';
let guestTask: Promise<string> | null = null;

interface RequestParams {
  params?: Record<string, string | number>;
}

class NeteaseApiError extends Error {
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

async function get(pathname: string, config?: RequestParams): Promise<{ data: any }> {
  const module = modules[pathname];
  if (!module) throw new Error('Unsupported embedded Netease endpoint');

  const cookie = readCredential('NETEASE_COOKIE', 'cookie.txt');
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
      if (canCache && response.body?.code === 200) {
        if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { expires: Date.now() + cacheTtl, data: response.body });
      }
      return { data: response.body };
    } catch (error) {
      // Never expose upstream bodies, Set-Cookie headers or Axios request options.
      const upstreamCode = (error as { body?: { code?: unknown } })?.body?.code;
      throw new NeteaseApiError(typeof upstreamCode === 'number' && Number.isSafeInteger(upstreamCode) ? upstreamCode : 502);
    } finally {
      if (canCache) pending.delete(cacheKey);
    }
  })();
  if (canCache) pending.set(cacheKey, task);
  return task;
}

// Preserve the existing { data } facade; calls now stay inside this process.
export const neteaseHttp = { get };

export async function verifyCookie(): Promise<boolean> {
  if (!readCredential('NETEASE_COOKIE', 'cookie.txt')) {
    console.warn('网易云 Cookie 未配置，部分功能可能受限');
    return false;
  }
  try {
    const response = await get('/user/account');
    const valid = response.data?.code === 200 && Boolean(response.data.account && response.data.profile);
    console.log(valid ? '网易云 Cookie 校验成功' : '网易云 Cookie 无效或已过期');
    return valid;
  } catch {
    console.warn('网易云 Cookie 校验请求失败');
    return false;
  }
}
