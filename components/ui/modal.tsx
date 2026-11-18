"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open, onOpenChange, title, description, children, footer, className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-midnight/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[61] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
            "max-h-[88dvh] overflow-y-auto rounded-[20px] bg-white shadow-lg ring-1 ring-[var(--hairline)]",
            "duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] p-5 sm:p-6">
            <div>
              <Dialog.Title className="text-[18px] font-semibold leading-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-slate-ink/80">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid size-9 shrink-0 place-items-center rounded-[10px] text-slate-ink transition-colors hover:bg-[rgba(15,23,42,0.05)]"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="p-5 sm:p-6">{children}</div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--hairline)] bg-canvas p-5 sm:px-6">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ModalClose = Dialog.Close;
