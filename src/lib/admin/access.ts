/** Operator allowlist + preview-desk rules. Never log emails from callers. */

const EMAIL_NAMES = ["GSTSLIP_ADMIN_EMAILS", "ADMIN_EMAILS", "GSTSLIP_ADMIN_EMAIL"] as const;

function envValue(source: Record<string, string | undefined> | undefined, name: string): string {
  if (source) return String(source[name] ?? "");
  if (typeof process === "undefined" || !process.env) return "";
  return String(process.env[name] ?? "");
}

export function readAdminEmails(source?: Record<string, string | undefined>): string[] {
  let raw = "";
  for (const name of EMAIL_NAMES) {
    const value = envValue(source, name).trim();
    if (value) {
      raw = value;
      break;
    }
  }
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export function isPreviewOperatorMode(source?: Record<string, string | undefined>): boolean {
  return !envValue(source, "DATABASE_URL").trim();
}

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Production (Neon): only allowlisted emails.
 * Preview (PGLite, no DATABASE_URL): any signed-in session is the operator,
 * so the desk is playable before secrets are set.
 */
export function isAdminEmail(
  email: string | null | undefined,
  source?: Record<string, string | undefined>,
): boolean {
  const list = readAdminEmails(source);
  const normalized = normalizeEmail(email);
  if (normalized && list.includes(normalized)) return true;
  if (list.length === 0 && isPreviewOperatorMode(source)) return true;
  return false;
}

export function extendPeriodEnd(currentEnd: string | null, now = new Date(), days = 30): string {
  const current = currentEnd ? new Date(currentEnd) : null;
  const from = current && !Number.isNaN(current.getTime()) && current.getTime() > now.getTime() ? current : now;
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export function grantSource(orderId: string | null): "razorpay" | "desk" | "none" {
  if (!orderId) return "none";
  if (orderId.startsWith("desk_")) return "desk";
  return "razorpay";
}
