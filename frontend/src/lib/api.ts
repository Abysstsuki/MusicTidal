// Shared API config — all components call the backend directly.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

if (!BACKEND_URL && typeof window !== 'undefined') {
  console.warn('NEXT_PUBLIC_BACKEND_URL is not set — API calls will fail.');
}

export { BACKEND_URL };

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (!BACKEND_URL) throw new Error('音乐服务尚未连接，请稍后再试');
  const response = await fetch(`${BACKEND_URL}${path}`, options);
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || '请求失败，请稍后再试');
  }
  return response.json() as Promise<T>;
}
