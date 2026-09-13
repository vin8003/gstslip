import { Check, LoaderCircle, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { openRazorpayCheckout } from "@/lib/billing/checkout";
import { PLAN_PRICE_INR, type BillingSnapshot } from "@/lib/billing/plan";
import { markPaywallReturn, PAYWALL_RETURN_PATH } from "@/lib/billing/paywall-return";
import {
  confirmCheckout,
  getEntitlement,
  isUnauthorized,
  startSubscription,
} from "@/lib/billing/store";
import { FREE_CAPTURES } from "@/lib/gst";
import {
  CANONICAL_APP_HOST,
  PAYMENT_APP_HOST,
} from "@/lib/public-origins";

type Step = "plan" | "done";

function formatDay(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function failMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message && !/unauthorized/i.test(err.message)) return err.message;
  return fallback;
}

export function Paywall({
  open,
  onOpenChange,
  onUnlock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: (snap: BillingSnapshot) => void;
}) {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [step, setStep] = useState<Step>("plan");
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<BillingSnapshot | null>(null);
  const signedIn = Boolean(user) && !user?.isDevFallback;

  useEffect(() => {
    if (!open || !signedIn) return;
    getEntitlement()
      .then((next) => {
        setSnap(next);
        if (next.isPro) setStep("done");
      })
      .catch((err) => {
        if (isUnauthorized(err)) return;
      });
  }, [open, signedIn]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setStep("plan");
      setBusy(false);
    }
    onOpenChange(next);
  }

  function goSignIn() {
    markPaywallReturn();
    handleOpenChange(false);
    if (typeof window !== "undefined" && window.location.hostname === CANONICAL_APP_HOST) {
      window.location.assign(
        `https://${PAYMENT_APP_HOST}/login?next=${encodeURIComponent(PAYWALL_RETURN_PATH)}`,
      );
      return;
    }
    void navigate({ to: "/login", search: { next: PAYWALL_RETURN_PATH } });
  }

  async function subscribe() {
    if (!signedIn) {
      goSignIn();
      return;
    }
    if (typeof window !== "undefined" && window.location.hostname === CANONICAL_APP_HOST) {
      window.location.assign(
        `/api/session-bridge?next=${encodeURIComponent(PAYWALL_RETURN_PATH)}&to=${PAYMENT_APP_HOST}`,
      );
      return;
    }
    setBusy(true);
    try {
      const result = await startSubscription();
      setSnap(result.snap);
      if (result.kind === "unset") {
        toast.error("Payments are not connected yet. Pro cannot take money until they are.");
        return;
      }
      if (result.kind === "preview" || result.kind === "active") {
        setStep("done");
        onUnlock(result.snap);
        return;
      }
      if (result.kind === "covered") {
        setStep("done");
        onUnlock(result.snap);
        toast.message(`Pro stays on until ${formatDay(result.snap.periodEnd)}.`);
        return;
      }
      const paid = await openRazorpayCheckout(result.checkout);
      if (!paid) {
        toast.message("Payment cancelled. Pro did not unlock.");
        return;
      }
      const next = await confirmCheckout({ data: paid });
      setSnap(next);
      setStep("done");
      onUnlock(next);
    } catch (err) {
      if (isUnauthorized(err)) {
        goSignIn();
        return;
      }
      toast.error(failMessage(err, "Could not open payment."));
    } finally {
      setBusy(false);
    }
  }

  const live = Boolean(snap?.paymentsLive);
  const cta = !signedIn
    ? "Sign in to upgrade"
    : busy
      ? live
        ? "Opening Razorpay…"
        : "Unlocking…"
      : live
        ? `Pay ₹${PLAN_PRICE_INR}`
        : "Unlock Pro on this preview";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-0">
        {step === "plan" ? (
          <div className="p-5">
            <DialogHeader>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-sage">
                GSTSlip Pro
              </p>
              <DialogTitle>Unlimited invoice captures</DialogTitle>
              <DialogDescription>
                The free plan includes {FREE_CAPTURES} documents. Pro keeps the
                same register, without the cap.
              </DialogDescription>
            </DialogHeader>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                "Unlimited photo and PDF captures",
                "Editable GST register and CSV export",
                "Works on intra-state and IGST invoices",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-accent text-ok">
                    <Check className="size-3" strokeWidth={2.5} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-end justify-between rounded-lg bg-muted px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Each payment
                </p>
                <p className="font-display text-3xl font-medium tabular-nums tracking-tight">
                  ₹{PLAN_PRICE_INR}
                </p>
              </div>
              <p className="pb-1 text-sm text-muted-foreground">for 30 days</p>
            </div>
            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={busy || isPending}
              onClick={() => void subscribe()}
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {cta}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <Shield className="size-3.5 shrink-0" />
              {!signedIn
                ? "Sign in to buy Pro. Capture still works without an account."
                : live
                  ? snap?.paymentsMode === "test"
                    ? "Razorpay test mode. Use test cards, not live UPI."
                    : "UPI, card, or netbanking. This charges a real ₹499. Test cards fail on live keys."
                  : "This preview records Pro on your account. No charge is made until Razorpay is connected."}
            </p>
          </div>
        ) : null}

        {step === "done" ? (
          <div className="p-5 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-ok">
              <Check className="size-6" strokeWidth={2.25} />
            </div>
            <DialogHeader className="mt-4 items-center pr-0">
              <DialogTitle>GSTSlip Pro is on</DialogTitle>
              <DialogDescription>
                {snap?.periodEnd
                  ? `Unlimited captures until ${formatDay(snap.periodEnd)}.`
                  : "Unlimited captures are unlocked on this account."}
              </DialogDescription>
            </DialogHeader>
            <Button className="mt-6 w-full" onClick={() => handleOpenChange(false)}>
              Back to the register
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
