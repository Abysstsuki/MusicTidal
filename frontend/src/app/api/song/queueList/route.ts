import { NextResponse } from 'next/server';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
export async function GET() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/queue/list`);
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('获取队列失败', error);
        return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
    }
}
