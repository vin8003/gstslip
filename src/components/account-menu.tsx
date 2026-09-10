import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const subscribeToNothing = () => () => {};

export function AccountMenu() {
  const { user, isPending } = useCurrentUserState();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isPending) {
    return <div className="size-9 rounded-full bg-muted" aria-hidden="true" />;
  }

  if (!user) {
    if (!authEnabled) return null;
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }

  const label = user.displayName ?? user.primaryEmail ?? "Account";
  const initial = label.charAt(0).toUpperCase();
  const canSignOut = authEnabled && !gateSession && !user.isDevFallback;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-border bg-card py-0.5 pl-0.5 pr-2 shadow-border hover:shadow-border-hover"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="size-8 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {initial}
          </span>
        )}
        <span className="hidden max-w-[9rem] truncate text-sm font-medium sm:inline">
          {label}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 rounded-lg border border-border bg-card p-1.5 shadow-border"
        >
          <p className="truncate px-2.5 py-1.5 text-sm font-medium">{label}</p>
          {user.primaryEmail ? (
            <p className="truncate px-2.5 pb-2 text-xs text-muted-foreground">
              {user.primaryEmail}
            </p>
          ) : null}
          <Link
            to="/profile"
            role="menuitem"
            className="block rounded-md px-2.5 py-2 text-sm hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          {canSignOut ? (
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              className="block w-full rounded-md px-2.5 py-2 text-left text-sm text-destructive hover:bg-muted disabled:opacity-50"
              onClick={() => {
                setSigningOut(true);
                void signOut("/").catch(() => {
                  setSigningOut(false);
                  toast.error("Could not sign out. Try again.");
                });
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
