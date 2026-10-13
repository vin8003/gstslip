import { cn } from "@/lib/utils";

export function SlipMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" className="fill-card" />
      <rect width="32" height="32" className="fill-none stroke-border" strokeWidth="2" />
      <rect width="32" height="5" className="fill-stamp" />
      <rect x="6" y="11" width="20" height="1.5" className="fill-ink" />
      <rect x="6" y="16" width="16" height="1.5" className="fill-ink/70" />
      <rect x="6" y="21" width="12" height="1.5" className="fill-primary" />
    </svg>
  );
}
