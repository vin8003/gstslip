import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestVerifyCode, submitVerifyCode } from "@/lib/quota/client";

export function VerifyEmailDialog({
  open,
  email,
  onOpenChange,
  onVerified,
}: {
  open: boolean;
  email: string | null;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setCode("");
      setBusy(false);
      return;
    }
    let cancelled = false;
    void requestVerifyCode()
      .then((result) => {
        if (cancelled) return;
        if (result.previewCode) {
          setCode(result.previewCode);
          toast.message(`Preview verification code: ${result.previewCode}`);
        } else if (result.status.emailVerified) {
          onVerified();
          onOpenChange(false);
        } else {
          toast.message(email ? `Enter the code sent to ${email}.` : "Enter the 6-digit code.");
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not start verification.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, email, onOpenChange, onVerified]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.replace(/\D/g, "");
    if (trimmed.length !== 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const status = await submitVerifyCode(trimmed);
      if (!status.emailVerified) {
        toast.error("That code is incorrect or expired.");
        return;
      }
      toast.success("Email verified. Free captures are available.");
      onVerified();
      onOpenChange(false);
    } catch {
      toast.error("Could not verify that code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify your email</DialogTitle>
          <DialogDescription>
            Free captures on a signed-in account need a one-time email check.
            {email ? ` We will send a code to ${email}.` : ""} Signed-out capture still
            counts against this network address.
          </DialogDescription>
        </DialogHeader>
        <form className="mt-2 space-y-3" onSubmit={(event) => void onSubmit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="gstslip-verify-code">6-digit code</Label>
            <Input
              id="gstslip-verify-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Not now
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Verify
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
