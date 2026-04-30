import http from 'http';
import fs from 'fs';
import path from 'path';

const NETESE_API_URL = process.env.NETEASE_CLOUD_API_URL || 'http://localhost:3457';
const urlBase = new URL(NETESE_API_URL);

const cookiePath = path.resolve(process.cwd(), 'cookie.txt');
const cookie = fs.existsSync(cookiePath) ? fs.readFileSync(cookiePath, 'utf-8').trim() : '';
const realIP = '116.25.146.177';

if (!cookie) {
  console.warn('警告：cookie.txt 未设置或为空，VIP 歌曲可能无法播放');
}

interface RequestParams {
  params?: Record<string, string | number>;
}

function buildUrl(pathname: string, params?: Record<string, string | number>): string {
  const searchParams = new URLSearchParams();
  searchParams.set('realIP', realIP);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      searchParams.set(key, String(value));
    }
  }
  return `${urlBase.protocol}//${urlBase.host}${pathname}?${searchParams.toString()}`;
}

function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const req = http.get({
      hostname: opts.hostname,
      port: opts.port || 80,
      path: opts.pathname + opts.search,
      headers: cookie ? { Cookie: cookie } : {},
    }, (res) => {
      let body = '';
      res.on('data', (chunk: string) => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({ data });
        } catch {
          reject(new Error(`Invalid JSON response: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

export const neteaseHttp = {
  get(pathname: string, config?: RequestParams) {
    const url = buildUrl(pathname, config?.params);
    return httpGet(url);
  },
};

export async function verifyCookie() {
  if (!cookie) {
    console.error('Cookie 为空，跳过校验');
    return false;
  }

  try {
    const res = await httpGet(`${urlBase.protocol}//${urlBase.host}/user/account`);
    const { account, profile } = res.data;
    if (account && profile) {
      console.log('网易云 Cookie 校验成功，用户：', profile.nickname);
      return true;
    }
    console.error('网易云 Cookie 无效，account 或 profile 为 null');
    return false;
  } catch (error) {
    console.error('网易云 Cookie 校验请求失败');
    return false;
  }
}
