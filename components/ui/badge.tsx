import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold tracking-[-0.005em] [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-[rgba(15,23,42,0.05)] text-slate-ink ring-1 ring-inset ring-[rgba(15,23,42,0.07)]",
        signal: "bg-signal-soft text-signal ring-1 ring-inset ring-[rgba(37,99,235,0.18)]",
        trust: "bg-trust-soft text-trust ring-1 ring-inset ring-[rgba(15,118,110,0.18)]",
        alert: "bg-alert-soft text-alert ring-1 ring-inset ring-[rgba(220,38,38,0.18)]",
        warn: "bg-warn-soft text-warn ring-1 ring-inset ring-[rgba(217,119,6,0.2)]",
        ok: "bg-ok-soft text-ok ring-1 ring-inset ring-[rgba(22,163,74,0.2)]",
        inverse: "bg-white/10 text-white ring-1 ring-inset ring-white/20",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-[12px]",
        lg: "px-3 py-1.5 text-[13px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/** Small coloured dot used inside chips and list rows. */
export function Dot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full bg-current", className)} aria-hidden />;
}
