import { PageShell } from "@/components/signa/shell";
import { VerifyExperience } from "@/components/signa/verify-experience";
import { verifyConfiguration } from "@/lib/server/verify-config";

export default function VerifyPage() {
  const config = verifyConfiguration();
  return <PageShell width="narrow"><VerifyExperience enabled={config.enabled} linksEnabled={config.linksEnabled} /></PageShell>;
}
