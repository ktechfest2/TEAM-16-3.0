# Signa design system

- **Version:** 1.0
- **Product:** Nonpartisan election incident reporting and coordination
- **Brand promise:** Make a field observation easy to report, safe to preserve, and clear to review.

## Brand foundation

Signa serves witnesses, monitors, and coordinators working under time pressure and imperfect connectivity. The interface must lower stress, make the next action obvious, and distinguish a report from a verified finding.

### Brand traits

- **Calm under pressure:** use clear hierarchy, quiet surfaces, and direct instructions.
- **Impartial:** no party colors, flags, campaign imagery, or language that assigns blame.
- **Human-reviewed:** show where a person must make a decision; never let volume or automation look like proof.
- **Exact:** make location, delivery, review, and response states explicit.
- **Protective:** explain privacy and personal safety at the moment they matter.

### Voice

Write in short, active sentences. Use the words witnesses use: *report, save, send, received, review,* and *follow up*. A local save is never called a delivery. A received report is never called verified. Errors name what failed and the next useful action.

## Logo

The symbol is an **open evidence frame**: a point of observation travels through two review ticks while remaining inside a record. Its open corners signal that evidence is examined by people; it is not a target, broadcast, or verdict.

- Use the standalone mark in navigation, app icons, and compact spaces.
- Use the mark with the live text wordmark `Signa`; do not bake the name or a slogan into an image.
- Keep clear space of at least one quarter of the mark width on every side.
- Minimum mark size: 20 px in the interface; use the wordmark lockup at 96 px wide or larger.
- Use the ink mark on light surfaces and the reversed white mark on dark surfaces. Blue is an accent, never a party identity.
- Do not stretch, rotate, add a glow, place it on a busy image, or add flag, ballot, shield, or radio-wave imagery.

The generated raster exploration is [signa-mark-concept.png](public/brand/signa-mark-concept.png). The production mark is a small inline SVG in `components/signa/logo.tsx` so it remains crisp and accessible at every size.

## Color

The palette takes its cues from a field record: mineral paper, ink, and a small number of status inks. Color carries meaning; it is not decoration.

| Token | Hex | Use |
|---|---|---|
| Ink | `#14212B` | Primary text, navigation, dark surfaces |
| Field paper | `#F2F5F2` | App canvas and quiet grouped regions |
| White | `#FFFFFF` | Forms, report sheets, and high-focus surfaces |
| Signal blue | `#2459D6` | Primary actions, links, active navigation, received state |
| Review teal | `#11766E` | Human review, coordinator follow-up, supportive actions |
| Waiting amber | `#9A5B0A` | Offline, queued, and waiting states |
| Incident red | `#B6383F` | Urgent incident categories and blocking errors only |
| Muted ink | `#52616B` | Secondary text and supporting metadata |
| Hairline | `#D8E0DD` | Dividers, input borders, and card outlines |

The text colors above meet WCAG AA on the paper or white surface (minimum measured contrast is 5.42:1). Tinted status backgrounds may be lighter, but status text must use the corresponding dark ink, an icon, and a written label. Never use color as the only indicator.

Use one accent per action group. Avoid gradients, rainbow status palettes, and political red/blue pairings.

## Typography

Self-host fonts so screens do not depend on Google Fonts at runtime and remain available offline after installation.

| Role | Typeface | Use |
|---|---|---|
| Display | Manrope Variable | Page titles and short section headings; weights 600–750 |
| Interface | Inter Variable | Body copy, fields, navigation, buttons; weights 400–650 |
| Data | IBM Plex Mono | Report references, timestamps, IDs, and compact audit labels |

Use sentence case. Reserve uppercase micro-labels for short category markers; keep them at 11–12 px with generous tracking. Never set long passages in mono or use extra-light text for important instructions.

### Type scale

| Name | Desktop | Mobile | Line height |
|---|---:|---:|---:|
| Display | 48 px | 38 px | 1.08 |
| H1 | 40 px | 32 px | 1.12 |
| H2 | 30 px | 26 px | 1.18 |
| H3 | 22 px | 20 px | 1.25 |
| Body | 16 px | 16 px | 1.55 |
| Supporting | 14 px | 14 px | 1.45 |
| Metadata | 12 px | 12 px | 1.35 |

Use a readable measure of 60–68 characters for explanatory text. Keep report descriptions at 16 px or larger on mobile.

