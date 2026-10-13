import { NextResponse } from "next/server";
import { appPublicUrl, exchangeEbayCode, verifyOAuthState } from "@/lib/ebay-sell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = appPublicUrl();
  const oauthError = url.searchParams.get("error");
  if (oauthError) return NextResponse.redirect(`${back}/settings?ebay=${encodeURIComponent(oauthError)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  if (!code || !verifyOAuthState(state)) return NextResponse.redirect(`${back}/settings?ebay=invalid-state`);
  try {
    await exchangeEbayCode(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "token-exchange-failed";
    return NextResponse.redirect(`${back}/settings?ebay=${encodeURIComponent(message)}`);
  }
  return NextResponse.redirect(`${back}/settings?ebay=connected`);
}
