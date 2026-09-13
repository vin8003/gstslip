import { useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const subscribeToNothing = () => () => {};

export function AccountBar() {
  const { user, isPending } = useCurrentUserState();
  const [signingOut, setSigningOut] = useState(false);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    () => false,
  );

  if (isPending) {
    return <div className="h-9 w-44 shrink-0 rounded-md bg-muted" aria-hidden="true" />;
  }

  const signedIn = Boolean(user) && !user?.isDevFallback;
  const canSignOut = signedIn && authEnabled && !gateSession;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button variant={signedIn ? "ghost" : "outline"} size="sm" asChild>
        <Link to={signedIn ? "/profile" : "/login"}>
          {user?.profileImageUrl && signedIn ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="size-5 rounded-full object-cover"
            />
          ) : (
            <UserRound className="size-4" />
          )}
          Profile
        </Link>
      </Button>
      {canSignOut ? (
        <Button
          variant="outline"
          size="sm"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut("/").catch(() => {
              setSigningOut(false);
              toast.error("Could not sign out. Try again.");
            });
          }}
        >
          <LogOut className="size-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      ) : signedIn ? null : (
        <Button variant="ghost" size="sm" asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      )}
    </div>
  );
}
