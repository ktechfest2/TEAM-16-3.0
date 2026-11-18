import * as React from "react";
import { cn } from "@/lib/utils";

/** Signa mark: a concentric signal emitted from a single point of witness. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" className="fill-midnight" />
      <circle cx="16" cy="16" r="3" className="fill-white" />
      <path
        d="M22.2 9.8a8.8 8.8 0 0 1 0 12.4M9.8 22.2a8.8 8.8 0 0 1 0-12.4"
        className="stroke-signal"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M25.6 6.4a13.6 13.6 0 0 1 0 19.2"
        className="stroke-signal/45"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({
  className, wordmarkClassName, href = "/",
}: { className?: string; wordmarkClassName?: string; href?: string }) {
  return (
    <a href={href} className={cn("group inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-8 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.06]" />
      <span
        className={cn(
          "font-display text-[19px] font-bold tracking-[-0.03em] text-midnight",
          wordmarkClassName,
        )}
      >
        Signa
      </span>
    </a>
  );
}
