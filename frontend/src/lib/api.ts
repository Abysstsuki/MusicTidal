// Shared API config — all components call the backend directly.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

if (!BACKEND_URL && typeof window !== 'undefined') {
  console.warn('NEXT_PUBLIC_BACKEND_URL is not set — API calls will fail.');
}

export { BACKEND_URL };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (!BACKEND_URL) throw new Error('音乐服务尚未连接，请稍后再试');
  const headers = new Headers(options?.headers);
  const token = typeof window === 'undefined' ? '' : localStorage.getItem('token');
  if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    // A failed login describes the submitted credentials, not an existing session.
    const isAuthSubmission = path === '/api/auth/login' || path === '/api/auth/register';
    if (response.status === 401 && token && !isAuthSubmission) window.dispatchEvent(new Event('auth-expired'));
    throw new ApiError(data?.error || '请求失败，请稍后再试', response.status, data?.code);
  }
  return response.json() as Promise<T>;
}
