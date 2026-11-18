"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export const easeSoft = [0.22, 1, 0.36, 1] as const;

type RevealProps = React.HTMLAttributes<HTMLDivElement> & { delay?: number; y?: number };

/**
 * Entrance animations are CSS-driven on purpose: content is present and visible
 * in the server-rendered HTML, so nothing is blank before hydration or without
 * JavaScript. Framer Motion is reserved for genuinely interactive motion
 * (progress fills, dialogs, enter/exit of status messages).
 */
export function Reveal({ delay = 0, y = 14, className, style, children, ...props }: RevealProps) {
  return (
    <div
      className={cn("reveal", className)}
      style={{ animationDelay: delay ? `${delay}s` : undefined, ["--reveal-y" as string]: `${y}px`, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

/** Reveals when scrolled into view; stays visible if IntersectionObserver is unavailable. */
export function RevealOnScroll({ delay = 0, y = 18, className, style, children, ...props }: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<"static" | "pending" | "shown">("static");

  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;

    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      setState("shown");
      return;
    }

    setState("pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(state === "pending" && "opacity-0", state === "shown" && "reveal", className)}
      style={{ animationDelay: delay ? `${delay}s` : undefined, ["--reveal-y" as string]: `${y}px`, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

/** Staggered list: children fade up in sequence via CSS, no hydration dependency. */
export function Stagger({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("stagger", className)} {...props}>
      {children}
    </div>
  );
}

export function StaggerItem({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

export { motion, AnimatePresence } from "framer-motion";
