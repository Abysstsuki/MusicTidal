// app/api/song/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const keywords = searchParams.get('keywords');

  if (!keywords) {
    return NextResponse.json({ error: 'Missing keywords' }, { status: 400 });
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/netease/song/search?keywords=${encodeURIComponent(keywords)}`);
    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('搜索失败:', error);
    return NextResponse.json({ error: 'Failed to fetch from backend' }, { status: 500 });
  }
}
