import Link from "next/link";
import {
  ArrowRight, CheckCircle2, Eye, FileSearch, Lock, Radio, ShieldCheck, Siren,
  WifiOff, Users, Scale, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/signa/shell";
import { Reveal, RevealOnScroll } from "@/components/signa/motion";
import { Eyebrow, SectionHeading } from "@/components/signa/page-header";
import { CategoryGlyph, ResponseChip, ReviewChip } from "@/components/signa/status-chip";
import { categoryMeta } from "@/lib/taxonomy";

const pillars = [
  {
    step: "01",
    name: "Alert",
    icon: Siren,
    tone: "alert" as const,
    title: "A witness raises a signal",
    body:
      "A reporter captures what they saw in under a minute — on a weak network, with a hold-to-send guard against accidental alerts. Nothing is lost if the connection drops.",
    points: ["Works offline, syncs later", "Hold-to-send confirmation", "Anonymous reporter session"],
  },
  {
    step: "02",
    name: "Verify",
    icon: FileSearch,
    tone: "signal" as const,
    title: "A human monitor reviews it",
    body:
      "Monitors group related reports into a case and record a written review outcome. No score, no algorithm, no claim of truth without a named reviewer behind it.",
    points: ["Reports grouped by a person", "Written rationale required", "Supported · inconclusive · not supported"],
  },
  {
    step: "03",
    name: "Respond",
    icon: Radio,
    tone: "trust" as const,
    title: "A coordinator follows up",
    body:
      "Supported cases are routed to a coordinator who acknowledges receipt and logs internal follow-up. Every state change is written to a case timeline.",
    points: ["Explicit acknowledgement", "Internal follow-up log", "Full audit trail"],
  },
];

const guarantees = [
  {
    icon: Scale,
    title: "Nonpartisan by design",
    body: "No party affiliation, no ranking of actors, no public naming. Categories describe events, not people.",
  },
  {
    icon: Lock,
    title: "Private by default",
    body: "Evidence sits in a private store. There is no public incident feed to weaponise and no self-service role elevation.",
  },
  {
    icon: Eye,
    title: "Allegation, not verdict",
    body: "Every report is labelled unverified until a named human records a review. The interface never implies proof by volume.",
  },
  {
    icon: WifiOff,
    title: "Built for bad networks",
    body: "An on-device outbox keeps reports safe until the server confirms receipt — and says plainly which state a report is in.",
  },
];

const previewRows = [
  { category: "disruption", title: "Accreditation paused", unit: "PU 24-118" },
  { category: "intimidation", title: "Pressure on the queue", unit: "PU 24-118" },
  { category: "missing_materials", title: "Result sheets late", unit: "PU 24-120" },
];

const toneRing: Record<string, string> = {
  alert: "bg-alert-soft text-alert ring-[rgba(220,38,38,0.14)]",
  signal: "bg-signal-soft text-signal ring-[rgba(37,99,235,0.14)]",
  trust: "bg-trust-soft text-trust ring-[rgba(15,118,110,0.14)]",
};

export default function HomePage() {
  const categories = Object.entries(categoryMeta);

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden bg-midnight">
        <div className="absolute inset-0 bg-grid mask-fade-b" aria-hidden />
        <div
          className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full opacity-60 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(37,99,235,0.35), transparent 65%)" }}
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <Reveal>
                <Badge tone="inverse" size="md" className="backdrop-blur">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
                  </span>
                  Election-day monitoring · Nonpartisan
                </Badge>
              </Reveal>

              <Reveal delay={0.06}>
                <h1 className="mt-6 font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] text-white sm:text-[58px]">
                  Every alert matters.
                  <br />
                  <span className="bg-gradient-to-r from-white via-white to-[#93B4FF] bg-clip-text text-transparent">
                    Every report counts.
                  </span>
                </h1>
              </Reveal>

              <Reveal delay={0.12}>
                <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#AEBDD4] sm:text-[18px]">
                  Signa turns scattered election-day observations into reviewed, accountable cases.
                  Witnesses alert. Trained monitors verify. Coordinators respond — with a written
                  record at every step.
                </p>
              </Reveal>

              <Reveal delay={0.18}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Button asChild variant="alert" size="xl">
                    <Link href="/report">
                      <Siren className="size-5" aria-hidden />
                      Report an incident
                    </Link>
                  </Button>
                  <Button asChild variant="onDark" size="xl">
                    <Link href="/my-reports">
                      Track my reports
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
              </Reveal>

              <Reveal delay={0.24}>
                <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-7">
                  {[
                    { k: "3 steps", v: "Alert · Verify · Respond" },
                    { k: "Offline-first", v: "Nothing lost on weak networks" },
                    { k: "Human-reviewed", v: "No automated verdicts" },
                  ].map((stat) => (
                    <div key={stat.k}>
                      <dt className="font-display text-[15px] font-semibold text-white">{stat.k}</dt>
                      <dd className="mt-1 text-[12.5px] leading-snug text-[#8699B5]">{stat.v}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>

            {/* Illustrative interface preview — labelled, never presented as live data */}
            <Reveal delay={0.2} y={24} className="hidden lg:block">
              <div className="relative">
                <div
                  className="absolute -inset-6 rounded-[32px] opacity-50 blur-3xl"
                  style={{ background: "radial-gradient(circle at 60% 30%, rgba(37,99,235,0.32), transparent 70%)" }}
                  aria-hidden
                />
                <Card className="relative overflow-hidden p-0 shadow-lg">
                  <div className="flex items-center justify-between border-b border-[var(--hairline)] bg-white px-5 py-3.5">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-navy">
                      <span className="size-2 rounded-full bg-alert" aria-hidden />
                      Case review
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-ink">
                      Illustrative
                    </span>
                  </div>
                  <div className="space-y-3.5 bg-canvas p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReviewChip state="under_review" size="sm" />
                      <ResponseChip state="assigned" size="sm" />
                    </div>
                    {previewRows.map((row) => (
                      <div
                        key={row.title}
                        className="flex items-center gap-3 rounded-[14px] bg-white p-3.5 ring-1 ring-[var(--hairline)] shadow-xs"
                      >
                        <CategoryGlyph value={row.category} />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-navy">{row.title}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-ink/70">
                            <MapPin className="size-3" aria-hidden /> {row.unit} · simulated
                          </p>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-[14px] border border-dashed border-[var(--hairline-strong)] bg-white/70 p-3.5">
                      <p className="text-[12.5px] leading-relaxed text-slate-ink/80">
                        <span className="font-semibold text-navy">Reviewer note required.</span>{" "}
                        A case cannot change state without a written rationale.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- Trust strip ---------- */}
      <section className="border-b border-[var(--hairline)] bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 sm:px-6">
          {[
            "Independent prototype",
            "No emergency dispatch",
            "No public incident feed",
            "Simulated polling units",
          ].map((item) => (
            <span key={item} className="flex items-center gap-2 text-[12.5px] font-medium text-slate-ink/75">
              <CheckCircle2 className="size-3.5 text-trust" aria-hidden />
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* ---------- Alert → Verify → Respond ---------- */}
      <PageShell className="py-16 sm:py-24">
        <RevealOnScroll>
          <Eyebrow>How Signa works</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-[30px] font-semibold leading-[1.1] sm:text-[40px]">
            One signal, three accountable hands.
          </h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-slate-ink/85">
            Each stage has a named owner, a required written record and a visible state.
            Nothing moves forward silently.
          </p>
        </RevealOnScroll>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            return (
              <RevealOnScroll key={pillar.name} delay={index * 0.08}>
                <Card interactive className="h-full p-6">
                  <div className="flex items-center justify-between">
                    <span
                      className={`grid size-11 place-items-center rounded-[13px] ring-1 ring-inset ${toneRing[pillar.tone]}`}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="font-display text-[13px] font-bold tracking-[0.1em] text-muted-ink">
                      {pillar.step}
                    </span>
                  </div>
                  <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-ink/60">
                    {pillar.name}
                  </p>
                  <h3 className="mt-2 text-[19px] font-semibold leading-snug">{pillar.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-slate-ink/80">{pillar.body}</p>
                  <ul className="mt-5 space-y-2 border-t border-[var(--hairline)] pt-4">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-[13.5px] text-slate-ink/85">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </Card>
              </RevealOnScroll>
            );
          })}
        </div>
      </PageShell>

      {/* ---------- What can be reported ---------- */}
      <section className="border-y border-[var(--hairline)] bg-white">
        <PageShell className="py-16 sm:py-20">
          <RevealOnScroll>
            <SectionHeading
              title="What a witness can report"
              description="Seven event categories, written in plain language. Categories describe what happened — never who is to blame."
              action={
                <Button asChild variant="secondary" size="md">
                  <Link href="/report">
                    Open the reporter
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              }
            />
          </RevealOnScroll>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map(([key, meta], index) => (
              <RevealOnScroll key={key} delay={Math.min(index * 0.05, 0.3)} className="h-full">
                <div className="flex h-full gap-3.5 rounded-[16px] bg-canvas p-4 ring-1 ring-inset ring-[var(--hairline)] transition-colors duration-300 hover:bg-white hover:shadow-sm">
                  <CategoryGlyph value={key} />
                  <div>
                    <p className="text-[14.5px] font-semibold text-navy">{meta.label}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-ink/75">{meta.description}</p>
                  </div>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </PageShell>
      </section>

      {/* ---------- Principles ---------- */}
      <PageShell className="py-16 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <RevealOnScroll>
            <Eyebrow>Principles</Eyebrow>
            <h2 className="mt-3 text-[30px] font-semibold leading-[1.1] sm:text-[38px]">
              Credibility is the product.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-slate-ink/85">
              An election tool that overstates what it knows does more harm than one that stays
              silent. Signa is deliberately conservative about what it claims — and explicit about
              what it does not do.
            </p>
            <div className="mt-7 flex items-center gap-3 rounded-[16px] bg-midnight p-4">
              <ShieldCheck className="size-5 shrink-0 text-[#93B4FF]" aria-hidden />
              <p className="text-[13.5px] leading-relaxed text-[#C3D0E4]">
                Signa is not an emergency service. In immediate danger, move to safety and contact
                authorised emergency responders.
              </p>
            </div>
          </RevealOnScroll>

          <div className="grid gap-4 sm:grid-cols-2">
            {guarantees.map((item, index) => {
              const Icon = item.icon;
              return (
                <RevealOnScroll key={item.title} delay={index * 0.07} className="h-full">
                  <Card interactive className="h-full p-5">
                    <span className="grid size-10 place-items-center rounded-[12px] bg-[rgba(15,23,42,0.04)] text-slate-ink ring-1 ring-inset ring-[var(--hairline)]">
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-[15.5px] font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-ink/80">{item.body}</p>
                  </Card>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </PageShell>

      {/* ---------- Closing CTA ---------- */}
      <section className="px-4 pb-6 sm:px-6">
        <RevealOnScroll className="mx-auto w-full max-w-6xl">
          <div className="relative overflow-hidden rounded-[28px] bg-midnight px-6 py-14 text-center sm:px-14 sm:py-20">
            <div className="absolute inset-0 bg-grid opacity-70" aria-hidden />
            <div
              className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full opacity-50 blur-[100px]"
              style={{ background: "radial-gradient(circle, rgba(37,99,235,0.4), transparent 70%)" }}
              aria-hidden
            />
            <div className="relative">
              <Badge tone="inverse" size="md">
                <Users className="size-3.5" aria-hidden /> For witnesses, monitors and coordinators
              </Badge>
              <h2 className="mx-auto mt-6 max-w-2xl font-display text-[30px] font-semibold leading-[1.1] text-white sm:text-[42px]">
                Saw something at a polling unit?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-[#AEBDD4]">
                It takes less than a minute, works without a stable connection, and goes to a human
                — not a feed.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild variant="alert" size="xl">
                  <Link href="/report">
                    <Siren className="size-5" aria-hidden />
                    Report an incident
                  </Link>
                </Button>
                <Button asChild variant="onDark" size="xl">
                  <Link href="/monitor">Monitor sign-in</Link>
                </Button>
              </div>
            </div>
          </div>
        </RevealOnScroll>
      </section>
    </>
  );
}
