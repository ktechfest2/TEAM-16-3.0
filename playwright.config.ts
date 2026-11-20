import { defineConfig } from "@playwright/test";

const baseURL = process.env.SIGNA_E2E_BASE_URL ?? "http://127.0.0.1:3210";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    reducedMotion: "reduce",
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
      : {}),
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: process.env.SIGNA_E2E_EXTERNAL_SERVER === "true" ? undefined : {
    command: process.env.SIGNA_E2E_SERVER_COMMAND ?? "npm run dev -- --webpack --hostname 127.0.0.1 --port 3210",
    url: `${baseURL}/my-reports`,
    reuseExistingServer: process.env.SIGNA_E2E_REUSE_SERVER === "true",
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
      SUPABASE_SECRET_KEY: "fixture_server_key_only",
      SUPABASE_SERVICE_ROLE_KEY: "fixture_server_key_only",
      NEXT_TELEMETRY_DISABLED: "1",
      SIGNA_DEMO_MODE: "true",
      SIGNA_DEMO_PROJECT_REF: "abcdefghijklmnopqrst",
      SIGNA_DEMO_SESSION_MAX_SECONDS: "1800",
      SIGNA_DEMO_CITIZEN_USER_ID: "00000000-0000-4000-8000-000000000701",
      SIGNA_DEMO_CITIZEN_EMAIL: "citizen@demo.invalid",
      SIGNA_DEMO_CITIZEN_PASSWORD: "fixture-password-citizen",
      SIGNA_DEMO_REVIEWER_1_USER_ID: "00000000-0000-4000-8000-000000000702",
      SIGNA_DEMO_REVIEWER_1_EMAIL: "reviewer1@demo.invalid",
      SIGNA_DEMO_REVIEWER_1_PASSWORD: "fixture-password-reviewer-one",
      SIGNA_DEMO_REVIEWER_2_USER_ID: "00000000-0000-4000-8000-000000000703",
      SIGNA_DEMO_REVIEWER_2_EMAIL: "reviewer2@demo.invalid",
      SIGNA_DEMO_REVIEWER_2_PASSWORD: "fixture-password-reviewer-two",
      SIGNA_DEMO_COORDINATOR_USER_ID: "00000000-0000-4000-8000-000000000704",
      SIGNA_DEMO_COORDINATOR_EMAIL: "coordinator@demo.invalid",
      SIGNA_DEMO_COORDINATOR_PASSWORD: "fixture-password-coordinator",
      SIGNA_NEXT_DIST_DIR: process.env.SIGNA_NEXT_DIST_DIR ?? ".next-e2e",
    },
  },
});
