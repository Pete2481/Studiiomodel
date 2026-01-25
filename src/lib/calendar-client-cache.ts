export type CalendarReferenceData = {
  clients: any[];
  services: any[];
  teamMembers: any[];
  agents: any[];
};

type CacheEntry<T> = { ts: number; data: T };

const TTL_MS = 60_000; // ok to be slightly stale for instant back-nav

const referenceCache = new Map<string, CacheEntry<CalendarReferenceData>>();
const bookingsRangeCache = new Map<string, CacheEntry<any[]>>();
const bookingsRangeInflight = new Map<string, Promise<any[]>>();
const snapshotCache = new Map<string, CacheEntry<any[]>>();
const lastRangeCache = new Map<string, CacheEntry<{ start: string; end: string }>>();

function isFresh(ts: number) {
  return Date.now() - ts <= TTL_MS;
}

export function calendarScopeKey(params: {
  tenantTimezone?: string | null;
  calendarSecret?: string | null;
  role?: string | null;
  clientId?: string | null;
  agentId?: string | null;
  teamMemberId?: string | null;
}) {
  const {
    tenantTimezone = "",
    calendarSecret = "",
    role = "",
    clientId = "",
    agentId = "",
    teamMemberId = "",
  } = params || {};
  return [
    "cal",
    String(tenantTimezone || ""),
    String(calendarSecret || ""),
    String(role || ""),
    String(clientId || ""),
    String(agentId || ""),
    String(teamMemberId || ""),
  ].join("|");
}

export function getCachedReference(scopeKey: string): CalendarReferenceData | null {
  const hit = referenceCache.get(scopeKey);
  if (!hit) return null;
  if (!isFresh(hit.ts)) return null;
  return hit.data;
}

export function setCachedReference(scopeKey: string, data: CalendarReferenceData) {
  referenceCache.set(scopeKey, { ts: Date.now(), data });
}

export function getCachedRange(scopeKey: string, startIso: string, endIso: string): any[] | null {
  const key = `${scopeKey}|${startIso}|${endIso}`;
  const hit = bookingsRangeCache.get(key);
  if (!hit) return null;
  if (!isFresh(hit.ts)) return null;
  return hit.data;
}

export function getInflightRange(scopeKey: string, startIso: string, endIso: string): Promise<any[]> | null {
  const key = `${scopeKey}|${startIso}|${endIso}`;
  return bookingsRangeInflight.get(key) || null;
}

export function setInflightRange(scopeKey: string, startIso: string, endIso: string, p: Promise<any[]>) {
  const key = `${scopeKey}|${startIso}|${endIso}`;
  bookingsRangeInflight.set(key, p);
}

export function setCachedRange(scopeKey: string, startIso: string, endIso: string, items: any[]) {
  const key = `${scopeKey}|${startIso}|${endIso}`;
  bookingsRangeCache.set(key, { ts: Date.now(), data: items });
  bookingsRangeInflight.delete(key);
}

export function clearCachedBookingId(scopeKey: string, bookingId: string) {
  const id = String(bookingId || "");
  if (!id) return;

  // Remove from all cached ranges for this scope
  for (const [k, entry] of bookingsRangeCache.entries()) {
    if (!k.startsWith(`${scopeKey}|`)) continue;
    const next = (entry.data || []).filter((b: any) => String(b?.id) !== id);
    bookingsRangeCache.set(k, { ts: entry.ts, data: next });
  }

  // Remove from snapshot
  const snap = snapshotCache.get(scopeKey);
  if (snap) {
    snapshotCache.set(scopeKey, { ts: snap.ts, data: (snap.data || []).filter((b: any) => String(b?.id) !== id) });
  }
}

export function setSnapshot(scopeKey: string, bookings: any[]) {
  snapshotCache.set(scopeKey, { ts: Date.now(), data: bookings });
}

export function getSnapshot(scopeKey: string): any[] | null {
  const hit = snapshotCache.get(scopeKey);
  if (!hit) return null;
  if (!isFresh(hit.ts)) return null;
  return hit.data;
}

export function setLastRange(scopeKey: string, startIso: string, endIso: string) {
  lastRangeCache.set(scopeKey, { ts: Date.now(), data: { start: startIso, end: endIso } });
}

export function getLastRange(scopeKey: string): { start: string; end: string } | null {
  const hit = lastRangeCache.get(scopeKey);
  if (!hit) return null;
  if (!isFresh(hit.ts)) return null;
  return hit.data;
}

