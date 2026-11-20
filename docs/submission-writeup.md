# Signa: short submission write-up

**Team 16 · KTech Fest 3.0 · Every Vote, Every Voice**

## Problem and solution

The weak link we chose is the gap between witnessing an election incident, determining what can responsibly be said about it and recording accountable follow-up. Reports can fragment across channels, evidence can lose context, and citizens may have no receipt or later update.

Signa joins **Alert → Verify → Respond**. Citizens submit allegations against a selected polling unit, optionally with private photo evidence. An offline outbox supports weak connectivity. Authorized reviewers can group potentially related reports and inspect evidence; a distinct reviewer records a human decision. A coordinator can accept internal responsibility and document follow-up. The reporter receives a limited status update.

## Practical fit

The mobile interface uses a nationwide imported directory snapshot: 176,846 polling-unit records, 8,809 wards, 774 LGAs and 36 states plus the FCT. IndexedDB and retry-safe submission address intermittent connectivity. Separate roles and audit history support accountable review. The owner confirms the telephone line works; QA verified the signed public-information webhook but did not observe a live call reaching it.

## AI and tools

Gemini provides provisional incident observations only for approved fresh fictional tests, and optional public-image observations and screenshot text extraction with consent. Google Fact Check Tools retrieves available published fact checks for public Verify. The interface cites only returned sources and says when evidence is insufficient. Intron Sahara speech capabilities were evaluated independently; integration into Voicebip telephone audio is unverified. Voicebip hosts the telephone agent and connects to a restricted signed information tool.

The application uses Next.js, React, TypeScript, Tailwind CSS, Supabase Authentication, PostgreSQL with row-level security, private Storage, IndexedDB, Vercel, Playwright and GitHub Actions. ChatGPT, OpenAI Codex and Claude Code assisted development. See [attribution](attribution.md).

## Limits and impact

Signa is nonpartisan and independent. AI cannot certify an allegation, verify image authenticity, identify a perpetrator or determine an election result. Human review remains authoritative; acknowledgement is internal and does not guarantee institutional action. The product provides a practical foundation for citizens, observers and authorized coordinators; no adoption, impact or partnership figures are claimed.

The hosted acceptance status is in the [README](../README.md). One full fictional report-to-coordinator workflow passed after the controlled reporter was approved in production. A real telephone call and sourced public Verify result remain unaccepted. No demo-video URL is listed until the actual video is supplied.
