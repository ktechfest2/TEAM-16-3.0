import Link from "next/link";
import { PageShell } from "@/components/signa/shell";
import { DemoAccessPanel } from "@/components/signa/demo-access-panel";
import { demoAccessAvailable } from "@/lib/server/demo-access";
export default function StaffAccess() {
  return <PageShell width="narrow"><h1 className="text-3xl font-semibold">Staff access</h1>
    <DemoAccessPanel enabled={demoAccessAvailable()} />
    <p className="mt-3 text-slate-ink">Individually approved reviewers and coordinators sign in through their assigned workspace.</p>
    <div className="mt-6 flex flex-wrap gap-3"><Link className="rounded-lg bg-midnight px-5 py-3 text-white" href="/monitor">Incident Review</Link><Link className="rounded-lg border px-5 py-3" href="/coordinator">Response Coordination</Link></div>
    <p className="mt-6 text-sm text-slate-ink">Participating organizations, their administrators and each staff member require approval and trusted account provisioning. Access and responsibilities must be reviewed and revoked when appropriate. Institutional referrals require agreed authorized channels.</p>
  </PageShell>;
}
