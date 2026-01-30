import "server-only";

// Edge-safe password hashing using WebCrypto PBKDF2.
// Stored format: pbkdf2$v1$<iterations>$<saltB64>$<hashB64>
const PREFIX = "pbkdf2$v1";
const ITERATIONS = 210_000;
const HASH_BYTES = 32; // 256-bit

function getCrypto(): Crypto {
  const c = (globalThis as any).crypto as Crypto | undefined;
  if (!c?.subtle) throw new Error("WebCrypto is not available in this runtime.");
  return c;
}

function encodeUtf8(s: string) {
  return new TextEncoder().encode(s);
}

function base64Encode(bytes: Uint8Array): string {
  // Node runtime
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  // Edge/browser
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64Decode(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function deriveKeyBytes(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const crypto = getCrypto();
  const keyMaterial = await crypto.subtle.importKey("raw", encodeUtf8(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations, hash: "SHA-256" },
    keyMaterial,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(plain: string): Promise<string> {
  const pw = String(plain || "");
  if (pw.length < 8) throw new Error("Password must be at least 8 characters.");

  const crypto = getCrypto();
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await deriveKeyBytes(pw, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${base64Encode(salt)}$${base64Encode(hash)}`;
}

export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  const raw = String(stored || "");
  if (!raw) return false;
  const parts = raw.split("$");
  if (parts.length !== 5) return false;
  const prefix = `${parts[0]}$${parts[1]}`;
  if (prefix !== PREFIX) return false;

  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations < 50_000) return false;

  try {
    const salt = base64Decode(parts[3]);
    const expected = base64Decode(parts[4]);
    if (expected.length !== HASH_BYTES) return false;
    const actual = await deriveKeyBytes(String(plain || ""), salt, iterations);
    return constantTimeEqual(expected, actual);
  } catch {
    return false;
  }
}

