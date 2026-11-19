"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold tracking-[-0.01em] transition-colors duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-55 active:translate-y-px [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-signal text-white shadow-xs hover:bg-[#1E4DBA] hover:shadow-sm",
        signal:
          "bg-signal text-white shadow-xs hover:bg-[#1E4DBA] hover:shadow-sm",
        alert:
          "bg-incident text-white hover:bg-[#972E35]",
        secondary:
          "bg-white text-ink ring-1 ring-inset ring-[var(--hairline-strong)] hover:bg-paper hover:ring-[#9EADA6]",
        ghost: "text-muted hover:bg-[#E6ECE8] hover:text-ink",
        subtle: "bg-[#E8EEEA] text-ink hover:bg-[#DCE5E0]",
        link: "text-signal underline-offset-4 hover:underline px-0",
        onDark:
          "bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/15",
      },
      size: {
        sm: "h-10 px-3.5 text-[13px] [&_svg]:size-4",
        md: "h-11 px-5 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-[15px] [&_svg]:size-[18px]",
        xl: "h-14 px-7 text-base [&_svg]:size-5",
        icon: "size-11 [&_svg]:size-[18px]",
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
