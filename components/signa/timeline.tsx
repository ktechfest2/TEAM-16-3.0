import * as React from "react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils";
import type { Tone } from "@/lib/taxonomy";

export type TimelineEntry = {
  id: string | number;
  label: string;
  tone?: Tone;
  at: string;
  actor?: string | null;
  detail?: React.ReactNode;
};

const dotTone: Record<Tone, string> = {
  neutral: "bg-slate-ink/35 ring-[rgba(15,23,42,0.08)]",
  signal: "bg-signal ring-[rgba(37,99,235,0.18)]",
  trust: "bg-trust ring-[rgba(15,118,110,0.18)]",
  alert: "bg-alert ring-[rgba(220,38,38,0.18)]",
  warn: "bg-warn ring-[rgba(217,119,6,0.2)]",
  ok: "bg-ok ring-[rgba(22,163,74,0.2)]",
};

export function Timeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-6 pl-7", className)}>
      <span
        className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-[rgba(15,23,42,0.14)] via-[rgba(15,23,42,0.10)] to-transparent"
        aria-hidden
      />
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className={cn(
              "absolute -left-7 top-1 size-3.5 rounded-full ring-4",
              dotTone[entry.tone ?? "neutral"],
            )}
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-[14.5px] font-semibold text-navy">{entry.label}</p>
            <time className="text-[12.5px] font-medium text-muted-ink" dateTime={entry.at}>
              {formatDateTime(entry.at)}
            </time>
          </div>
          {entry.actor ? (
            <p className="mt-0.5 text-[12.5px] text-slate-ink/70">{entry.actor}</p>
          ) : null}
          {entry.detail ? (
            <div className="mt-2 rounded-[12px] bg-canvas px-3.5 py-2.5 text-[13.5px] leading-relaxed text-slate-ink ring-1 ring-inset ring-[var(--hairline)]">
              {entry.detail}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
