"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const controlBase =
  "w-full rounded-[12px] bg-white text-[15px] text-navy placeholder:text-muted-ink/90 ring-1 ring-inset ring-[var(--hairline-strong)] shadow-xs transition-all duration-200 outline-none focus:ring-2 focus:ring-signal focus:shadow-[0_0_0_4px_rgba(37,99,235,0.10)] disabled:opacity-60 disabled:cursor-not-allowed";

export function Label({
  className, hint, ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label className={cn("text-[13px] font-semibold text-navy", className)} {...props} />
      {hint ? <span className="text-[12px] font-medium text-muted-ink">{hint}</span> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(controlBase, "h-12 px-3.5", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(controlBase, "min-h-[132px] resize-y p-3.5 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/** Native select kept for reliability on low-end devices and offline use. */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(controlBase, "h-12 appearance-none pl-3.5 pr-11", className)}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-ink"
      aria-hidden
    />
  </div>
));
Select.displayName = "Select";

export function Field({
  label, hint, help, htmlFor, children, className,
}: {
  label: string;
  hint?: React.ReactNode;
  help?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} hint={hint}>{label}</Label>
      {children}
      {help ? <p className="text-[12.5px] leading-relaxed text-slate-ink/70">{help}</p> : null}
    </div>
  );
}
