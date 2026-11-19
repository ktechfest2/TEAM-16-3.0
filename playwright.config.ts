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
      NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_only",
      SUPABASE_SECRET_KEY: "fixture_server_key_only",
      SUPABASE_SERVICE_ROLE_KEY: "fixture_server_key_only",
      NEXT_TELEMETRY_DISABLED: "1",
      SIGNA_NEXT_DIST_DIR: process.env.SIGNA_NEXT_DIST_DIR ?? ".next-e2e",
    },
  },
});
