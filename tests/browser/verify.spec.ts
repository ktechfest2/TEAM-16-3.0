import { expect, test } from "@playwright/test";

const outcomes = [
  ["supported", "Supported by available evidence"],
  ["contradicted", "Contradicted by available evidence"],
  ["misleading", "Misleading or missing context"],
  ["conflicting", "Conflicting evidence"],
  ["insufficient_evidence", "Insufficient evidence"],
] as const;

for (const [outcome, label] of outcomes) test(`Verify renders ${outcome} with a real citation`, async ({ page, context }) => {
  await context.route("**/api/verify", route => route.fulfill({ json: {
    analysisStatus: "completed",
    analysis: { outcome, explanation: "The available published review directly addresses the submitted claim.", citedSourceIds: ["source-1"], uncertainty: "Coverage may be incomplete." },
    sources: [{ id: "source-1", title: "Published evidence review", url: "https://dubawa.org/fact-check", publisher: "DUBAWA", publishedAt: "2026-11-20", claim: "Reviewed election claim", rating: "False" }],
    coverage: [{ publisher: "DUBAWA", domain: "dubawa.org", searched: true }, { publisher: "INEC", domain: "inecnigeria.org", searched: false }],
    inputSource: null, linkWarning: null, notice: "Signa Verify summarizes available evidence.",
  } }));
  await page.goto("/verify");
  await page.getByLabel("Claim or message").fill("A controlled fictional election claim");
  await page.getByLabel(/I agree that the text/).check();
  await page.getByRole("button", { name: "Check available evidence" }).click();
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Published evidence review/ })).toHaveAttribute("href", "https://dubawa.org/fact-check");
  await expect(page.getByText("INEC: unavailable", { exact: true })).toBeVisible();
});

test("Verify reports provider failure without inventing a result", async ({ page, context }) => {
  await context.route("**/api/verify", route => route.fulfill({ status: 503, json: { error: { message: "A required service is temporarily unavailable" } } }));
  await page.goto("/verify");
  await page.getByLabel("Claim or message").fill("A controlled fictional election claim");
  await page.getByLabel(/I agree that the text/).check();
  await page.getByRole("button", { name: "Check available evidence" }).click();
  await expect(page.getByText("A required service is temporarily unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText(/Supported by available evidence/)).toHaveCount(0);
});

test("Verify presents separate text, link and image modes with inline results", async ({ page, context }) => {
  await context.route("**/api/verify", route => route.fulfill({ json: {
    analysisStatus: "completed", analysis: { outcome: "insufficient_evidence", explanation: "No matching review was returned.", citedSourceIds: [], uncertainty: "Coverage may be incomplete." }, sources: [], coverage: [], inputSource: null, linkWarning: null, notice: "No certification is made.",
  } }));
  await page.goto("/verify");
  await expect(page.getByRole("tab", { name: "Text" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Link" }).click();
  await expect(page.getByLabel("Public article link")).toBeVisible();
  await page.getByRole("tab", { name: "Image" }).click();
  await expect(page.getByLabel("Image to inspect")).toBeVisible();
  await expect(page.getByText(/Screenshot extraction is not enabled/)).toHaveCount(0);
  await page.getByRole("tab", { name: "Text" }).click();
  await page.getByLabel("Claim or message").fill("A controlled fictional election claim");
  await page.getByLabel(/I agree that the text/).check();
  await page.getByRole("button", { name: "Check available evidence" }).click();
  await expect(page.getByText("Insufficient evidence", { exact: true })).toBeVisible();
});

test("switching modes clears link warnings and ignores a delayed result from the prior mode", async ({ page, context }) => {
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await context.route("**/api/verify", async route => {
    await responseGate;
    await route.fulfill({ json: {
      analysisStatus: "completed",
      analysis: { outcome: "insufficient_evidence", explanation: "Delayed link result.", citedSourceIds: [], uncertainty: "Coverage may be incomplete." },
      sources: [], coverage: [], inputSource: null, linkWarning: "The article could not be read.", notice: "No certification is made.",
    } });
  });
  await page.goto("/verify");
  await page.getByRole("tab", { name: "Link" }).click();
  await page.getByLabel("Public article link").fill("https://dubawa.org/example");
  await page.getByLabel("Claim text (recommended fallback)").fill("A controlled fictional election claim");
  await page.getByLabel(/I agree that the text/).check();
  await page.getByRole("button", { name: "Check available evidence" }).click();
  await page.getByRole("tab", { name: "Image" }).click();
  releaseResponse();
  await expect(page.getByLabel("Image to inspect")).toBeVisible();
  await expect(page.getByText("The article could not be read.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Delayed link result.", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Link" }).click();
  await expect(page.getByLabel("Public article link")).toHaveValue("");
});
