import { useEffect, useState } from "react";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { SlipMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "Sign in · GSTSlip" }],
  }),
});

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Sign in · GSTSlip";
  }, []);

  if (isPending) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </main>
    );
  }

  if (user) return <Navigate to="/" />;

  async function handleProvider(providerId: string) {
    setBusy(providerId);
    try {
      await signIn(providerId, { callbackURL: "/", errorCallbackURL: "/login" });
    } catch (error) {
      setBusy(null);
      toast.error(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2.5">
        <SlipMark />
        <div>
          <p className="font-display text-lg font-medium leading-tight">GSTSlip</p>
          <p className="text-xs text-muted-foreground">India GST invoice capture</p>
        </div>
      </div>
      <section className="rounded-xl border border-border bg-card p-5 shadow-border">
        <h1 className="font-display text-2xl font-medium tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your Google or X account. The register stays on this device until you sign in.
        </p>
        {authEnabled ? (
          <div className="mt-5 flex flex-col gap-2">
            {GROK_PROVIDERS.map((provider) => (
              <Button
                key={provider.providerId}
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void handleProvider(provider.providerId)}
              >
                {busy === provider.providerId
                  ? `Continuing with ${provider.label}…`
                  : `Continue with ${provider.label}`}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            Sign-in is turned off in this environment.
          </p>
        )}
      </section>
      <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to the register
      </Link>
    </main>
  );
}
