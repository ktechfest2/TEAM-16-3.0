# Problem brief: the missing accountability loop

**KTech Fest 3.0 · Every Vote, Every Voice · Team 16**

## The weak link

An election incident can be witnessed, reported and forgotten without a trustworthy record of what happened next. Calls, messages and social posts fragment reports; photos can lose their place and time context; repeated accounts can look like independent corroboration. A citizen may have no receipt or status update. An observer may see disconnected allegations rather than a case that can be reviewed and followed up.

This gap matters across Nigeria's large electoral geography and on mobile networks with intermittent service. It also matters where language and accessibility make a web-only reporting route insufficient. Signa addresses this specific reporting-to-follow-up gap; it does not claim to fix every election problem.

## Who is affected

- **Citizens** need a safe way to submit an allegation, retain it through outages and see whether it was received and reviewed.
- **Election observers and reviewers** need location context, private evidence, related-report signals and an auditable independent review decision.
- **Coordinators** need assigned responsibility and a written record of internal follow-up.

## The response

Signa connects **Alert → Verify → Respond**. A citizen selects a polling unit and can attach evidence. The server issues a receipt; an offline outbox retries without turning a pending report into a false success. Authorized staff group reports, inspect private evidence and require a separate human reviewer to record findings. A coordinator can acknowledge an assignment and document actions. The original reporter sees a limited progress status.

The central innovation is the **accountability loop**, not automatic truth certification. AI assists with provisional summaries and public-source comparison, but it does not declare allegations true or trigger emergency response.

## Scope and evidence

The product uses an imported directory snapshot of 176,846 polling-unit records across 774 LGAs, 8,809 wards and 36 states plus the FCT. These numbers describe geographic records, not adoption. Hosted checks on 20 November 2026 confirmed the directory, a full controlled fictional report-to-coordinator journey, local image inspection, Gemini observations on a staged image and the signed public-information webhook. See the [README](../README.md) for remaining limits.

Signa is independent and nonpartisan. It does not represent INEC, provide emergency dispatch or guarantee outside intervention.
