import { NextResponse } from 'next/server';

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export function privateResponse(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export function applicationReadError() {
  return privateJson({ error: 'Unable to load application data. Please try again.' }, 503);
}
