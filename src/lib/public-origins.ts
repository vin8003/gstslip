/**
 * Public hosts this app is served on. Custom-domain social login must bounce
 * through the canonical grok.me host because the Grok broker's redirect_uri
 * and `__Host-` cookies are bound there. Razorpay live Checkout is registered
 * against the custom domain and must run there.
 */
export const CANONICAL_APP_HOST = "gstslip.grok.me";
export const PAYMENT_APP_HOST = "gstslip.vin8003.com";
export const CUSTOM_APP_HOSTS = [PAYMENT_APP_HOST] as const;

export const PUBLIC_APP_HOSTS: readonly string[] = [CANONICAL_APP_HOST, ...CUSTOM_APP_HOSTS];
export const PUBLIC_APP_ORIGINS: string[] = PUBLIC_APP_HOSTS.map((host) => `https://${host}`);

function hostnameOf(host: string): string {
  return host.trim().toLowerCase().split(":")[0] ?? "";
}

export function isCustomAppHost(host: string): boolean {
  return (CUSTOM_APP_HOSTS as readonly string[]).includes(hostnameOf(host));
}

export function isPaymentAppHost(host: string): boolean {
  return hostnameOf(host) === PAYMENT_APP_HOST;
}

export function isPublicAppHost(host: string): boolean {
  return PUBLIC_APP_HOSTS.includes(hostnameOf(host));
}

export function paymentOrigin(): string {
  return `https://${PAYMENT_APP_HOST}`;
}

/** Reopen the paywall after a cross-host bounce (sessionStorage does not follow). */
export const PAYWALL_RETURN_PATH = "/?upgrade=1";

/** Same-origin path only — used for post-login redirects and the OAuth bounce. */
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return undefined;
  if (next.includes("://")) return undefined;
  return next;
}

export function socialStartUrl(opts: {
  providerId: string;
  next: string;
  returnHost: string;
}): string {
  const params = new URLSearchParams({
    provider: opts.providerId,
    next: opts.next,
    to: opts.returnHost,
  });
  return `https://${CANONICAL_APP_HOST}/api/social-start?${params.toString()}`;
}
