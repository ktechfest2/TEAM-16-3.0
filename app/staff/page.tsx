import Link from "next/link";
import { ArrowRight, ClipboardCheck, LockKeyhole, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/signa/shell";
import { PageHeader } from "@/components/signa/page-header";
import { DemoAccessPanel } from "@/components/signa/demo-access-panel";
import { demoAccessAvailable } from "@/lib/server/demo-access";

const workspaces = [
  {
    href: "/monitor",
    title: "Incident Review",
    description: "Review incoming reports, group related observations and record an independent written outcome.",
    icon: Scale,
  },
  {
    href: "/coordinator",
    title: "Response Coordination",
    description: "Acknowledge cases routed to you and record internal follow-up in the case history.",
    icon: ClipboardCheck,
  },
];

export default function StaffAccess() {
  const demoEnabled = demoAccessAvailable();

  return (
    <PageShell width="narrow" className="pb-16">
      <PageHeader
        eyebrow={<><LockKeyhole className="size-3.5" aria-hidden /> Restricted workspace</>}
        title="Staff access"
        description="Choose your assigned workspace. An administrator must approve and provision each staff account; signing in does not grant a role."
      />

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {workspaces.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
            <Card interactive className="h-full p-5">
              <span className="grid size-10 place-items-center rounded-[12px] bg-[rgba(15,23,42,0.05)] text-navy ring-1 ring-inset ring-[var(--hairline)]">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <h2 className="mt-4 flex items-center justify-between gap-2 text-[16px] font-semibold">
                {title}<ArrowRight className="size-4 shrink-0 text-muted-ink transition-transform group-hover:translate-x-0.5" aria-hidden />
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-ink/80">{description}</p>
            </Card>
          </Link>
        ))}
      </div>

      {demoEnabled && <DemoAccessPanel enabled />}

      <p className="mt-6 rounded-[14px] bg-white p-4 text-[13px] leading-relaxed text-slate-ink/80 ring-1 ring-inset ring-[var(--hairline)]">
        Signa records monitoring activity for an authorized organisation. It is an independent prototype and does not dispatch emergency services or imply an institutional partnership. Use agreed authorized channels for any external referral.
      </p>
    </PageShell>
  );
}
