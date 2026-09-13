import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { SlipMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { isCustomAppHost, safeNextPath, socialStartUrl } from "@/lib/public-origins";

function parseMode(value: unknown): "signup" | undefined {
  return value === "signup" ? "signup" : undefined;
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { next?: string; mode?: "signup" } => ({
    next: safeNextPath(search.next),
    mode: parseMode(search.mode),
  }),
  head: () => ({
    meta: [{ title: "Sign in · GSTSlip" }],
  }),
});

function LoginPage() {
  const { next, mode } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const signingUp = mode === "signup";
  const callbackURL = next ?? "/profile";
  const resumeUpgrade =
    Boolean(user && !user.isDevFallback && next && next.includes("upgrade=1"));

  useEffect(() => {
    document.title = signingUp ? "Create account · GSTSlip" : "Sign in · GSTSlip";
  }, [signingUp]);

  useEffect(() => {
    if (resumeUpgrade && next) window.location.replace(next);
  }, [resumeUpgrade, next]);

  if (isPending || resumeUpgrade) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <LoaderCircle className="size-6 animate-spin text-sage" aria-label="Checking session" />
      </main>
    );
  }

  if (user && !user.isDevFallback) {
    if (next === "/") return <Navigate to="/" />;
    if (next === "/admin") return <Navigate to="/admin" />;
    return <Navigate to="/profile" />;
  }

  function finish(path: string) {
    window.location.assign(path);
  }

  function authError(error: unknown, fallback: string): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message?: unknown }).message ?? "").trim();
      if (message) return message;
    }
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  }

  async function handleProvider(providerId: string) {
    setBusy(providerId);
    try {
      if (typeof window !== "undefined" && isCustomAppHost(window.location.hostname)) {
        window.location.assign(
          socialStartUrl({
            providerId,
            next: callbackURL,
            returnHost: window.location.hostname,
          }),
        );
        return;
      }
      await signIn(providerId, { callbackURL, errorCallbackURL: "/login" });
    } catch (error) {
      setBusy(null);
      toast.error(error instanceof Error ? error.message : "Sign-in failed.");
    }
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    if (!trimmedEmail || !password) {
      toast.error("Enter email and password.");
      return;
    }
    if (signingUp) {
      if (trimmedName.length < 2) {
        toast.error("Enter your name.");
        return;
      }
      if (password.length < 8) {
        toast.error("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        toast.error("Passwords do not match.");
        return;
      }
    }
    setBusy("email");
    try {
      if (signingUp) {
        const { error } = await authClient.signUp.email({
          name: trimmedName,
          email: trimmedEmail,
          password,
          callbackURL,
        });
        if (error) throw error;
        toast.success("Account created.");
      } else {
        const { error } = await authClient.signIn.email({
          email: trimmedEmail,
          password,
          callbackURL,
        });
        if (error) throw error;
      }
      try {
        await authClient.getSession();
      } catch {
        /* session store recovers on the next page */
      }
      finish(callbackURL);
    } catch (error) {
      setBusy(null);
      toast.error(authError(error, signingUp ? "Could not create the account." : "Could not sign in."));
    }
  }

  const locked = busy !== null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Link to="/" className="flex items-center gap-2.5">
        <SlipMark />
        <div>
          <p className="font-display text-lg font-medium leading-tight">GSTSlip</p>
          <p className="text-xs text-muted-foreground">India GST invoice capture</p>
        </div>
      </Link>
      <section className="rounded-xl border border-border bg-card p-5 shadow-border">
        <h1 className="font-display text-2xl font-medium tracking-tight">
          {signingUp ? "Create an account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {signingUp
            ? "Register with email. Verify once to use the 10 free captures on this account. Invoice rows stay on this device."
            : "Email, Google, or X. Signed-out capture counts against this network address. Sign-in does not reset the free quota. Invoice rows stay on this device."}
        </p>

        {authEnabled ? (
          <>
            <form className="mt-5 space-y-3" onSubmit={(event) => void handleEmail(event)}>
              {signingUp ? (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-name">Name</Label>
                  <Input
                    id="auth-name"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={locked}
                    required
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={locked}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={signingUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={locked}
                  minLength={signingUp ? 8 : undefined}
                  required
                />
                {signingUp ? (
                  <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                ) : null}
              </div>
              {signingUp ? (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-confirm">Confirm password</Label>
                  <Input
                    id="auth-confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    disabled={locked}
                    minLength={8}
                    required
                  />
                </div>
              ) : null}
              <Button type="submit" className="h-12 w-full" disabled={locked}>
                {busy === "email" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {busy === "email"
                  ? signingUp
                    ? "Creating account…"
                    : "Signing in…"
                  : signingUp
                    ? "Create account"
                    : "Sign in with email"}
              </Button>
            </form>

            <p className="mt-3 text-center text-sm text-muted-foreground">
              {signingUp ? "Already have an account?" : "New to GSTSlip?"}{" "}
              <Link
                to="/login"
                search={{ next, mode: signingUp ? undefined : "signup" }}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {signingUp ? "Sign in" : "Create an account"}
              </Link>
            </p>

            <div className="my-5 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <div className="flex flex-col gap-2">
              {GROK_PROVIDERS.map((provider) => (
                <Button
                  key={provider.providerId}
                  type="button"
                  variant="outline"
                  className="h-12"
                  disabled={locked}
                  onClick={() => void handleProvider(provider.providerId)}
                >
                  {busy === provider.providerId ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  {busy === provider.providerId
                    ? `Continuing with ${provider.label}…`
                    : `Continue with ${provider.label}`}
                </Button>
              ))}
            </div>
          </>
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
