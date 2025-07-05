import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
export async function POST(req: NextRequest) {
    const body = await req.json();

    try {
        const res = await fetch(`${BACKEND_URL}/api/queue/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error) {
        console.error('API 转发失败:', error);
        return NextResponse.json({ error: '转发失败' }, { status: 500 });
    }
}
