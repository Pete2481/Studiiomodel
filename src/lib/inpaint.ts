import sharp from "sharp";

let cvPromise: Promise<any> | null = null;

async function getCv() {
  if (cvPromise) return cvPromise;
  cvPromise = (async () => {
    // Follow package guidance: module may export a Promise or a cv object.
    const mod: any = await import("@techstark/opencv-js");
    const cvModule: any = mod?.default ?? mod;
    if (!cvModule) throw new Error("OpenCV failed to load");

    let cv: any;
    if (cvModule instanceof Promise) {
      cv = await cvModule;
    } else {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("OpenCV init timeout")), 30_000);
        cvModule.onRuntimeInitialized = () => {
          clearTimeout(timeout);
          resolve();
        };
        // If runtime is already ready, resolve immediately.
        if (cvModule.Mat) {
          clearTimeout(timeout);
          resolve();
        }
      });
      cv = cvModule;
    }

    if (!cv?.Mat) throw new Error("OpenCV not initialized");
    return cv;
  })();
  return cvPromise;
}

async function toImageBytes(input: string): Promise<Buffer> {
  const s = String(input || "").trim();
  if (!s) throw new Error("Missing image input");
  if (s.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.+)$/i.exec(s);
    if (!m) throw new Error("Invalid data URL");
    return Buffer.from(m[2], "base64");
  }
  const res = await fetch(s);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function contentAwareInpaintTelea(args: {
  image: string; // data URL or http(s) URL
  mask: string; // data URL or http(s) URL
  radius?: number; // 1..20
}): Promise<{ outputDataUrl: string }> {
  const { image, mask } = args;
  const radius = Math.max(1, Math.min(20, Math.floor(Number(args.radius ?? 5))));

  const [imgBytes, maskBytes] = await Promise.all([toImageBytes(image), toImageBytes(mask)]);

  const img = sharp(imgBytes, { failOn: "none" });
  const meta = await img.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) throw new Error("Unable to read image dimensions");

  // OpenCV expects BGR(A) mats; we’ll use BGRA to preserve alpha safely.
  const imgRaw = await img.ensureAlpha().raw().toBuffer();

  const maskRaw = await sharp(maskBytes, { failOn: "none" })
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Convert RGBA -> BGRA and build 8UC4 mat
  const bgra = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    const r = imgRaw[off + 0];
    const g = imgRaw[off + 1];
    const b = imgRaw[off + 2];
    const a = imgRaw[off + 3];
    bgra[off + 0] = b;
    bgra[off + 1] = g;
    bgra[off + 2] = r;
    bgra[off + 3] = a;
  }

  // Mask: white = remove. Build 8UC1 mat with 0/255.
  const mask1 = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    const r = maskRaw[off + 0];
    const g = maskRaw[off + 1];
    const b = maskRaw[off + 2];
    const v = (r + g + b) / 3;
    mask1[i] = v > 128 ? 255 : 0;
  }

  const cv = await getCv();
  const src = cv.matFromArray(height, width, cv.CV_8UC4, bgra);
  const m = cv.matFromArray(height, width, cv.CV_8UC1, mask1);
  const dst = new cv.Mat();

  try {
    cv.inpaint(src, m, dst, radius, cv.INPAINT_TELEA);

    // Convert BGRA -> RGBA
    const out = Buffer.alloc(width * height * 4);
    const d = dst.data;
    for (let i = 0; i < width * height; i++) {
      const off = i * 4;
      const b = d[off + 0];
      const g = d[off + 1];
      const r = d[off + 2];
      const a = d[off + 3];
      out[off + 0] = r;
      out[off + 1] = g;
      out[off + 2] = b;
      out[off + 3] = a;
    }

    const outPng = await sharp(out, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
    return { outputDataUrl: `data:image/png;base64,${outPng.toString("base64")}` };
  } finally {
    src.delete();
    m.delete();
    dst.delete();
  }
}

