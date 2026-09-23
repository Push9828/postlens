import { describe, expect, it } from "vitest";
import {
  EVALUATION_DIMENSIONS,
  type PostJudgments,
} from "../domain/evaluation.types";
import { scorePost } from "../domain/scoring";
import {
  type AnalyzerState,
  analyzerReducer,
  INITIAL_ANALYZER_STATE,
  isResultStale,
} from "./analyzer-state";
import { EvaluationClientError } from "./evaluation-api-client";

function createResult() {
  const judgments: PostJudgments = {
    dimensions: Object.fromEntries(
      EVALUATION_DIMENSIONS.map((dimension) => [
        dimension,
        { level: 2, explanation: "Fixture explanation." },
      ]),
    ) as PostJudgments["dimensions"],
    contentType: "opinion",
    summary: "Fixture summary.",
  };

  return {
    evaluationId: "3c55ef5b-1bc5-40c2-b332-c24ac8854533",
    evaluation: scorePost(judgments),
  };
}

describe("analyzerReducer", () => {
  it("moves from idle through submitting to success", () => {
    const submitting = analyzerReducer(INITIAL_ANALYZER_STATE, {
      type: "submit",
      requestId: 1,
      submittedContent: "Submitted draft content",
    });
    const success = analyzerReducer(submitting, {
      type: "succeed",
      requestId: 1,
      result: createResult(),
    });

    expect(submitting).toMatchObject({ status: "submitting", requestId: 1 });
    expect(success).toMatchObject({
      status: "success",
      requestId: 1,
      submittedContent: "Submitted draft content",
    });
  });

  it("preserves safe errors and the submitted snapshot", () => {
    const submitting = analyzerReducer(INITIAL_ANALYZER_STATE, {
      type: "submit",
      requestId: 2,
      submittedContent: "Submitted draft content",
    });
    const error = new EvaluationClientError(
      "server",
      "Please try again.",
      true,
      "EVALUATION_TIMEOUT",
    );

    expect(
      analyzerReducer(submitting, { type: "fail", requestId: 2, error }),
    ).toEqual({
      status: "failure",
      requestId: 2,
      submittedContent: "Submitted draft content",
      error,
    });
  });

  it("ignores an obsolete response", () => {
    const current: AnalyzerState = {
      status: "submitting",
      requestId: 4,
      submittedContent: "Current submitted draft",
    };

    expect(
      analyzerReducer(current, {
        type: "succeed",
        requestId: 3,
        result: createResult(),
      }),
    ).toBe(current);
  });
});

describe("isResultStale", () => {
  it("compares the normalized current draft with the submitted snapshot", () => {
    const success: AnalyzerState = {
      status: "success",
      requestId: 1,
      submittedContent: "Submitted draft content",
      result: createResult(),
    };

    expect(isResultStale(success, "  Submitted draft content\n")).toBe(false);
    expect(isResultStale(success, "Edited draft content")).toBe(true);
    expect(isResultStale(INITIAL_ANALYZER_STATE, "Edited draft content")).toBe(
      false,
    );
  });
});
