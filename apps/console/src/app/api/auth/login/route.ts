import { type NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL = process.env.API_GATEWAY_URL ?? 'http://localhost:8080';

export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  const upstream = await fetch(`${GATEWAY_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await upstream.text();
  const response = new NextResponse(payload, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });

  if (upstream.ok) {
    const tokens = JSON.parse(payload) as { accessToken: string; refreshToken: string };
    response.cookies.set('sull_access_token', tokens.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 900,
    });
    response.cookies.set('sull_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 2_592_000,
    });
  }

  return response;
}
