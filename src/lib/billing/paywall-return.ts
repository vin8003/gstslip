import { PAYWALL_RETURN_PATH } from "@/lib/public-origins";

const KEY = "gstslip.openPaywall";

export function markPaywallReturn(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* quota / private mode */
  }
}

export function consumePaywallReturn(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const hit = sessionStorage.getItem(KEY) === "1";
    if (hit) sessionStorage.removeItem(KEY);
    return hit;
  } catch {
    return false;
  }
}

/** Cross-host bounce uses `?upgrade=1` because sessionStorage is origin-bound. */
export function consumeUpgradeQuery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("upgrade") !== "1") return false;
    url.searchParams.delete("upgrade");
    const qs = url.searchParams.toString();
    const next = `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`;
    window.history.replaceState({}, "", next || "/");
    return true;
  } catch {
    return window.location.search.includes("upgrade=1");
  }
}

export { PAYWALL_RETURN_PATH };
