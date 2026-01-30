import { NextResponse } from "next/server";
import Replicate from "replicate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const owner = String(url.searchParams.get("owner") || "").trim();
  const name = String(url.searchParams.get("name") || "").trim();
  if (!owner || !name) {
    return NextResponse.json({ error: "owner and name are required" }, { status: 400 });
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const model = await replicate.models.get(owner, name);
  return NextResponse.json(model);
}

