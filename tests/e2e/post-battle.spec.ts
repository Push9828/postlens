import { expect, test } from "@playwright/test";

const A =
  "I replaced a slow validation step with one bounded check and measured the result.";
const B =
  "I replaced a slow validation step with one bounded check, measured the result, and documented the tradeoff.";
const dimensions = [
  "hook",
  "specificity",
  "novelty",
  "clarity",
  "discussionPotential",
  "credibility",
  "skimmability",
  "emotionalResonance",
] as const;

function evaluation(hook: 2 | 3) {
  return {
    rubric: { id: "postlens-linkedin", version: "1.0.0" },
    overallScore: hook === 2 ? 50 : 55,
    scoreInterpretation: {
      id: "developing",
      label: "Developing",
      minimumScore: 40,
      maximumScore: 59,
    },
    dimensions: Object.fromEntries(
      dimensions.map((dimension) => [
        dimension,
        {
          level: dimension === "hook" ? hook : 2,
          explanation: `${dimension} fixture explanation.`,
          score: dimension === "hook" ? hook * 25 : 50,
        },
      ]),
    ),
    strongestDimension: "hook",
    weakestDimension: "hook",
    contentType: "educational",
    summary: "A synthetic educational draft.",
  };
}

const successA = {
  status: "success",
  evaluationId: "e90249dd-2d56-4a4f-a17e-15170bdb1131",
  evaluation: evaluation(2),
};
const successB = {
  status: "success",
  evaluationId: "5c85df95-ece0-47bb-99d0-d3f8e8140ba1",
  evaluation: evaluation(3),
};
const failureB = {
  status: "failure",
  error: {
    code: "EVALUATION_TIMEOUT",
    message: "The evaluation took too long. Please try again.",
    retryable: true,
    evaluationId: successB.evaluationId,
  },
};
const comparisonId = "b61537e3-f698-4b0e-b9c7-d331930142c2";

test("compares two drafts and marks the result stale when either changes", async ({
  page,
}) => {
  await page.route("**/api/comparisons", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      versionA: A,
      versionB: B,
    });
    await route.fulfill({
      status: 200,
      json: {
        comparisonId,
        status: "complete",
        versions: { A: successA, B: successB },
        comparison: {
          overallDelta: 5,
          dimensionDeltas: Object.fromEntries(
            dimensions.map((dimension) => [
              dimension,
              dimension === "hook" ? 25 : 0,
            ]),
          ),
          winner: "B",
          summary:
            "Version B scores 5 points higher against the current PostLens rubric.",
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Compare drafts" }).click();
  await expect(page.getByLabel("Version A")).toBeVisible();
  await page.getByLabel("Version A").fill(A);
  await page.getByLabel("Version B").fill(B);
  await page.getByRole("button", { name: "Compare drafts" }).last().click();

  await expect(
    page.getByRole("heading", { name: "Comparison result" }),
  ).toBeFocused();
  await expect(
    page.getByText(
      "Version B scores 5 points higher against the current PostLens rubric.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Version B Hook: 75 out of 100")).toBeAttached();
  await page.getByLabel("Version B").fill(`${B} More detail.`);
  await expect(
    page.getByText("A draft changed since this result.", { exact: false }),
  ).toBeVisible();
});

test("preserves both drafts and retries the pair after a partial failure", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/comparisons", async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({
        status: 200,
        json: {
          comparisonId,
          status: "partial",
          versions: { A: successA, B: failureB },
        },
      });
    } else {
      await route.fulfill({
        status: 200,
        json: {
          comparisonId,
          status: "complete",
          versions: { A: successA, B: successB },
          comparison: {
            overallDelta: 5,
            dimensionDeltas: Object.fromEntries(
              dimensions.map((dimension) => [
                dimension,
                dimension === "hook" ? 25 : 0,
              ]),
            ),
            winner: "B",
            summary:
              "Version B scores 5 points higher against the current PostLens rubric.",
          },
        },
      });
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Compare drafts" }).click();
  await page.getByLabel("Version A").fill(A);
  await page.getByLabel("Version B").fill(B);
  await page.getByRole("button", { name: "Compare drafts" }).last().click();

  await expect(
    page.getByRole("heading", { name: "Comparison incomplete" }),
  ).toBeVisible();
  await expect(
    page.getByText("Version B could not be evaluated"),
  ).toBeVisible();
  await expect(page.getByText("B minus A")).toHaveCount(0);
  await expect(page.getByLabel("Version A")).toHaveValue(A);
  await expect(page.getByLabel("Version B")).toHaveValue(B);
  await page.getByRole("button", { name: "Compare both again" }).click();
  await expect(
    page.getByRole("heading", { name: "Comparison result" }),
  ).toBeVisible();
  expect(requests).toBe(2);
});

test("shows both safe failures on a narrow screen without a winner", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/comparisons", async (route) => {
    await route.fulfill({
      status: 504,
      json: {
        comparisonId,
        status: "failed",
        versions: { A: failureB, B: failureB },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Compare drafts" }).click();
  await page.getByLabel("Version A").fill(A);
  await page.getByLabel("Version B").fill(B);
  await page.getByRole("button", { name: "Compare drafts" }).last().click();

  await expect(
    page.getByRole("heading", { name: "Comparison incomplete" }),
  ).toBeFocused();
  await expect(
    page.getByText("Version A could not be evaluated"),
  ).toBeVisible();
  await expect(
    page.getByText("Version B could not be evaluated"),
  ).toBeVisible();
  await expect(page.getByText("B minus A")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByLabel("LinkedIn draft")).toHaveValue(A);
  await page.getByRole("button", { name: "Compare drafts" }).click();
  await expect(page.getByLabel("Version B")).toHaveValue(B);
});
