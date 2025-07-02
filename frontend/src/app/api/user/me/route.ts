import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL;

export async function GET(req: NextRequest) {
  const url = `${BACKEND_URL}/api/user/me`;

  try {
    // 手动提取 Authorization 头部
    const auth = req.headers.get('authorization');

    const backendRes = await fetch(url, {
      method: 'GET',
      headers: auth
        ? {
            Authorization: auth,
          }
        : {},
    });

    const data = await backendRes.json();

    return NextResponse.json(data, { status: backendRes.status });
  } catch (error) {
    return NextResponse.json({ message: '代理请求失败' }, { status: 500 });
  }
}
