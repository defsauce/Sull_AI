import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { gatewayFetch } from '@/lib/platform';

export async function POST(request: NextRequest) {
  const jar = await cookies();
  const token = jar.get('sull_access_token')?.value;
  if (!token) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  const body: unknown = await request.json();
  const upstream = await gatewayFetch('/v1/agent-runs', {
    method: 'POST',
    accessToken: token,
    body: JSON.stringify(body),
  });
  const payload = await upstream.text();
  return new NextResponse(payload, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
