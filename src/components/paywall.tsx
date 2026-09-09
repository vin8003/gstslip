import { Check, CreditCard, Landmark, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FREE_CAPTURES } from "@/lib/gst";
import { cn } from "@/lib/utils";

const PRICE = 499;

type Step = "plan" | "checkout" | "done";

export function Paywall({
  open,
  onOpenChange,
  onUnlock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlock: () => void;
}) {
  const [step, setStep] = useState<Step>("plan");
  const [method, setMethod] = useState<"upi" | "card">("upi");
  const [busy, setBusy] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setStep("plan");
      setBusy(false);
    }
    onOpenChange(next);
  }

  async function completeTestPay() {
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setBusy(false);
    setStep("done");
    onUnlock();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-0" showClose={step !== "checkout"}>
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
                  Annual
                </p>
                <p className="font-display text-3xl font-medium tabular-nums tracking-tight">
                  ₹{PRICE}
                </p>
              </div>
              <p className="pb-1 text-sm text-muted-foreground">per year</p>
            </div>
            <Button className="mt-5 w-full" size="lg" onClick={() => setStep("checkout")}>
              Continue to test checkout
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Razorpay test checkout stub. No charge is made.
            </p>
          </div>
        ) : null}

        {step === "checkout" ? (
          <div>
            <div className="flex items-center justify-between bg-primary px-5 py-4 text-primary-foreground">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-primary-foreground/70">
                  Test checkout
                </p>
                <p className="font-medium">GSTSlip Pro</p>
              </div>
              <p className="font-display text-2xl tabular-nums">₹{PRICE}</p>
            </div>
            <div className="p-5">
              <p className="text-sm text-muted-foreground">
                Simulated Razorpay checkout for this preview. Nothing is charged
                and no card details leave this device.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod("upi")}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition-[background-color,box-shadow] duration-150",
                    method === "upi"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <Landmark className="size-4" />
                  UPI
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("card")}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition-[background-color,box-shadow] duration-150",
                    method === "card"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <CreditCard className="size-4" />
                  Card
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {method === "upi" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="upi-id">UPI ID</Label>
                    <Input id="upi-id" defaultValue="ca@okaxis" autoComplete="off" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="card-num">Card number</Label>
                      <Input
                        id="card-num"
                        defaultValue="4111 1111 1111 1111"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-exp">Expiry</Label>
                      <Input id="card-exp" defaultValue="12/28" autoComplete="off" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-cvv">CVV</Label>
                      <Input id="card-cvv" defaultValue="123" autoComplete="off" />
                    </div>
                  </div>
                )}
              </div>
              <Separator className="my-4" />
              <Button className="w-full" size="lg" disabled={busy} onClick={completeTestPay}>
                {busy ? "Processing test payment…" : `Pay ₹${PRICE}`}
              </Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="size-3.5" />
                Test mode · Razorpay stub
              </p>
            </div>
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
                Unlimited captures are unlocked on this device.
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
