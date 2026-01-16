import { NextResponse } from "next/server";
import { saveAIResultSiblingToDropbox } from "@/app/actions/dropbox";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body: any = await req.json().catch(() => null);
  if (!body?.tenantId || !body?.resultUrl || !body?.originalPath || !body?.originalName) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields (tenantId, resultUrl, originalPath, originalName)" },
      { status: 400 }
    );
  }

  const result = await saveAIResultSiblingToDropbox({
    tenantId: String(body.tenantId),
    galleryId: body.galleryId ? String(body.galleryId) : undefined,
    resultUrl: String(body.resultUrl),
    originalPath: String(body.originalPath),
    originalName: String(body.originalName),
  });

  return NextResponse.json({ ok: true, result });
}


