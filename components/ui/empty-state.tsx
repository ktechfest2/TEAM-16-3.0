import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon, title, description, action, className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[18px] border border-dashed border-[var(--hairline-strong)] bg-white/60 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-[14px] bg-[rgba(15,23,42,0.04)] text-slate-ink ring-1 ring-inset ring-[var(--hairline)]">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-navy">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-ink/75">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
