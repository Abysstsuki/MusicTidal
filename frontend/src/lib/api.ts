// Shared API config — all components call the backend directly.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

if (!BACKEND_URL && typeof window !== 'undefined') {
  console.warn('NEXT_PUBLIC_BACKEND_URL is not set — API calls will fail.');
}

export { BACKEND_URL };
