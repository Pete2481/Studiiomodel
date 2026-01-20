import { unstable_cache } from "next/cache";

type CacheKeyPart = string | number | boolean | null | undefined;

function normalizeKeyPart(v: CacheKeyPart) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  return String(v);
}

/**
 * Create a tenant/user-scoped cached function using Next.js Data Cache.
 * Use this for expensive Prisma aggregations powering dashboards.
 */
export function cached<T>(
  name: string,
  keyParts: CacheKeyPart[],
  fn: () => Promise<T>,
  opts: { revalidateSeconds: number; tags?: string[] },
) {
  const key = [`studiio`, name, ...keyParts.map(normalizeKeyPart)];
  return unstable_cache(fn, key, {
    revalidate: opts.revalidateSeconds,
    tags: opts.tags,
  })();
}

export function tenantTag(tenantId: string) {
  return `tenant:${tenantId}`;
}