## Layout and signature

The visual signature is the **Signal Spine**: a thin vertical or horizontal rule with a point and two short review ticks. Use it to show real sequence or state, especially report delivery and the Alert → Verify → Respond flow. Do not use it as generic decoration.

- Base spacing on a 4 px unit: `4, 8, 12, 16, 24, 32, 48, 64, 96`.
- Main content width: 1,200 px. Staff workspaces may extend to 1,360 px. Reading columns stay under 68 characters.
- Use a 12-column desktop grid, 8-column tablet grid, and 4-column mobile grid.
- Page gutters: 24 px desktop, 20 px tablet, 16 px mobile.
- Controls: 10 px radius. Cards and panels: 12–16 px radius. Status labels: compact rounded rectangles, not pills with decoration.
- Prefer one strong surface and one quiet grouped surface. Use borders for structure; reserve shadows for popovers and floating controls.
- On mobile, keep the primary action reachable, provide a 44×44 px minimum touch target, and account for device safe areas.

### Page composition

- **Public home:** lead with a clear product thesis and a real three-stage process; keep sample content explicitly labelled illustrative.
- **Witness report:** one focused column, visible offline state, progressive steps, persistent save/sync feedback, and an always-visible safety note near the submit action.
- **Monitor/coordinator:** prioritize queue, filters, selected record, and next action. Use denser tables only where comparison helps; keep the incident narrative readable.
- **Empty states:** explain why the area is empty and offer one relevant next action.

## Components and interaction

### Actions

- Primary button: signal blue with white text; one primary action per region.
- Destructive or urgent action: incident red only when the action itself is urgent or dangerous. A report category being red does not make its submit button red.
- Secondary action: white surface, ink text, clear border.
- Disabled state: retain readable text and explain what is needed to enable the action.

### Forms

- Persistent visible labels; helper text appears before the user needs to recover from an error.
- Keep field order aligned with the witness’s task: where, what, description, optional evidence.
- Preserve entered content after a network failure. Show local-save confirmation before trying to send.
- Camera and gallery controls are explicit and user-initiated. Camera denial or cancellation must leave the report usable.

### Status language

| State | Label | Meaning |
|---|---|---|
| Local | Saved on this device | Stored locally; the server has not received it |
| Sending | Sending | A request is in progress |
| Received | Received by server | A matching server receipt exists; no review outcome is implied |
| Failed | Needs attention / Will retry | The report remains local; explain the specific recovery step |
| Review | Under review | A human monitor has started review |
| Response | Assigned / Acknowledged / Follow-up recorded | Internal coordination state, not emergency dispatch |

Report delivery and evidence upload are separate statuses. A photo failure never changes a confirmed report receipt.

### Feedback and motion

- Use immediate, polite feedback for save, send, and retry actions.
- Keep state transitions between 120–200 ms; use no ambient loops or decorative parallax.
- Respect `prefers-reduced-motion`. Never hide critical content until animation completes.
- Announce asynchronous status changes through a concise `aria-live` region.

## Accessibility and trust

- Target WCAG 2.2 AA, including keyboard use, visible focus, zoom, reduced motion, and text contrast.
- Use semantic headings, labels, fieldsets, buttons, links, and status announcements.
- Keep touch targets at least 44×44 px and avoid hover-only instructions.
- Pair every status color with text and an icon where useful.
- Do not imply report volume proves an incident. Do not expose private evidence in public pages or logs.
- Place personal safety guidance before evidence capture; never encourage a witness to approach danger.

## Design tokens

The CSS source of truth is `app/globals.css`. Keep semantic names in CSS variables and map utility classes to those values. Self-hosted font files belong to the app bundle; do not load fonts from a third-party runtime host.

```css
:root {
  --color-ink: #14212B;
  --color-paper: #F2F5F2;
  --color-white: #FFFFFF;
  --color-signal: #2459D6;
  --color-review: #11766E;
  --color-waiting: #9A5B0A;
  --color-incident: #B6383F;
  --color-muted: #52616B;
  --color-hairline: #D8E0DD;
  --radius-control: 10px;
  --radius-panel: 14px;
}
```

## Brand asset

The generated concept was created with the built-in image generation tool as a transparent logo exploration. The interface uses the hand-refined SVG mark rather than the bitmap, preserving small-size clarity and theme control.
