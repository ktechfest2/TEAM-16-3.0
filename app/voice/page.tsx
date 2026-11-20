import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/signa/shell";

export default function VoiceEnquiryPage() {
  return <PageShell width="narrow">
    <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-signal/10 text-signal"><PhoneCall className="size-5" aria-hidden /></span><div><p className="text-sm font-semibold text-signal">Telephone service</p><h1 className="text-3xl font-semibold">Speak with Signa</h1></div></div>
    <Card className="mt-7 p-5 sm:p-6"><h2 className="text-xl font-semibold">Call the published Signa line</h2><p className="mt-3 text-sm leading-relaxed text-slate-ink">The telephone agent can explain Signa and read approved, dated public updates. It cannot access private reports, witness identities, evidence or staff records.</p><p className="mt-3 text-sm leading-relaxed text-slate-ink">No approved update does not mean a polling unit is safe. For an incident report, use the written reporting service so you can confirm the details before submission.</p></Card>
    <div className="mt-6 flex flex-wrap gap-4 text-sm"><Link className="font-semibold text-signal underline underline-offset-2" href="/report">Report an incident</Link><Link className="font-semibold text-signal underline underline-offset-2" href="/help">Help and information</Link></div>
  </PageShell>;
}
