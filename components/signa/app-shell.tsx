"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { FileText, Home, LayoutDashboard, ListChecks, Siren } from "lucide-react";
import { Logo, LogoMark } from "./logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/report", label: "Report", icon: Siren },
  { href: "/my-reports", label: "My reports", icon: FileText },
  { href: "/monitor", label: "Monitor", icon: LayoutDashboard },
  { href: "/coordinator", label: "Coordinator", icon: ListChecks },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname() || "/";
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--hairline)] glass">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-[10px] px-3 py-2 text-[13.5px] font-semibold transition-colors duration-200",
                  active
                    ? "bg-[rgba(15,23,42,0.06)] text-midnight"
                    : "text-slate-ink/80 hover:bg-[rgba(15,23,42,0.04)] hover:text-midnight",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="alert" size="sm">
            <Link href="/report">
              <Siren className="size-4" aria-hidden />
              <span className="hidden sm:inline">Report an incident</span>
              <span className="sm:hidden">Report</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Thumb-reachable navigation for the mobile reporting experience. */
export function MobileNav() {
  const pathname = usePathname() || "/";
  const items = [
    { href: "/", label: "Home", icon: Home },
    { href: "/my-reports", label: "Reports", icon: FileText },
    { href: "/report", label: "Report", icon: Siren, emphasis: true },
    { href: "/monitor", label: "Monitor", icon: LayoutDashboard },
    { href: "/coordinator", label: "Queue", icon: ListChecks },
  ];
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--hairline)] glass pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[12px] px-1 py-2 text-[11px] font-semibold transition-colors",
                  active ? "text-midnight" : "text-slate-ink/65",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-[10px] transition-colors",
                    item.emphasis
                      ? "bg-alert text-white shadow-[0_6px_18px_rgba(220,38,38,0.3)]"
                      : active
                        ? "bg-[rgba(15,23,42,0.07)]"
                        : "",
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[var(--hairline)] bg-white">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="font-display text-[17px] font-bold tracking-[-0.03em] text-midnight">Signa</span>
          </div>
          <p className="max-w-sm text-[13.5px] leading-relaxed text-slate-ink/75">
            Nonpartisan election incident reporting and coordination. Alert, verify, respond —
            with a human in the loop at every step.
          </p>
        </div>
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-ink">Product</p>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block text-[13.5px] font-medium text-slate-ink/85 transition-colors hover:text-midnight"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-ink">Scope</p>
          <p className="text-[13px] leading-relaxed text-slate-ink/75">
            Independent prototype. No emergency dispatch, police response or INEC integration.
            Polling units in this environment are fictional and labelled simulated.
          </p>
        </div>
      </div>
      <div className="border-t border-[var(--hairline)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-5 text-[12px] text-muted-ink sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Signa. Nonpartisan by design.</span>
          <span>Reports are allegations until a human review is recorded.</span>
        </div>
      </div>
    </footer>
  );
}
