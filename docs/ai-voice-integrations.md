# AI assessment and voice integration handoff

This work is scoped to WOR-119 (AI assessment) and WOR-120 (voice integrations). The current report/case API shapes remain the shared backend/frontend boundary. The report payload adds optional `aiProcessingConsent: boolean` (defaults to `false` for old/offline payloads). No user-facing report receipt waits for an AI provider.

## AI assessment

`POST /api/monitor/ai-assessments` requires a verified monitor/admin Bearer session and `{ "reportId": "<uuid>", "consentedFictionalEvidence": true }`. It also checks that the reporter stored AI consent and that the report belongs to a simulated polling unit. Gemini receives report text and up to two private image files (maximum 8 MiB total, image types only). `GEMINI_API_KEY` and optional `GEMINI_MODEL` are server-only.

The response is provisional structured observation plus source IDs, uncertainty, deterministic checks (polling-unit ID, category, occurrence time, and potential same-unit/category reports in a ±30-minute window), provider status, and created time. Provider errors are persisted as `status: failed` and `provider_failure`. No AI code updates incident/case/review state. Human review remains authoritative.

The deterministic duplicate list is a possible-match check only. It does not assert corroboration, incident truth, or verification. Current feature gate intentionally excludes non-simulated polling units until safety, consent, retention, and production review are completed.

## Voicebip public-safe tool

Official references reviewed:

- [Voicebip Tool-calling use cases](https://docs.voicebip.com/use-cases/use-cases) identify the hosted-agent action as a `tool.invocation` webhook.
- [Voicebip quick start](https://docs.voicebip.com/get-started/quickstart) documents the `X-Voicebip-Signature` header and an HMAC-SHA256 signed webhook test.
- [Voicebip overview](https://docs.voicebip.com/get-started/welcome) describes tools as calls from the agent to the developer backend and signed webhook delivery.
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output) and [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) document the response schema and multimodal input APIs used here.
- [Intron STT file upload](https://docs.voice.intron.io/docs/stt/file-upload-sync), [STT supported languages](https://docs.voice.intron.io/docs/stt/supported-languages), and [TTS generate](https://docs.voice.intron.io/docs/tts/tts-generate) document the upload, language codes, and synthesis request.

The restricted endpoint is `POST /api/voicebip/tool`. It checks HMAC-SHA256 over the exact raw body using `VOICEBIP_WEBHOOK_SECRET`, accepts hex signatures with or without the `sha256=` prefix, requires the tool name `get_public_incident_updates` when supplied, and uses only `polling_unit_code`. It returns only staff-approved, dated public-safe summaries. No updates returns an explicit unavailable response that says this does not mean the place is safe. The query never reads reports, evidence, witnesses, staff notes, or incident internals.

### Dashboard setup

1. Open the existing hosted agent attached to the provisioned number. Keep its existing inbound voice setup.
2. In the agent's **Tools** section, add `get_public_incident_updates` with a short description such as “Retrieve only approved public updates for a polling unit. If no update is returned, say information is unavailable and do not infer safety.”
3. Define one required string argument: `polling_unit_code` (approved Signa polling-unit code). Do not add report IDs, caller details, evidence fields, or general database lookup arguments.
4. Set the tool's HTTPS webhook URL to `https://<Signa-host>/api/voicebip/tool` and enable the Voicebip webhook signing secret. Put the same secret in server-only `VOICEBIP_WEBHOOK_SECRET`.
5. Set the agent instructions to read the returned dated summaries as the complete source of incident updates, never infer safety from an empty result, and never claim Signa verified a report.
6. Use Voicebip's test webhook in its dashboard/API and verify a valid signed invocation, a bad signature rejection, and an empty-update answer before using the number.

The published Voicebip docs confirm the event name and signature header but the docs available during implementation did not expose the complete tool invocation JSON schema or exact tool-result envelope. The handler accepts the documented `tool.invocation` event with tool name/arguments at top-level or under `data`; confirm the provider's live tool editor's request and result envelope with the sandbox before activation. That contract check remains a release blocker; do not claim Voicebip tool calls are connected until the signed sandbox test succeeds.

Staff must insert public updates through a trusted administrative database session, set `approved=true`, `approved_by`, and `approved_at` together. No public update management API is included in this integration.

## Intron Sahara browser speech

The browser page is `/voice`. It records locally, then sends audio to `POST /api/voice/turn`; no Intron credential is sent to the browser. The route accepts up to 5 MiB, permits WAV/MP3/MP4/M4A/OGG/WebM/FLAC MIME types supported by Intron's file upload docs, and uses its documented synchronous upload endpoint (≤120 seconds). It requests the selected language, then returns a fixed, safe response in the same language using TTS and plays the audio in the browser. It does not submit a report and discourages personal details.

Server-only `INTRON_API_KEY` is required. The route uses the documented STT multipart field names and TTS JSON fields, bounded timeouts, a five-request-per-minute per-process throttle, and a restricted Intron-host audio download. Production must replace the process-local throttle with a shared rate limiter. The current client requires a language selection; automatic language identification is disabled because the official supported-language table lists language codes but does not validate an `auto` code or detection confidence. On uncertain input there is no silent language guess; the caller must choose a language and retry. Current output languages are intended to be English (`en`), Pidgin (`pcm`), Yoruba (`yo`), Hausa (`ha`) and Igbo (`ig`), but none are marked tested until live provider calls pass.

This browser path is separate from Voicebip telephony. Voicebip's own documentation describes its phone speech pipeline; no Intron integration into the provisioned telephone line is claimed.

## Configuration and migration

Apply `supabase/migrations/20261119150000_ai_voice_integrations.sql` after reviewing the project. It adds consent storage, private assessment records, and an RLS-enabled public-safe update table with no browser policies.

Set server environment variables:

```text
GEMINI_API_KEY=<Gemini API key>
GEMINI_MODEL=gemini-2.5-flash
INTRON_API_KEY=<Intron Voice API key>
VOICEBIP_WEBHOOK_SECRET=<Voicebip webhook signing secret>
```

Do not set any of these with `NEXT_PUBLIC_`. Existing Supabase server credentials are also required for monitor assessment and public-safe update lookups.

## Verification status

Provider calls must be tested using clearly fictional report text, synthetic fictional imagery, and non-sensitive speech. No successful provider call is simulated by this implementation. The feature worktree has no provider credentials or configured Supabase database available at implementation time, so live Gemini, Intron, and Voicebip signed sandbox results remain unverified. Re-run the provider tests when credentials and sandbox access are configured; only claim tested languages after successful STT and same-language TTS calls for each language.
