import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;
export async function POST(req: NextRequest) {
    try {
        const { id } = await req.json();
        const res = await fetch(`${BACKEND_URL}/api/queue/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('删除失败', error);
        return NextResponse.json({ error: 'Failed to remove song' }, { status: 500 });
    }
}
