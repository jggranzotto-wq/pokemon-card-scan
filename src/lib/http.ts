import { NextResponse } from "next/server";
import { collectionAuthorized } from "./collection-auth";
import { hasDatabase } from "./db";

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function guardCollection(request: Request): NextResponse | null {
  if (!hasDatabase()) {
    return NextResponse.json(
      {
        error: "database-missing",
        message: "The collection needs Postgres. Set DATABASE_URL and restart.",
      },
      { status: 503 },
    );
  }
  if (!collectionAuthorized(request)) {
    return NextResponse.json(
      { error: "collection-auth", message: "Enter the collection password from COLLECTION_PASSWORD." },
      { status: 401 },
    );
  }
  return null;
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
