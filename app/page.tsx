import Link from "next/link";
import {
  ArrowRight, Check, Eye, FileText, FileSearch, LockKeyhole, Radio, ShieldCheck,
  Siren, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/signa/shell";
import { Reveal, RevealOnScroll } from "@/components/signa/motion";
import { Eyebrow, SectionHeading } from "@/components/signa/page-header";
import { CategoryGlyph } from "@/components/signa/status-chip";
import { categoryMeta } from "@/lib/taxonomy";

const flow = [
  {
    number: "01", title: "Report what you saw", label: "Witness", icon: Siren,
    copy: "Save an observation, even on a weak connection. The form keeps the wording focused on what happened.",
    tag: "Saved on device first",
  },
  {
    number: "02", title: "A person reviews it", label: "Monitor", icon: FileSearch,
    copy: "A trained monitor groups related reports and records a written review. An allegation stays an allegation until then.",
    tag: "Human review required",
  },
  {
    number: "03", title: "Follow-up is recorded", label: "Coordinator", icon: Radio,
    copy: "A coordinator acknowledges supported cases and logs internal follow-up in an auditable timeline.",
    tag: "Internal coordination",
  },
];

const principles = [
  { icon: ShieldCheck, title: "Impartial by design", copy: "No party affiliation, public naming, or ranking of people. Categories describe events." },
  { icon: LockKeyhole, title: "Private by default", copy: "There is no public incident feed. Access to reports follows assigned roles." },
  { icon: Eye, title: "Clear about evidence", copy: "Volume is not proof. Review outcomes always include a human rationale." },
  { icon: WifiOff, title: "Ready for weak networks", copy: "Local save and server receipt are shown as different states." },
];

export default function HomePage() {
  const categories = Object.entries(categoryMeta);

  return (
    <>
      <section className="border-b border-[var(--hairline)] bg-[#F7F8F5]">
        <PageShell className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1fr_0.88fr] lg:gap-16 lg:py-24">
          <div>
            <Reveal>
              <Eyebrow className="text-signal">Independent election incident coordination</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-5 max-w-[12ch] text-[42px] font-semibold leading-[1.04] tracking-[-0.045em] sm:text-[58px]">
                Make every observation count.
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-[58ch] text-[17px] leading-[1.65] text-muted">
                Signa helps witnesses report election-day incidents, and helps human teams review and coordinate each case with a clear record from first alert to follow-up.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/report"><Siren aria-hidden /> Report an incident <ArrowRight aria-hidden /></Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/my-reports"><FileText aria-hidden /> Track a report</Link>
                </Button>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--hairline)] pt-5 text-[12px] font-medium text-muted">
                <span className="inline-flex items-center gap-2"><Check className="size-4 text-review" aria-hidden /> Nonpartisan</span>
                <span className="inline-flex items-center gap-2"><Check className="size-4 text-review" aria-hidden /> Human-reviewed</span>
                <span className="inline-flex items-center gap-2"><Check className="size-4 text-review" aria-hidden /> Offline-aware</span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.12} y={16}>
            <Card className="overflow-hidden rounded-[16px] p-0 shadow-md">
              <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4 sm:px-6">
                <div>
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted">A case, in brief</p>
                  <h2 className="mt-1 text-[18px] font-semibold">From report to review</h2>
                </div>
                <span className="rounded-md bg-paper px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Sample</span>
              </div>
              <div className="bg-white px-5 py-2 sm:px-6">
                {flow.map((stage, index) => {
                  const Icon = stage.icon;
                  return (
                    <div className="relative flex gap-4 py-5" key={stage.number}>
                      {index < flow.length - 1 && <span className="absolute bottom-0 left-[17px] top-[52px] w-px bg-[var(--hairline-strong)]" aria-hidden />}
                      <span className={`relative z-10 grid size-[35px] shrink-0 place-items-center rounded-full ring-1 ring-inset ${index === 0 ? "bg-signal-soft text-signal ring-[#D4DFFB]" : index === 1 ? "bg-trust-soft text-trust ring-[#D0E8E2]" : "bg-paper text-muted ring-[var(--hairline)]"}`}>
                        <Icon className="size-[17px]" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[14px] font-semibold">{stage.title}</p>
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{stage.label}</span>
                        </div>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{stage.copy}</p>
                        <p className="mt-2 text-[11px] font-semibold text-ink">{stage.tag}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-[var(--hairline)] bg-[#F7F8F5] px-5 py-3.5 text-[12px] leading-relaxed text-muted sm:px-6">
                This is an illustrative workflow. Polling units and case details in this prototype are simulated.
              </div>
            </Card>
          </Reveal>
        </PageShell>
      </section>

      <PageShell className="py-16 sm:py-20">
        <RevealOnScroll>
          <Eyebrow>One accountable process</Eyebrow>
          <h2 className="mt-3 max-w-[18ch] text-[30px] font-semibold leading-tight sm:text-[38px]">A clear record at every handoff.</h2>
          <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-muted">
            Reports move through three roles. Each handoff has an owner, a visible state, and a written record.
          </p>
        </RevealOnScroll>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {flow.map((stage, index) => {
            const Icon = stage.icon;
            return <RevealOnScroll key={stage.number} delay={index * 0.06}>
              <Card className="h-full p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <span className={`grid size-10 place-items-center rounded-[10px] ${index === 0 ? "bg-signal-soft text-signal" : index === 1 ? "bg-trust-soft text-trust" : "bg-paper text-ink"}`}><Icon className="size-5" aria-hidden /></span>
                  <span className="font-mono text-[12px] text-muted">{stage.number}</span>
                </div>
                <p className="mt-5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted">{stage.label}</p>
                <h3 className="mt-1.5 text-[19px] font-semibold">{stage.title}</h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{stage.copy}</p>
              </Card>
            </RevealOnScroll>;
          })}
        </div>
      </PageShell>

      <section className="border-y border-[var(--hairline)] bg-white">
        <PageShell className="py-14 sm:py-16">
          <SectionHeading title="What can be reported" description="Event categories use plain language and describe what happened, not who is to blame." action={<Button asChild variant="secondary"><Link href="/report">Open the report form <ArrowRight aria-hidden /></Link></Button>} />
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map(([key, meta]) => <div key={key} className="flex min-h-[88px] gap-3 rounded-[12px] bg-[#F7F8F5] p-4 ring-1 ring-inset ring-[var(--hairline)]">
              <CategoryGlyph value={key} />
              <div><p className="text-[14px] font-semibold">{meta.label}</p><p className="mt-1 text-[13px] leading-relaxed text-muted">{meta.description}</p></div>
            </div>)}
          </div>
        </PageShell>
      </section>

      <PageShell className="py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <RevealOnScroll>
            <Eyebrow>Trust is part of the interface</Eyebrow>
            <h2 className="mt-3 max-w-[14ch] text-[30px] font-semibold leading-tight sm:text-[38px]">Credibility comes from restraint.</h2>
            <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-muted">
              Signa makes careful claims about what it knows. A report is not a verdict, and internal coordination is not an emergency response.
            </p>
            <div className="mt-6 rounded-[12px] border-l-[3px] border-waiting bg-warn-soft p-4 text-[13px] leading-relaxed text-[#70420A]">
              Signa does not contact emergency services. If you are in immediate danger, move to safety and contact authorised responders.
            </div>
          </RevealOnScroll>
          <div className="grid gap-3 sm:grid-cols-2">
            {principles.map((item, index) => {
              const Icon = item.icon;
              return <RevealOnScroll key={item.title} delay={index * 0.05}>
                <div className="h-full rounded-[12px] border border-[var(--hairline)] bg-white p-5">
                  <Icon className="size-5 text-review" aria-hidden />
                  <h3 className="mt-4 text-[16px] font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{item.copy}</p>
                </div>
              </RevealOnScroll>;
            })}
          </div>
        </div>
      </PageShell>

      <section className="border-t border-[var(--hairline)] bg-ink text-white">
        <PageShell className="flex flex-col items-start justify-between gap-7 py-12 sm:flex-row sm:items-center sm:py-14">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#B8C6C8]">Start with what you observed</p>
            <h2 className="mt-2 max-w-[22ch] text-[26px] font-semibold leading-tight text-white sm:text-[32px]">A careful report is a useful first step.</h2>
          </div>
          <Button asChild variant="onDark" size="lg"><Link href="/report"><Siren aria-hidden /> Report an incident <ArrowRight aria-hidden /></Link></Button>
        </PageShell>
      </section>
    </>
  );
}
