import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(req: NextRequest) {
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/queue/currentPlaying`, {
      method: 'GET',
      headers: req.headers,
    });
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (error) {
    console.error('转发获取当前播放歌曲请求失败:', error);
    return NextResponse.json({ error: '转发失败' }, { status: 500 });
  }
}