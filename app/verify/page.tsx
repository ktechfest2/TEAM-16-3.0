import { PageShell } from "@/components/signa/shell";
import { VerifyExperience } from "@/components/signa/verify-experience";
import { verifyConfiguration } from "@/lib/server/verify-config";
import { mediaIntegrityConfiguration } from "@/lib/server/media-integrity-config";

export default function VerifyPage() {
  const config = verifyConfiguration();
  const media = mediaIntegrityConfiguration();
  return <PageShell width="narrow"><VerifyExperience enabled={config.enabled} linksEnabled={config.linksEnabled} mediaExternalEnabled={media.externalEnabled} /></PageShell>;
}
