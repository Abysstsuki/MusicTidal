// app/api/debug/route.ts

export async function GET(request: Request) {
  console.log('✅ 收到 GET 请求');

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  return new Response(JSON.stringify({
    message: '调试成功，GET 请求已到达后端',
    receivedQuery: params,
    timestamp: Date.now(),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
