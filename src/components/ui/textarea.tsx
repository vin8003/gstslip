import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-sm border border-input bg-card px-3 py-2 text-base text-foreground shadow-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
