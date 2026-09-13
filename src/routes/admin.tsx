import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { SlipMark } from "@/components/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  adminCancelPro,
  adminGrantPro,
  getAdminDesk,
  isForbidden,
  type DeskAccount,
  type DeskPayload,
} from "@/lib/admin/desk";
import { isUnauthorized } from "@/lib/billing/store";

export const Route = createFileRoute("/admin")({
  component: AdminDeskPage,
  head: () => ({
    meta: [{ title: "Admin desk · GSTSlip" }],
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

function planBadge(account: DeskAccount) {
  if (account.isPro && account.status === "cancelled") {
    return <Badge variant="warn">Pro · cancelled</Badge>;
  }
  if (account.isPro) return <Badge>Pro</Badge>;
  if (account.status === "expired") return <Badge variant="muted">Expired</Badge>;
  return <Badge variant="muted">Free</Badge>;
}

function paymentLabel(account: DeskAccount): string {
  if (account.grantSource === "desk") return "Desk grant";
  if (account.grantSource === "razorpay") {
    const id = account.paymentId || account.orderId || "";
    return id ? `Razorpay · ${id.slice(-8)}` : "Razorpay";
  }
  return "No payment";
}

function AdminDeskPage() {
  const { user, isPending } = useCurrentUserState();
  const [query, setQuery] = useState("");
  const [desk, setDesk] = useState<DeskPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const signedIn = Boolean(user) && !user?.isDevFallback;

  async function load(nextQuery = query) {
    setLoading(true);
    try {
      const payload = await getAdminDesk({ data: { q: nextQuery } });
      setDesk(payload);
    } catch (err) {
      if (isUnauthorized(err)) {
        setDesk(null);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not load the desk.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!signedIn) return;
    void load("");
    // First paint only — search submits separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const stats = desk?.stats;
  const accounts = useMemo(() => desk?.accounts ?? [], [desk]);

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <LoaderCircle className="size-6 animate-spin text-sage" aria-label="Loading desk" />
      </main>
    );
  }

  if (!signedIn) {
    return <Navigate to="/login" search={{ next: "/admin" }} />;
  }

  async function grant(account: DeskAccount) {
    if (
      !window.confirm(
        `Grant 30 days of GSTSlip Pro to ${account.email || account.name}? This does not charge Razorpay.`,
      )
    ) {
      return;
    }
    setBusyId(account.userId);
    try {
      const next = await adminGrantPro({ data: { userId: account.userId } });
      setDesk((current) => {
        if (!current) return current;
        const accounts = current.accounts.map((row) => (row.userId === next.userId ? next : row));
        return { ...current, accounts };
      });
      toast.success(`Pro until ${formatDay(next.periodEnd)}.`);
      void load(query);
    } catch (err) {
      if (isForbidden(err)) toast.error("This desk is for GSTSlip operators.");
      else toast.error(err instanceof Error ? err.message : "Could not grant Pro.");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(account: DeskAccount) {
    if (
      !window.confirm(
        `Cancel Pro for ${account.email || account.name}? Access stays until the current 30 days end.`,
      )
    ) {
      return;
    }
    setBusyId(account.userId);
    try {
      const next = await adminCancelPro({ data: { userId: account.userId } });
      setDesk((current) => {
        if (!current) return current;
        return {
          ...current,
          accounts: current.accounts.map((row) => (row.userId === next.userId ? next : row)),
        };
      });
      toast.success(
        next.periodEnd ? `Cancelled. Pro stays on until ${formatDay(next.periodEnd)}.` : "Cancelled.",
      );
      void load(query);
    } catch (err) {
      if (isForbidden(err)) toast.error("This desk is for GSTSlip operators.");
      else toast.error(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <SlipMark />
          <div className="min-w-0">
            <p className="font-display text-lg font-medium leading-tight">GSTSlip</p>
            <p className="text-xs text-muted-foreground">Admin desk</p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/profile">Profile</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">Register</Link>
          </Button>
        </div>
      </div>

      {loading && !desk ? (
        <div className="grid place-items-center py-16">
          <LoaderCircle className="size-6 animate-spin text-sage" aria-label="Loading accounts" />
        </div>
      ) : desk && !desk.allowed ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-border">
          <h1 className="font-display text-2xl font-medium tracking-tight">Operator only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This desk lists GSTSlip accounts and Pro. It is limited to operator
            emails. Invoice rows stay on each person’s device.
          </p>
        </section>
      ) : desk ? (
        <>
          <section className="rounded-xl border border-border bg-card p-5 shadow-border">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-medium tracking-tight">Admin desk</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Accounts and GSTSlip Pro. Capture still lives on each device.
                </p>
              </div>
              <Badge variant={desk.paymentsMode === "live" ? "ok" : desk.paymentsMode === "test" ? "warn" : "muted"}>
                Razorpay {desk.paymentsMode}
              </Badge>
            </div>
            {desk.previewOperator ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Preview desk — any signed-in account can operate here. Live
                gstslip.vin8003.com only allows listed operator emails.
              </p>
            ) : null}

            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-muted px-3 py-2">
                <dt className="text-xs text-muted-foreground">Accounts</dt>
                <dd className="font-medium tabular-nums">{stats?.accounts ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <dt className="text-xs text-muted-foreground">Pro</dt>
                <dd className="font-medium tabular-nums">{stats?.pro ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <dt className="text-xs text-muted-foreground">Cancelled</dt>
                <dd className="font-medium tabular-nums">{stats?.cancelled ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2">
                <dt className="text-xs text-muted-foreground">Free</dt>
                <dd className="font-medium tabular-nums">{stats?.free ?? 0}</dd>
              </div>
            </dl>

            <form
              className="relative mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                void load(query);
              }}
            >
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or email"
                aria-label="Search accounts"
                className="pl-10"
              />
            </form>
          </section>

          {accounts.length === 0 ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-border">
              <p className="text-sm text-muted-foreground">
                {query.trim() ? "No accounts match that search." : "No signed-up accounts yet."}
              </p>
            </section>
          ) : (
            <ul className="flex flex-col gap-3">
              {accounts.map((account) => {
                const busy = busyId === account.userId;
                const initial = (account.name || account.email || "G").charAt(0).toUpperCase();
                return (
                  <li
                    key={account.userId}
                    className="rounded-xl border border-border bg-card p-4 shadow-border"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary font-display text-lg text-primary-foreground">
                        {initial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{account.name}</p>
                          {planBadge(account)}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">{account.email || "No email"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {account.isPro
                            ? `${account.daysLeft} day${account.daysLeft === 1 ? "" : "s"} · ${formatDay(account.periodEnd)}`
                            : "No Pro window"}
                          {" · "}
                          {paymentLabel(account)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        className="h-12"
                        disabled={busy}
                        onClick={() => void grant(account)}
                      >
                        {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                        Grant 30 days
                      </Button>
                      <Button
                        className="h-12"
                        variant="outline"
                        disabled={busy || !account.isPro || account.status !== "active"}
                        onClick={() => void cancel(account)}
                      >
                        Cancel Pro
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <section className="rounded-xl border border-border bg-card p-5 shadow-border">
          <p className="text-sm text-muted-foreground">Sign in to open the desk.</p>
        </section>
      )}
    </main>
  );
}
