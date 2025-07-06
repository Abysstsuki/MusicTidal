import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function POST(req: NextRequest) {
    try {
        const res = await fetch(`${BACKEND_URL}/api/queue/skipNext`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('跳到下一首失败', error);
        return NextResponse.json({ error: 'Failed to skip to next song' }, { status: 500 });
    }
}