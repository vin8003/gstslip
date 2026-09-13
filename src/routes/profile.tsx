import { useEffect, useState, useSyncExternalStore } from "react";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { SlipMark } from "@/components/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { BillingSnapshot } from "@/lib/billing/plan";
import { markPaywallReturn } from "@/lib/billing/paywall-return";
import { cancelSubscription, getEntitlement, isUnauthorized } from "@/lib/billing/store";
import { FREE_CAPTURES, remainingCaptures } from "@/lib/gst";
import { useGstStore } from "@/lib/store";

const subscribeToNothing = () => () => {};

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [{ title: "Profile · GSTSlip" }],
  }),
});

function formatDay(iso: string | null): string {
  if (!iso) return "—";
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

function ProfilePage() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const capturesUsed = useGstStore((state) => state.capturesUsed);
  const isPro = useGstStore((state) => state.isPro);
  const setPro = useGstStore((state) => state.setPro);
  const [signingOut, setSigningOut] = useState(false);
  const [busyPlan, setBusyPlan] = useState(false);
  const [snap, setSnap] = useState<BillingSnapshot | null>(null);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    () => false,
  );
  const canSignOut = Boolean(user) && authEnabled && !gateSession && !user?.isDevFallback;
  const signedIn = Boolean(user) && !user?.isDevFallback;

  useEffect(() => {
    if (!signedIn) return;
    getEntitlement()
      .then((next) => {
        setSnap(next);
        setPro(next.isPro);
      })
      .catch((err) => {
        if (isUnauthorized(err)) navigate({ to: "/login" });
      });
  }, [signedIn, navigate, setPro]);

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <LoaderCircle className="size-6 animate-spin text-sage" aria-label="Loading profile" />
      </main>
    );
  }

  if (!user) return <Navigate to="/login" />;

  const pro = snap?.isPro ?? isPro;
  const remaining = remainingCaptures(capturesUsed, pro);
  const label = user.displayName ?? user.primaryEmail ?? "GSTSlip account";

  function goUpgrade() {
    markPaywallReturn();
    void navigate({ to: "/" });
  }

  async function cancelPlan() {
    if (!window.confirm("Cancel GSTSlip Pro? Access stays until the current 30 days end. There is no auto-debit.")) {
      return;
    }
    setBusyPlan(true);
    try {
      const next = await cancelSubscription();
      setSnap(next);
      setPro(next.isPro);
      toast.success(
        next.periodEnd
          ? `Cancelled. Pro stays on until ${formatDay(next.periodEnd)}.`
          : "Cancelled.",
      );
    } catch (err) {
      if (isUnauthorized(err)) navigate({ to: "/login" });
      else toast.error(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusyPlan(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5">
          <SlipMark />
          <div>
            <p className="font-display text-lg font-medium leading-tight">GSTSlip</p>
            <p className="text-xs text-muted-foreground">Profile</p>
          </div>
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">Register</Link>
        </Button>
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-border">
        <div className="flex items-center gap-4">
          {user.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-primary font-display text-2xl text-primary-foreground">
              {label.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-medium tracking-tight">{label}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {user.primaryEmail ?? "No email on this session"}
            </p>
            {pro ? (
              <Badge className="mt-2">Pro</Badge>
            ) : (
              <Badge variant="muted" className="mt-2">
                Free
              </Badge>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-xs text-muted-foreground">Plan</dt>
            <dd className="font-medium">
              {snap?.status === "cancelled" && pro
                ? "Pro · cancelled"
                : pro
                  ? "GSTSlip Pro"
                  : "Free"}
            </dd>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-xs text-muted-foreground">{pro ? "Access until" : "Captures"}</dt>
            <dd className="font-medium">
              {pro
                ? formatDay(snap?.periodEnd ?? null)
                : `${Math.min(capturesUsed, FREE_CAPTURES)} of ${FREE_CAPTURES}`}
            </dd>
          </div>
        </dl>

        {user.isDevFallback ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Local preview user. Sign-in providers are off in this environment.
          </p>
        ) : null}

        {!pro && remaining !== Number.POSITIVE_INFINITY ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {remaining} free capture{remaining === 1 ? "" : "s"} left on this device.
          </p>
        ) : null}

        {pro && snap?.status === "active" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            ₹{snap.priceInr} covers 30 days. There is no auto-debit. Cancel keeps
            access until {formatDay(snap.periodEnd)}.
          </p>
        ) : null}

        {signedIn && !pro ? (
          <Button className="mt-5 h-12 w-full" disabled={busyPlan} onClick={goUpgrade}>
            Upgrade to Pro
          </Button>
        ) : null}

        {signedIn && snap?.status === "active" ? (
          <Button
            className="mt-5 h-12 w-full"
            variant="outline"
            disabled={busyPlan}
            onClick={() => void cancelPlan()}
          >
            {busyPlan ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Cancel Pro
          </Button>
        ) : null}

        {canSignOut ? (
          <Button
            className="mt-3 h-12 w-full"
            variant="outline"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut("/").catch(() => {
                setSigningOut(false);
                toast.error("Could not sign out. Try again.");
              });
            }}
          >
            {signingOut ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        ) : null}

        <p className="mt-4 text-xs text-muted-foreground">
          Invoice rows stay on this browser until you export. Signing out does not
          delete the local register.
        </p>
      </section>
    </main>
  );
}
