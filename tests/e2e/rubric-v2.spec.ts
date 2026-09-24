import { expect, test } from "@playwright/test";
import {
  calculatePostScores,
  resolveWeightProfile,
  scoreRawDimensions,
} from "../../src/features/evaluation/v2/scoring";
import {
  EVALUATION_DIMENSIONS,
  type EvaluationLevel,
  type PostType,
  type RawPostEvaluation,
  RUBRIC_VERSION,
} from "../../src/features/evaluation/v2/types";

const DRAFT =
  "I tried a different approach to a technical problem. Here is what changed and what I learned from the result.";
const REVISION =
  "I tried a different approach to a technical problem. I measured the result, revised the design, and learned which trade-off mattered.";
const ID = "3c55ef5b-1bc5-40c2-b332-c24ac8854533";

function evaluation(
  type: PostType = "educational",
  levels: Partial<
    Record<(typeof EVALUATION_DIMENSIONS)[number], EvaluationLevel>
  > = {},
) {
  const detectedClassification = {
    primaryType: type,
    confidence: 0.9,
    reasoning: "The post mainly explains a lesson.",
  };
  const rawEvaluation: RawPostEvaluation = {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level: levels[dimension] ?? 2, explanation: "Fixture explanation." },
      ]),
    ) as RawPostEvaluation["dimensions"],
  };
  const dimensionScores = scoreRawDimensions(rawEvaluation);
  const resolvedProfile = resolveWeightProfile(detectedClassification);
  return {
    rubricVersion: RUBRIC_VERSION,
    detectedClassification,
    rawEvaluation,
    dimensionScores,
    resolvedProfile,
    scores: calculatePostScores(dimensionScores, resolvedProfile),
  };
}
function result(
  type: PostType = "educational",
  levels: Partial<
    Record<(typeof EVALUATION_DIMENSIONS)[number], EvaluationLevel>
  > = {},
) {
  return { evaluationId: ID, evaluation: evaluation(type, levels) };
}

test("analyzer shows two scores and changes type without another evaluation", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/v2/evaluations", async (route) => {
    calls++;
    await route.fulfill({
      json: result("educational", { novelty: 0, clarity: 4 }),
    });
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: /draft/i }).fill(DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await expect(
    page.getByText("Content Quality", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Engagement Potential", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Conversation Potential", { exact: true }),
  ).toBeVisible();
  const qualityScore = page
    .getByText("Content Quality", { exact: true })
    .locator("..")
    .locator("p")
    .nth(1);
  const before = await qualityScore.textContent();
  await page.getByText("Change type").click();
  await page.getByLabel("Score this draft as").selectOption("opinion");
  await expect(page.getByText("Using your selected type.")).toBeVisible();
  expect(calls).toBe(1);
  const after = await qualityScore.textContent();
  expect(after).not.toBe(before);
});

test("battle shows own scores and a shared-profile winner", async ({
  page,
}) => {
  const A = result("educational", { clarity: 4, novelty: 0 });
  const B = result("opinion", { clarity: 2, novelty: 4 });
  await page.route("**/api/v2/comparisons", async (route) => {
    const originalQuality = A.evaluation.scores.contentQuality;
    const revisedQuality = calculatePostScores(
      B.evaluation.dimensionScores,
      A.evaluation.resolvedProfile,
    ).contentQuality;
    await route.fulfill({
      json: {
        comparisonId: ID,
        status: "complete",
        rubricVersion: "2.0",
        versions: {
          A: { status: "success", ...A },
          B: { status: "success", ...B },
        },
        comparison: {
          profileSource: "A",
          originalQuality,
          revisedQuality,
          qualityDelta: revisedQuality - originalQuality,
          winner:
            revisedQuality > originalQuality
              ? "B"
              : revisedQuality < originalQuality
                ? "A"
                : "tie",
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Compare drafts" }).first().click();
  await page.getByRole("textbox", { name: /Version A/i }).fill(DRAFT);
  await page.getByRole("textbox", { name: /Version B/i }).fill(REVISION);
  await page.getByRole("button", { name: "Compare drafts" }).last().click();
  await expect(
    page.getByText("Content Quality under Version A’s profile"),
  ).toBeVisible();
  await expect(page.getByText("Engagement Potential")).toHaveCount(2);
});

test("improvement shows the verified dual-score change", async ({ page }) => {
  await page.route("**/api/v2/evaluations", async (route) =>
    route.fulfill({ json: result("case-study", { specificity: 0 }) }),
  );
  await page.route("**/api/v2/improvements", async (route) =>
    route.fulfill({
      json: {
        improvementId: ID,
        status: "suggested",
        revisedText: REVISION,
        changeNote: "Added an action and result.",
        reviewRequired: true,
        verification: {
          rubricVersion: "2.0",
          originalQuality: 50,
          revisedQuality: 55,
          qualityDelta: 5,
          originalEngagement: 50,
          revisedEngagement: 55,
          engagementDelta: 5,
          dimensionDeltas: Object.fromEntries(
            EVALUATION_DIMENSIONS.map((dimension) => [
              dimension,
              dimension === "specificity" ? 25 : 0,
            ]),
          ),
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("textbox", { name: /draft/i }).fill(DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await page.getByRole("button", { name: "Improve post" }).click();
  await expect(page.getByText("Suggested draft")).toBeVisible();
  await expect(page.getByText(/Content Quality 50 → 55/)).toBeVisible();
  await page.getByRole("button", { name: "Compare with original" }).click();
  await expect(page.getByRole("textbox", { name: /Version B/i })).toHaveValue(
    REVISION,
  );
});

test("share card downloads a PNG with V2 scores", async ({ page }) => {
  await page.route("**/api/v2/evaluations", async (route) =>
    route.fulfill({ json: result() }),
  );
  await page.goto("/");
  await page.getByRole("textbox", { name: /draft/i }).fill(DRAFT);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG score card" }).click();
  expect((await download).suggestedFilename()).toBe("postlens-rubric-v2.png");
});
