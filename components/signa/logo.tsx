import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Open evidence frame: one observation point moving through two review ticks. */
export function LogoMark({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", inverse ? "text-white" : "text-ink", className)} aria-hidden focusable="false">
      <path d="M24 11H15a4 4 0 0 0-4 4v9M40 11h9a4 4 0 0 1 4 4v9M53 40v9a4 4 0 0 1-4 4h-9M24 53h-9a4 4 0 0 1-4-4v-9" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="20" cy="32" r="5" className="fill-signal" />
      <path d="M25 32h7m0-6v12m0-6h9m0-6v12m0-6h6" stroke="#11766E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({
  className, wordmarkClassName, href = "/",
}: { className?: string; wordmarkClassName?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-8 transition-transform duration-200 ease-out group-hover:scale-[1.035]" />
      <span
        className={cn(
          "font-display text-[19px] font-bold tracking-[-0.04em] text-ink",
          wordmarkClassName,
        )}
      >
        Signa
      </span>
    </Link>
  );
}
