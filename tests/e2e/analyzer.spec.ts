import { expect, type Page, test } from "@playwright/test";

const EVALUATION_ID = "3c55ef5b-1bc5-40c2-b332-c24ac8854533";
const PRIVATE_DRAFT =
  "I replaced eight sequential checks with one bounded evaluation call. The result reduced duplicated context while the score stayed deterministic.";

const dimensions = {
  hook: {
    level: 3,
    explanation: "The opening creates a clear reason to continue.",
    score: 75,
  },
  specificity: {
    level: 3,
    explanation: "The implementation detail makes the point concrete.",
    score: 75,
  },
  novelty: {
    level: 2,
    explanation: "The post adds a useful distinction to a familiar idea.",
    score: 50,
  },
  clarity: {
    level: 4,
    explanation: "The central idea is exceptionally clear.",
    score: 100,
  },
  discussionPotential: {
    level: 3,
    explanation: "The tradeoff invites a substantive response.",
    score: 75,
  },
  credibility: {
    level: 3,
    explanation: "Concrete experience supports the main claim.",
    score: 75,
  },
  skimmability: {
    level: 3,
    explanation: "The structure is easy to scan.",
    score: 75,
  },
  emotionalResonance: {
    level: 1,
    explanation: "The post creates a limited human response.",
    score: 25,
  },
} as const;

const successResponse = {
  evaluationId: EVALUATION_ID,
  evaluation: {
    rubric: { id: "postlens-linkedin", version: "1.0.0" },
    overallScore: 72,
    scoreInterpretation: {
      id: "solid",
      label: "Solid",
      minimumScore: 60,
      maximumScore: 74,
    },
    dimensions,
    strongestDimension: "clarity",
    weakestDimension: "emotionalResonance",
    contentType: "case-study",
    summary:
      "This case study draft is strongest in Clarity and weakest in Emotional Resonance against the current rubric.",
  },
};

async function fulfillSuccess(page: Page, delayMs = 0) {
  await page.route("**/api/evaluations", async (route) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await route.fulfill({ status: 200, json: successResponse });
  });
}

async function openAnalyzer(page: Page) {
  await page.goto("/");
  return page.getByLabel("LinkedIn draft");
}

