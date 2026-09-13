import { paymentsModeFrom, readRazorpayKeys, type PaymentsMode } from "./credentials";

export type { PaymentsMode };

/** True when Razorpay Key Id + Key Secret are in the process env. Safe on the client (always false there). */
export function paymentsLive(): boolean {
  return paymentsMode() !== "off";
}

export function paymentsMode(): PaymentsMode {
  if (typeof process === "undefined") return "off";
  return paymentsModeFrom(readRazorpayKeys());
}
