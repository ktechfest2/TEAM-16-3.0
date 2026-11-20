export const demoRoles = ["citizen", "reviewer1", "reviewer2", "coordinator"] as const;
export type DemoRole = (typeof demoRoles)[number];

export type DemoAccount = {
  userId: string;
  email: string;
  password: string;
  trustedRole: "reporter" | "monitor" | "coordinator";
  destination: "/report" | "/monitor" | "/coordinator";
};

export type DemoConfiguration = {
  enabled: true;
  projectRef: string;
  maxSessionSeconds: number;
  accounts: Record<DemoRole, DemoAccount>;
} | { enabled: false };

type Environment = Record<string, string | undefined>;
const productionProjectRef = "zddmcuidtzvwalvdtfqp";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const definitions: Record<DemoRole, { prefix: string; trustedRole: DemoAccount["trustedRole"]; destination: DemoAccount["destination"] }> = {
  citizen: { prefix: "SIGNA_DEMO_CITIZEN", trustedRole: "reporter", destination: "/report" },
  reviewer1: { prefix: "SIGNA_DEMO_REVIEWER_1", trustedRole: "monitor", destination: "/monitor" },
  reviewer2: { prefix: "SIGNA_DEMO_REVIEWER_2", trustedRole: "monitor", destination: "/monitor" },
  coordinator: { prefix: "SIGNA_DEMO_COORDINATOR", trustedRole: "coordinator", destination: "/coordinator" },
};

function exactProjectOrigin(rawUrl: string, projectRef: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.origin === `https://${projectRef}.supabase.co` && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function parseDemoRole(value: unknown): DemoRole | null {
  return typeof value === "string" && demoRoles.includes(value as DemoRole) ? value as DemoRole : null;
}

export function readDemoConfiguration(env: Environment): DemoConfiguration {
  if (env.SIGNA_DEMO_MODE !== "true") return { enabled: false };
  const projectRef = env.SIGNA_DEMO_PROJECT_REF || "";
  if (!/^[a-z0-9]{20}$/.test(projectRef) || projectRef === productionProjectRef)
    throw new Error("Demo access requires a distinct 20-character Supabase project reference");
  if (!exactProjectOrigin(env.NEXT_PUBLIC_SUPABASE_URL || "", projectRef))
    throw new Error("Demo project reference and Supabase URL do not match exactly");
  const maxSessionSeconds = Number(env.SIGNA_DEMO_SESSION_MAX_SECONDS || "1800");
  if (!Number.isInteger(maxSessionSeconds) || maxSessionSeconds < 300 || maxSessionSeconds > 3600)
    throw new Error("Demo session lifetime must be between 300 and 3600 seconds");

  const accounts = {} as Record<DemoRole, DemoAccount>;
  for (const role of demoRoles) {
    const definition = definitions[role];
    const userId = env[`${definition.prefix}_USER_ID`] || "";
    const email = env[`${definition.prefix}_EMAIL`] || "";
    const password = env[`${definition.prefix}_PASSWORD`] || "";
    if (!uuid.test(userId) || !email.includes("@") || password.length < 16)
      throw new Error(`Demo account configuration is incomplete for ${role}`);
    accounts[role] = { userId: userId.toLowerCase(), email, password, trustedRole: definition.trustedRole, destination: definition.destination };
  }
  const ids = demoRoles.map((role) => accounts[role].userId);
  const emails = demoRoles.map((role) => accounts[role].email.toLowerCase());
  if (new Set(ids).size !== ids.length || new Set(emails).size !== emails.length)
    throw new Error("Every demo role requires a distinct account identity");
  return { enabled: true, projectRef, maxSessionSeconds, accounts };
}
