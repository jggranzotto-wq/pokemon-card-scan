import { NextResponse } from "next/server";
import { thumbnailAllowed } from "@/lib/collection-auth";
import { getThumbnail } from "@/lib/collection-store";
import { hasDatabase } from "@/lib/db";
import { isUuid } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!hasDatabase()) return NextResponse.json({ error: "database-missing" }, { status: 503 });
  const { id } = await context.params;
  if (!isUuid(id) || !thumbnailAllowed(id, request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const image = await getThumbnail(id);
  if (!image) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
