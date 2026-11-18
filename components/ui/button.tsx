"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-semibold tracking-[-0.01em] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] select-none disabled:pointer-events-none disabled:opacity-50 active:translate-y-[0.5px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-midnight text-white shadow-[0_1px_2px_rgba(11,18,32,0.18),0_8px_24px_rgba(11,18,32,0.14)] hover:bg-navy hover:shadow-[0_2px_6px_rgba(11,18,32,0.2),0_14px_34px_rgba(11,18,32,0.18)]",
        signal:
          "bg-signal text-white shadow-[0_8px_24px_rgba(37,99,235,0.24)] hover:brightness-[1.07] hover:shadow-[0_12px_32px_rgba(37,99,235,0.3)]",
        alert:
          "bg-alert text-white shadow-[0_8px_24px_rgba(220,38,38,0.24)] hover:brightness-[1.06]",
        secondary:
          "bg-white text-navy ring-1 ring-inset ring-[var(--hairline-strong)] shadow-xs hover:bg-canvas hover:ring-[rgba(15,23,42,0.2)]",
        ghost: "text-slate-ink hover:bg-[rgba(15,23,42,0.05)] hover:text-navy",
        subtle: "bg-[rgba(15,23,42,0.045)] text-navy hover:bg-[rgba(15,23,42,0.08)]",
        link: "text-signal underline-offset-4 hover:underline px-0",
        onDark:
          "bg-white/10 text-white ring-1 ring-inset ring-white/20 backdrop-blur hover:bg-white/16",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px] [&_svg]:size-4",
        md: "h-11 px-5 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-[15px] [&_svg]:size-[18px]",
        xl: "h-14 px-7 text-base [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-[18px]",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", full: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, full }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
export { buttonVariants };
