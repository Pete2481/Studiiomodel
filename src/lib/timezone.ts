/**
 * Returns a Date representing the start of "today" in the provided IANA time zone.
 *
 * Why this exists:
 * - We need a stable "today" boundary in tenant timezone (e.g. Australia/Sydney)
 * - We avoid adding new dependencies (date-fns-tz, luxon) for this.
 */
export function startOfTodayInTimeZone(timeZone: string): Date {
  const now = new Date();

  // "en-CA" yields YYYY-MM-DD which is easy to parse reliably.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [y, m, d] = ymd.split("-").map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));

  // Figure out what local time that UTC midnight corresponds to in the target timezone.
  // This gives us the offset at that boundary (handles DST).
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcMidnight);

  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const ss = Number(parts.find((p) => p.type === "second")?.value ?? "0");

  // Subtract the timezone-local clock time at UTC midnight to land on timezone midnight in UTC.
  return new Date(utcMidnight.getTime() - (hh * 3600 + mm * 60 + ss) * 1000);
}


