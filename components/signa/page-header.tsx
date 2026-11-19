import * as React from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow, title, description, actions, className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-2.5">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="max-w-[20ch] text-[32px] font-semibold leading-[1.1] sm:text-[40px]">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-[16px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  title, description, action, className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-[20px] font-semibold leading-tight">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-ink/75">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
