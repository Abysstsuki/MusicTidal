import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
export async function POST(req: NextRequest) {
    try {
        const { instanceId } = await req.json();
        const res = await fetch(`${BACKEND_URL}/api/queue/moveTop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instanceId }),
        });

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('置顶失败', error);
        return NextResponse.json({ error: 'Failed to move song to top' }, { status: 500 });
    }
}
