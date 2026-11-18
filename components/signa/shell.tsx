import * as React from "react";
import { cn } from "@/lib/utils";

/** Standard page container: generous gutters, calm max width. */
export function PageShell({
  className, children, width = "default",
}: {
  className?: string;
  children: React.ReactNode;
  width?: "default" | "wide" | "narrow";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-10 sm:px-6 sm:py-14",
        width === "wide" && "max-w-7xl",
        width === "default" && "max-w-6xl",
        width === "narrow" && "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
