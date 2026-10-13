import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-cron-secret");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }
  const response = NextResponse.next();
  corsHeaders(origin).forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = { matcher: "/api/:path*" };
