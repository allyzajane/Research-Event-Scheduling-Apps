/**
 * Arabia Standard Time (AST) — UTC+3 — Asia/Riyadh
 * This application is Saudi Arabia-only. All date/time display is fixed to AST.
 * No device timezone detection. No user timezone preference.
 */

const TZ = "Asia/Riyadh"; // UTC+3, no DST

// ─── Core formatters ──────────────────────────────────────────────────────────

export function formatDateAST(date: string | Date | number, lang: "en" | "ar" = "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTimeAST(date: string | Date | number, lang: "en" | "ar" = "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDateLongAST(date: string | Date | number, lang: "en" | "ar" = "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatTimeAST(date: string | Date | number, lang: "en" | "ar" = "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

// ─── AST date string (YYYY-MM-DD) — for comparisons ─────────────────────────

export function getASTDateStr(date: Date | string | number = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ─── Calendar input helpers ───────────────────────────────────────────────────

/**
 * Convert a UTC ISO string → "YYYY-MM-DDTHH:MM" in AST
 * Use this to populate datetime-local inputs.
 */
export function toInputDateTimeAST(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  // AST = UTC+3: shift forward 3 hours
  const ast = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return ast.toISOString().slice(0, 16);
}

/**
 * Convert a "YYYY-MM-DDTHH:MM" AST input value → UTC ISO string
 * Use this when submitting datetime-local form values to the API.
 */
export function fromInputDateTimeAST(localStr: string): string {
  if (!localStr) return "";
  // Parse as UTC literal, then subtract 3 hours to get actual UTC
  const asUtc = new Date(localStr + ":00.000Z");
  return new Date(asUtc.getTime() - 3 * 60 * 60 * 1000).toISOString();
}

// ─── Greeting based on AST hour ───────────────────────────────────────────────

function getASTHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
    10
  );
}

export function getGreeting(isAr: boolean): string {
  const h = getASTHour();
  if (h >= 5 && h < 12) return isAr ? "صباح الخير"  : "Good morning";
  if (h >= 12 && h < 17) return isAr ? "مرحباً"      : "Good afternoon";
  if (h >= 17 && h < 21) return isAr ? "مساء الخير"  : "Good evening";
  return isAr ? "طيبة ليلتك" : "Good night";
}

// ─── Time-ago (calculation is timezone-agnostic, display uses AST date) ───────

export function timeAgoAST(dateStr: string, isAr: boolean = false): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins  < 1)  return isAr ? "الآن"         : "Just now";
  if (mins  < 60) return isAr ? `${mins} د`    : `${mins}m`;
  if (hours < 24) return isAr ? `${hours} س`   : `${hours}h`;
  if (days  < 7)  return isAr ? `${days} ي`    : `${days}d`;
  return formatDateAST(dateStr, isAr ? "ar" : "en");
}
