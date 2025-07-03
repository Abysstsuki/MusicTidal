import axios from 'axios';
import fs from 'fs';
import path from 'path';

const cookiePath = path.resolve(process.cwd(), 'cookie.txt');
const cookie = fs.existsSync(cookiePath) ? fs.readFileSync(cookiePath, 'utf-8').trim() : '';
const realIP = '116.25.146.177'; // 国内 IP
if (!cookie) {
  console.warn('警告：cookie.txt 未设置或为空，VIP 歌曲可能无法播放');
}

const neteaseAxios = axios.create({
  baseURL: process.env.NETEASE_CLOUD_API_URL,
  timeout: 5000,
  headers: {
    Cookie: cookie,
  },
});

// 校验 cookie 是否有效
export async function verifyCookie() {
  if (!cookie) {
    console.error('Cookie 为空，跳过校验');
    return false;
  }
  
  try {
    const res = await neteaseAxios.get('/user/account');
    const { account, profile } = res.data;
    if (account && profile) {
      console.log('网易云 Cookie 校验成功，用户：', profile.nickname);
      return true;
    } else {
      console.error('网易云 Cookie 无效，account 或 profile 为 null');
      return false;
    }
  } catch (error) {
    console.error('网易云 Cookie 校验请求失败');
    return false;
  }
}
// 请求拦截器，统一加 realIP 参数
neteaseAxios.interceptors.request.use(config => {
  if (!config.params) {
    config.params = {};
  }
  config.params.realIP = realIP;
  return config;
});
export { neteaseAxios };
