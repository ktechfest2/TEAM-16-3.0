# Attribution and provenance

Signa is a Team 16 submission to KTech Fest 3.0. ChatGPT, OpenAI Codex and Claude Code were used in the development process. Google Gemini and Google Fact Check Tools are external AI and evidence-search services; Voicebip provides the telephone agent platform; Intron Sahara was evaluated separately for speech. Their mention does not imply endorsement or a current institutional partnership.

The application uses Next.js, React, TypeScript, Tailwind CSS, Framer Motion, Lucide, Radix UI, Supabase, Playwright and other dependencies recorded in `package-lock.json`. See each upstream package for its own license. No new license is asserted for the Signa repository.

## Polling-unit directory

The imported dataset is [Saidi Adegoke's nigeria-inec-geo](https://github.com/saidiadegoke/nigeria-inec-geo), pinned at [commit `3cf617721aea519eef960681d3d86a4fad4325da`](https://github.com/saidiadegoke/nigeria-inec-geo/commit/3cf617721aea519eef960681d3d86a4fad4325da). Its stated source is the [INEC Continuous Voter Registration polling-unit portal](https://cvr.inecnigeria.org/pu), with a **10 August 2026** snapshot. The source repository's [LICENSE](https://github.com/saidiadegoke/nigeria-inec-geo/blob/main/LICENSE) is MIT for its software, copyright © 2026 Saidi Adegoke. It says the public administrative dataset under `data/` is factual electoral information for which the repository does not claim copyright. The source disclaims INEC affiliation or endorsement.

The pinned import CSV SHA-256 recorded by the importer is `65BE04B266B4C013A39F327E7242451C4DC50A27E9DCF2038A565A0A5AAF86A2`. The import validated 37 states/FCT, 774 LGAs, 8,809 wards and 176,846 polling-unit records. Representative codes were compared with available official references, but the dynamic INEC locator does not provide a static signed nationwide export. Names and locations can change; this is an imported snapshot, not official live certification or an INEC partnership.
