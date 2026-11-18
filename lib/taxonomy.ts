import {
  Accessibility, Banknote, CircleHelp, OctagonAlert, PackageX, ShieldAlert, UserX,
  CircleDashed, CircleCheck, CircleMinus, CircleSlash, Inbox, UserCheck, Handshake,
  ClipboardCheck, Archive, type LucideIcon,
} from "lucide-react";
import type { ReportCategory } from "./report-contract";

export type Tone = "neutral" | "signal" | "trust" | "alert" | "warn" | "ok";

export type CategoryMeta = {
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
  /** Triage weight only — never presented as proof or verification. */
  priority: 1 | 2 | 3;
};

export const categoryMeta: Record<ReportCategory, CategoryMeta> = {
  violence: {
    label: "Violence or physical harm", short: "Violence", icon: ShieldAlert, tone: "alert", priority: 1,
    description: "Physical harm, assault or destruction observed at or near a polling unit.",
  },
  intimidation: {
    label: "Intimidation or threats", short: "Intimidation", icon: UserX, tone: "alert", priority: 1,
    description: "Threats or pressure directed at voters, officials or observers.",
  },
  vote_buying: {
    label: "Vote buying or inducement", short: "Vote buying", icon: Banknote, tone: "warn", priority: 2,
    description: "Money, goods or favours offered in exchange for a vote.",
  },
  missing_materials: {
    label: "Missing or late materials", short: "Materials", icon: PackageX, tone: "warn", priority: 2,
    description: "Ballots, result sheets or equipment missing, late or insufficient.",
  },
  disruption: {
    label: "Voting disruption", short: "Disruption", icon: OctagonAlert, tone: "warn", priority: 2,
    description: "Process interrupted, suspended or obstructed at the unit.",
  },
  accessibility_barrier: {
    label: "Accessibility barrier", short: "Accessibility", icon: Accessibility, tone: "signal", priority: 3,
    description: "A voter was unable to access or use the polling unit.",
  },
  other: {
    label: "Other concern", short: "Other", icon: CircleHelp, tone: "neutral", priority: 3,
    description: "Anything else a monitor should look at.",
  },
};

export function category(value: string): CategoryMeta {
  return categoryMeta[value as ReportCategory] ?? categoryMeta.other;
}

/* ---------------- Review state (monitor-owned) ---------------- */

export type ReviewState = "under_review" | "supported" | "inconclusive" | "not_supported";

export const reviewMeta: Record<ReviewState, { label: string; tone: Tone; icon: LucideIcon; help: string }> = {
  under_review: {
    label: "Under review", tone: "signal", icon: CircleDashed,
    help: "A human monitor is still assessing the linked reports.",
  },
  supported: {
    label: "Supported by evidence", tone: "ok", icon: CircleCheck,
    help: "Reviewed observations support what was reported. Not a legal finding.",
  },
  inconclusive: {
    label: "Inconclusive", tone: "warn", icon: CircleMinus,
    help: "The available observations are not sufficient either way.",
  },
  not_supported: {
    label: "Not supported", tone: "neutral", icon: CircleSlash,
    help: "Review did not find support for what was reported.",
  },
};

/* ---------------- Response state (coordination-owned) ---------------- */

export type ResponseState = "unassigned" | "assigned" | "acknowledged" | "followup_recorded" | "closed";

export const responseMeta: Record<ResponseState, { label: string; tone: Tone; icon: LucideIcon; help: string }> = {
  unassigned: {
    label: "Unassigned", tone: "neutral", icon: Inbox,
    help: "No coordinator has picked this case up yet.",
  },
  assigned: {
    label: "Assigned", tone: "signal", icon: UserCheck,
    help: "Routed to a coordinator for internal follow-up.",
  },
  acknowledged: {
    label: "Acknowledged", tone: "trust", icon: Handshake,
    help: "The coordinator confirmed receipt. This is not an emergency dispatch.",
  },
  followup_recorded: {
    label: "Follow-up recorded", tone: "trust", icon: ClipboardCheck,
    help: "An internal follow-up action was logged against this case.",
  },
  closed: {
    label: "Closed", tone: "neutral", icon: Archive,
    help: "No further internal action is planned.",
  },
};

/* ---------------- Delivery state (reporter-facing) ---------------- */

export type DeliveryState = "saved" | "sending" | "received" | "failed";

export const deliveryMeta: Record<DeliveryState, { label: string; tone: Tone; help: string }> = {
  saved: { label: "Saved on this device", tone: "warn", help: "Stored locally. Not yet delivered to the server." },
  sending: { label: "Sending", tone: "signal", help: "Attempting delivery now." },
  received: { label: "Received by server", tone: "ok", help: "The server confirmed receipt. Review has not necessarily started." },
  failed: { label: "Delivery failed", tone: "alert", help: "Still saved locally. It will retry when you sync." },
};

export const caseEventMeta: Record<string, { label: string; tone: Tone }> = {
  case_created: { label: "Case opened", tone: "signal" },
  reports_linked: { label: "Reports linked", tone: "signal" },
  review_recorded: { label: "Review recorded", tone: "ok" },
  assignment_created: { label: "Assigned to coordinator", tone: "signal" },
  assignment_acknowledged: { label: "Assignment acknowledged", tone: "trust" },
  followup_recorded: { label: "Follow-up recorded", tone: "trust" },
  case_closed: { label: "Case closed", tone: "neutral" },
};
