import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const songId = searchParams.get('id');

  if (!songId) {
    return NextResponse.json({ error: 'Missing song id' }, { status: 400 });
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/netease/lyric?id=${encodeURIComponent(songId)}`);
    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('获取歌词失败:', error);
    return NextResponse.json({ error: 'Failed to fetch lyric' }, { status: 500 });
  }
}