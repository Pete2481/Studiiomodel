import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const res = await replicate.models.search(q);
  return NextResponse.json(res);
}

