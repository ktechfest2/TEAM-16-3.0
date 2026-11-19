import Link from "next/link";
import { PageShell } from "@/components/signa/shell";
export default function Help() {
  return <PageShell width="narrow"><h1 className="text-3xl font-semibold">Help and information</h1>
    <p className="mt-4">Choose a fictional polling unit and an incident category to save an alert. Add details or a photo only when it is safe. Reports saved offline remain pending until the server confirms receipt.</p>
    <p className="mt-4">Signa does not dispatch emergency responders or certify allegations. If you are in immediate danger, move to safety and contact authorized emergency services.</p>
    <div className="mt-6 flex gap-5"><Link className="underline" href="/report">Report an incident</Link><Link className="underline" href="/my-reports">Track my reports</Link><Link className="underline" href="/staff">Staff access</Link></div>
  </PageShell>;
}