test("submits a draft and renders the complete rubric result", async ({
  page,
}) => {
  await fulfillSuccess(page);
  const draft = await openAnalyzer(page);
  await draft.fill(PRIVATE_DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();

  const resultHeading = page.getByRole("heading", {
    name: "Your rubric result",
  });
  await expect(resultHeading).toBeVisible();
  await expect(resultHeading).toBeFocused();
  await expect(page.getByText("Post Potential: 72 out of 100")).toBeAttached();
  await expect(page.getByText("Case study", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Focus next on Emotional Resonance"),
  ).toBeVisible();

  for (const label of [
    "Hook",
    "Specificity",
    "Novelty",
    "Clarity",
    "Discussion Potential",
    "Credibility",
    "Skimmability",
    "Emotional Resonance",
  ]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
});

test("shows a shape-matched loading state and supports keyboard submission", async ({
  page,
}) => {
  await fulfillSuccess(page, 300);
  const draft = await openAnalyzer(page);
  await draft.fill(PRIVATE_DRAFT);
  await draft.press("Control+Enter");

  await expect(page.getByLabel("Preparing evaluation results")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analyzing..." }),
  ).toBeDisabled();
  await expect(
    page.getByText("Analysis complete. Results are ready."),
  ).toBeAttached();
});

test("uses Unicode-aware limits at both exact boundaries", async ({ page }) => {
  const submitted: string[] = [];
  await page.route("**/api/evaluations", async (route) => {
    const body = route.request().postDataJSON() as { content: string };
    submitted.push(body.content);
    await route.fulfill({ status: 200, json: successResponse });
  });
  const draft = await openAnalyzer(page);
  const button = page.getByRole("button", { name: "Analyze draft" });

  await draft.fill("🚀".repeat(20));
  await expect(button).toBeEnabled();
  await button.click();
  await expect(
    page.getByRole("heading", { name: "Your rubric result" }),
  ).toBeVisible();

  await draft.fill("a".repeat(3_000));
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(Array.from(submitted[0] ?? "")).toHaveLength(20);
  expect(Array.from(submitted[1] ?? "")).toHaveLength(3_000);
});

test("blocks invalid drafts with linked field feedback", async ({ page }) => {
  const draft = await openAnalyzer(page);
  const button = page.getByRole("button", { name: "Analyze draft" });

  await draft.fill("a".repeat(19));
  await expect(button).toBeDisabled();
  await expect(page.getByText("Add 1 more character.")).toBeVisible();
  await expect(draft).toHaveAttribute("aria-invalid", "true");

  await draft.fill("a".repeat(3_001));
  await expect(button).toBeDisabled();
  await expect(page.getByText("Remove 1 character.")).toBeVisible();
});

test("retries one expected failure and preserves the draft", async ({
  page,
}) => {
  let attempt = 0;
  await page.route("**/api/evaluations", async (route) => {
    attempt += 1;

    if (attempt === 1) {
      await route.fulfill({
        status: 504,
        json: {
          error: {
            code: "EVALUATION_TIMEOUT",
            message: "The evaluation took too long. Please try again.",
            retryable: true,
            evaluationId: EVALUATION_ID,
          },
        },
      });
      return;
    }

    await route.fulfill({ status: 200, json: successResponse });
  });
  const draft = await openAnalyzer(page);
  await draft.fill(PRIVATE_DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();

  const errorHeading = page.getByRole("heading", {
    name: "Your draft is still here.",
  });
  await expect(errorHeading).toBeFocused();
  await expect(draft).toHaveValue(PRIVATE_DRAFT);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Your rubric result" }),
  ).toBeVisible();
  expect(attempt).toBe(2);
});

test("does not offer retry for a non-retryable failure", async ({ page }) => {
  await page.route("**/api/evaluations", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "EVALUATION_UNAVAILABLE",
          message: "Evaluation is temporarily unavailable.",
          retryable: false,
          evaluationId: EVALUATION_ID,
        },
      },
    }),
  );
  const draft = await openAnalyzer(page);
  await draft.fill(PRIVATE_DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();

  await expect(
    page.getByText("Evaluation is temporarily unavailable."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(draft).toHaveValue(PRIVATE_DRAFT);
});

for (const failure of [
  {
    code: "EVALUATION_BUSY",
    status: 429,
    message: "The evaluator is busy. Please try again shortly.",
    retryable: true,
  },
  {
    code: "EVALUATION_FAILED",
    status: 502,
    message: "The evaluator could not complete this request. Please try again.",
    retryable: true,
  },
  {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "The evaluation could not be completed.",
    retryable: false,
  },
] as const) {
  test(`renders ${failure.code} with the documented retry behavior`, async ({
    page,
  }) => {
    await page.route("**/api/evaluations", (route) =>
      route.fulfill({
        status: failure.status,
        json: {
          error: {
            code: failure.code,
            message: failure.message,
            retryable: failure.retryable,
            evaluationId: EVALUATION_ID,
          },
        },
      }),
    );
    const draft = await openAnalyzer(page);
    await draft.fill(PRIVATE_DRAFT);
    await page.getByRole("button", { name: "Analyze draft" }).click();

    await expect(page.getByText(failure.message)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
      failure.retryable ? 1 : 0,
    );
  });
}

test("rejects a malformed success response without rendering partial scores", async ({
  page,
}) => {
  await page.route("**/api/evaluations", (route) =>
    route.fulfill({
      status: 200,
      json: {
        evaluationId: EVALUATION_ID,
        evaluation: { overallScore: 99 },
      },
    }),
  );
  const draft = await openAnalyzer(page);
  await draft.fill(PRIVATE_DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();

  await expect(
    page.getByText(
      "We could not read the evaluation response. Please try again.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Post Potential: 99 out of 100")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("marks a result stale when the draft changes during analysis", async ({
  page,
}) => {
  await fulfillSuccess(page, 300);
  const draft = await openAnalyzer(page);
  await draft.fill(PRIVATE_DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await draft.fill(`${PRIVATE_DRAFT} Edited while waiting.`);

  await expect(
    page.getByText("Draft changed since this analysis"),
  ).toBeVisible();
});

test("keeps draft content out of URLs, storage, and browser logs", async ({
  page,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  await fulfillSuccess(page);
  const draft = await openAnalyzer(page);
  await draft.fill(PRIVATE_DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Your rubric result" }),
  ).toBeVisible();

  expect(page.url()).not.toContain(encodeURIComponent(PRIVATE_DRAFT));
  expect(page.url()).not.toContain(PRIVATE_DRAFT);
  expect(logs.join(" ")).not.toContain(PRIVATE_DRAFT);
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});

test("has no horizontal overflow on mobile and remains readable in dark mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const draft = await openAnalyzer(page);

  await expect(draft).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analyze draft" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(12, 17, 29)");
});
