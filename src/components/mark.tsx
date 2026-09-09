import { cn } from "@/lib/utils";

export function SlipMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <rect x="8" y="5" width="16" height="22" rx="2" className="fill-background" />
      <rect x="11" y="9" width="10" height="2" rx="1" className="fill-primary" />
      <rect x="11" y="14" width="10" height="2" rx="1" className="fill-primary" />
      <rect x="11" y="19" width="7" height="2" rx="1" className="fill-sage" />
    </svg>
  );
}
