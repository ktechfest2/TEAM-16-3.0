import Link from "next/link";
import { PageShell } from "@/components/signa/shell";
export default function StaffAccess() {
  return <PageShell width="narrow"><h1 className="text-3xl font-semibold">Staff access</h1>
    <section className="mt-6 rounded-[18px] bg-white p-5 ring-1 ring-[var(--hairline)]" aria-labelledby="try-signa-title">
      <h2 id="try-signa-title" className="text-xl font-semibold">Try Signa</h2>
      <p className="mt-2 text-sm text-slate-ink">One-click demonstration access is being prepared in an isolated fictional workspace. It is unavailable until separate accounts, records and private evidence can be kept apart for each tester.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{["Citizen", "Incident Reviewer 1", "Independent Reviewer 2", "Response Coordinator"].map(role => <button key={role} type="button" disabled className="min-h-11 rounded-xl border border-[var(--hairline)] bg-canvas px-3 text-left text-sm font-medium text-slate-ink/70 disabled:cursor-not-allowed" aria-label={`${role} demo unavailable`}>{role} · unavailable</button>)}</div>
    </section>
    <p className="mt-3 text-slate-ink">Individually approved reviewers and coordinators sign in through their assigned workspace.</p>
    <div className="mt-6 flex flex-wrap gap-3"><Link className="rounded-lg bg-midnight px-5 py-3 text-white" href="/monitor">Incident Review</Link><Link className="rounded-lg border px-5 py-3" href="/coordinator">Response Coordination</Link></div>
    <p className="mt-6 text-sm text-slate-ink">Participating organizations, their administrators and each staff member require approval and trusted account provisioning. Access and responsibilities must be reviewed and revoked when appropriate. Institutional referrals require agreed authorized channels.</p>
  </PageShell>;
}
