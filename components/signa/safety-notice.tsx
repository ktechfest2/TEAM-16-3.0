import * as React from "react";
import { ShieldAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Standing safety disclosure. Signa coordinates internal monitoring only —
 * it never claims emergency dispatch, police response or INEC integration.
 */
export function SafetyNotice({
  tone = "warn", title, children, className,
}: {
  tone?: "warn" | "info";
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "warn" ? ShieldAlert : Info;
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3.5 rounded-[16px] p-4 ring-1 ring-inset sm:p-5",
        tone === "warn"
          ? "bg-warn-soft text-[#7C4A09] ring-[rgba(217,119,6,0.2)]"
          : "bg-signal-soft text-[#1E3A8A] ring-[rgba(37,99,235,0.16)]",
        className,
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="text-[14px] font-semibold leading-snug">{title}</p>
        <div className="text-[13.5px] leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}
