import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  category, deliveryMeta, responseMeta, reviewMeta,
  type DeliveryState, type ResponseState, type ReviewState,
} from "@/lib/taxonomy";

type Size = "sm" | "md" | "lg";

export function ReviewChip({ state, size = "md", className }: { state: ReviewState; size?: Size; className?: string }) {
  const meta = reviewMeta[state] ?? reviewMeta.under_review;
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} size={size} className={className} title={meta.help}>
      <Icon aria-hidden /> {meta.label}
    </Badge>
  );
}

export function ResponseChip({ state, size = "md", className }: { state: ResponseState; size?: Size; className?: string }) {
  const meta = responseMeta[state] ?? responseMeta.unassigned;
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} size={size} className={className} title={meta.help}>
      <Icon aria-hidden /> {meta.label}
    </Badge>
  );
}

export function DeliveryChip({ state, size = "md", className }: { state: DeliveryState; size?: Size; className?: string }) {
  const meta = deliveryMeta[state];
  return (
    <Badge tone={meta.tone} size={size} className={className} title={meta.help}>
      <span className={cn("relative size-1.5 rounded-full bg-current", state === "sending" && "pulse-ring")} aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function CategoryChip({ value, size = "md", className }: { value: string; size?: Size; className?: string }) {
  const meta = category(value);
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} size={size} className={className} title={meta.description}>
      <Icon aria-hidden /> {meta.short}
    </Badge>
  );
}

/** Square icon tile that carries the category colour without shouting. */
export function CategoryGlyph({ value, className }: { value: string; className?: string }) {
  const meta = category(value);
  const Icon = meta.icon;
  const tones: Record<string, string> = {
    alert: "bg-alert-soft text-alert ring-[rgba(220,38,38,0.14)]",
    warn: "bg-warn-soft text-warn ring-[rgba(217,119,6,0.16)]",
    signal: "bg-signal-soft text-signal ring-[rgba(37,99,235,0.14)]",
    trust: "bg-trust-soft text-trust ring-[rgba(15,118,110,0.14)]",
    ok: "bg-ok-soft text-ok ring-[rgba(22,163,74,0.16)]",
    neutral: "bg-[rgba(15,23,42,0.04)] text-slate-ink ring-[var(--hairline)]",
  };
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-[12px] ring-1 ring-inset",
        tones[meta.tone], className,
      )}
      aria-hidden
    >
      <Icon className="size-[18px]" />
    </span>
  );
}
