import { useState } from "react";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { SlipMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FREE_CAPTURES, remainingCaptures } from "@/lib/gst";
import { useGstStore } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [{ title: "Profile · GSTSlip" }],
  }),
});

function ProfilePage() {
  const { user, isPending } = useCurrentUserState();
  const capturesUsed = useGstStore((state) => state.capturesUsed);
  const isPro = useGstStore((state) => state.isPro);
  const [signingOut, setSigningOut] = useState(false);
  const gateSession = typeof document !== "undefined" && hasGateSessionMarker();
  const canSignOut = Boolean(user) && authEnabled && !gateSession && !user?.isDevFallback;

  if (isPending) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" />;

  const remaining = remainingCaptures(capturesUsed, isPro);

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
        <div className="flex items-center gap-3">
          {user.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="size-14 rounded-full object-cover"
            />
          ) : (
            <span className="grid size-14 place-items-center rounded-full bg-primary text-lg font-medium text-primary-foreground">
              {(user.displayName ?? user.primaryEmail ?? "A").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-medium tracking-tight">
              {user.displayName ?? "GSTSlip account"}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {user.primaryEmail ?? "No email on this session"}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-xs text-muted-foreground">Plan</dt>
            <dd className="font-medium">{isPro ? "Pro" : "Free"}</dd>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-xs text-muted-foreground">Captures</dt>
            <dd className="font-medium">
              {isPro
                ? `${capturesUsed} used`
                : `${Math.min(capturesUsed, FREE_CAPTURES)} of ${FREE_CAPTURES}`}
            </dd>
          </div>
        </dl>
        {user.isDevFallback ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Local preview user. Sign-in providers are off in this environment.
          </p>
        ) : null}
        {!isPro && remaining !== Number.POSITIVE_INFINITY ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {remaining} free capture{remaining === 1 ? "" : "s"} left on this device.
          </p>
        ) : null}
        {canSignOut ? (
          <Button
            className="mt-5"
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
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        ) : null}
      </section>
    </main>
  );
}
