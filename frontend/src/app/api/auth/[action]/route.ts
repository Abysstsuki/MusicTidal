import type { NextRequest } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function POST(request: NextRequest) {
  const action = request.nextUrl.pathname.split('/').pop(); // login or register
  const body = await request.json();

  if (!action) {
    return new Response(JSON.stringify({ error: '未知操作类型' }), { status: 400 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      credentials: 'include', // 如果后端使用 cookie，保留
    });

    const data = await res.json();

    if (!res.ok) {
      // 把后端返回的错误信息直接转发给前端
      return new Response(JSON.stringify({ error: data.error || '请求失败' }), {
        status: res.status,
      });
    }

    return new Response(JSON.stringify(data), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: '服务器错误，请稍后重试' }), { status: 500 });
  }
}
