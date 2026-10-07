// Shared API config — all components call the backend directly.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

if (!BACKEND_URL && typeof window !== 'undefined') {
  console.warn('NEXT_PUBLIC_BACKEND_URL is not set — API calls will fail.');
}

export { BACKEND_URL };

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

const reads = new Map<string, Promise<unknown>>();
function withSignal<T>(work: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (!BACKEND_URL) throw new Error('音乐服务尚未连接，请稍后再试');
  if (options?.signal?.aborted) throw options.signal.reason;
  const headers = new Headers(options?.headers);
  const method = options?.method?.toUpperCase() || 'GET';
  // Public lobby reads need no Authorization-triggered CORS preflight.
  const token = typeof window === 'undefined' || (path === '/api/rooms' && method === 'GET') ? '' : localStorage.getItem('token');
  if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
  const requestToken = headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const shared = method === 'GET' && (path === '/api/user/me' || path === '/api/rooms');
  const key = JSON.stringify([path, [...headers.entries()]]);
  const send = async (): Promise<T> => {
    const response = await fetch(`${BACKEND_URL}${path}`, { ...options, headers, signal: shared ? AbortSignal.timeout(10000) : options?.signal });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      // An old account's response must not clear a newer login.
      const isAuthSubmission = path === '/api/auth/login' || path === '/api/auth/register';
      if (response.status === 401 && requestToken && !isAuthSubmission && localStorage.getItem('token') === requestToken) window.dispatchEvent(new Event('auth-expired'));
      throw new ApiError(data?.error || '请求失败，请稍后再试', response.status, data?.code);
    }
    return response.json() as Promise<T>;
  };
  if (!shared) return send();
  let work = reads.get(key) as Promise<T> | undefined;
  if (!work) {
    work = send(); reads.set(key, work);
    const cleanup = () => { if (reads.get(key) === work) reads.delete(key); };
    void work.then(cleanup, cleanup);
  }
  return withSignal(work, options?.signal);
}
