import { expect, test } from "@playwright/test";

const original =
  "I changed one bounded question in our evaluation flow.\n\nThe result was easier to explain.\n\nWhat would you inspect next?";
const revised =
  "I changed a bounded evaluation question to make the result clearer.\n\nThe result was easier to explain.\n\nWhat would you inspect next?";
const dimensions = Object.fromEntries(
  [
    "hook",
    "specificity",
    "novelty",
    "clarity",
    "discussionPotential",
    "credibility",
    "skimmability",
    "emotionalResonance",
  ].map((key) => [
    key,
    { level: 2, explanation: `${key} needs a clearer point.`, score: 50 },
  ]),
);
const evaluation = {
  evaluationId: "3c55ef5b-1bc5-40c2-b332-c24ac8854533",
  evaluation: {
    rubric: { id: "postlens-linkedin", version: "1.0.0" },
    overallScore: 50,
    scoreInterpretation: {
      id: "developing",
      label: "Developing",
      minimumScore: 40,
      maximumScore: 59,
    },
    dimensions,
    strongestDimension: "hook",
    weakestDimension: "hook",
    contentType: "case-study",
    summary: "The draft can be clearer against the current rubric.",
  },
};
const verification = {
  originalScore: 50,
  revisedScore: 55,
  overallDelta: 5,
  dimensionDeltas: Object.fromEntries(
    Object.keys(dimensions).map((key) => [key, key === "hook" ? 25 : 0]),
  ),
};

test("offers one improvement action, preserves the score, and uses a suggestion only on click", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/api/evaluations", (route) =>
    route.fulfill({ status: 200, json: evaluation }),
  );
  await page.route("**/api/improvements", (route) => {
    const body = route.request().postDataJSON() as {
      action: string;
      content: string;
    };
    requests.push(body.action);
    expect(body.content).toBe(original);
    return route.fulfill({
      status: 200,
      json: {
        improvementId: "873f5696-f7f1-4525-b070-75d633954b0f",
        status: "suggested",
        action: body.action,
        revisedText: revised,
        focusDimensions: ["hook"],
        changeNote: "Clarified the opening.",
        reviewRequired: true,
        verification,
      },
    });
  });
  await page.goto("/");
  const editor = page.getByLabel("LinkedIn draft");
  await editor.fill(original);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await page.getByRole("button", { name: "Improve post" }).click();
  await expect(
    page.getByRole("heading", { name: "Suggested draft" }),
  ).toBeVisible();
  await expect(page.getByLabel("Suggested draft")).toHaveValue(revised);
  await expect(editor).toHaveValue(original);
  expect(requests).toEqual(["whole-post"]);
  await expect(page.getByText("Post Potential: 50 out of 100")).toBeAttached();
  await page.getByRole("button", { name: "Use in editor" }).click();
  await expect(editor).toHaveValue(revised);
  await expect(
    page.getByText("Draft changed since this analysis"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Improve post" }),
  ).toBeDisabled();
});

test("shows a safe retry and keeps an earlier suggestion visible after editing", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/evaluations", (route) =>
    route.fulfill({ status: 200, json: evaluation }),
  );
  await page.route("**/api/improvements", (route) => {
    attempts += 1;
    if (attempts === 1)
      return route.fulfill({
        status: 504,
        json: {
          error: {
            code: "IMPROVEMENT_TIMEOUT",
            message: "The improvement took too long. Please try again.",
            retryable: true,
          },
        },
      });
    return route.fulfill({
      status: 200,
      json: {
        improvementId: "873f5696-f7f1-4525-b070-75d633954b0f",
        status: "suggested",
        action: "whole-post",
        revisedText: revised,
        focusDimensions: ["hook"],
        changeNote: "Clarified the opening.",
        reviewRequired: true,
        verification,
      },
    });
  });
  await page.goto("/");
  const editor = page.getByLabel("LinkedIn draft");
  await editor.fill(original);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await page.getByRole("button", { name: "Improve post" }).click();
  await expect(
    page.getByText("The improvement took too long. Please try again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Suggested draft" }),
  ).toBeVisible();
  await editor.fill(`${original} Edited.`);
  await expect(
    page.getByText("This suggestion belongs to the previously analyzed draft."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Improve post" }),
  ).toBeDisabled();
});

test("shows no-safe-change without replacing the draft", async ({ page }) => {
  await page.route("**/api/evaluations", (route) =>
    route.fulfill({ status: 200, json: evaluation }),
  );
  await page.route("**/api/improvements", (route) =>
    route.fulfill({
      status: 200,
      json: {
        improvementId: "873f5696-f7f1-4525-b070-75d633954b0f",
        status: "no-safe-change",
        action: "whole-post",
        reason: "This post needs a fact from the author.",
      },
    }),
  );
  await page.goto("/");
  const editor = page.getByLabel("LinkedIn draft");
  await editor.fill(original);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await page.getByRole("button", { name: "Improve post" }).click();
  await expect(page.getByText("No verified improvement found")).toBeVisible();
  await expect(
    page.getByText("This post needs a fact from the author."),
  ).toBeVisible();
  await expect(editor).toHaveValue(original);
  await expect(page.getByRole("button", { name: "Use in editor" })).toHaveCount(
    0,
  );
});

test("copies a suggestion and keeps the page usable on a narrow screen", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/evaluations", (route) =>
    route.fulfill({ status: 200, json: evaluation }),
  );
  await page.route("**/api/improvements", (route) =>
    route.fulfill({
      status: 200,
      json: {
        improvementId: "873f5696-f7f1-4525-b070-75d633954b0f",
        status: "suggested",
        action: "whole-post",
        revisedText: revised,
        focusDimensions: ["hook"],
        changeNote: "Clarified the opening.",
        reviewRequired: true,
        verification,
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("LinkedIn draft").fill(original);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await page.getByRole("button", { name: "Improve post" }).click();
  await page.getByRole("button", { name: "Copy suggestion" }).click();
  await expect(page.getByText("Suggestion copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    revised,
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("disables improvement while a request is in flight", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/evaluations", (route) =>
    route.fulfill({ status: 200, json: evaluation }),
  );
  await page.route("**/api/improvements", async (route) => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 200,
      json: {
        improvementId: "873f5696-f7f1-4525-b070-75d633954b0f",
        status: "suggested",
        action: "whole-post",
        revisedText: revised,
        focusDimensions: ["hook"],
        changeNote: "Clarified the draft.",
        reviewRequired: true,
        verification,
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("LinkedIn draft").fill(original);
  await page.getByRole("button", { name: "Analyze draft" }).click();
  await page.getByRole("button", { name: "Improve post" }).click();
  await expect(
    page.getByRole("button", { name: "Improving post..." }),
  ).toBeDisabled();
  await expect(page.getByLabel("Suggested draft")).toHaveValue(revised);
  expect(requests).toBe(1);
});
