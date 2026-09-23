import { APITimeoutError, AuthenticationError } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  CONTENT_TYPES,
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type EvaluationLevel,
} from "../../domain/evaluation.types";
import {
  getJevReasonKey,
  getJevScoreKey,
  JEV_CONTENT_TYPE_KEY,
  JevAdapterError,
  type JevDecisionClient,
} from "./jev.types";
import { JevPostEvaluator, selectJevLevel } from "./jev-post-evaluator";
import { JEV_REASON_DEFINITIONS } from "./jev-reasons";
import { buildJevQuestions } from "./typesafe-jev-client";

class FakeJevClient implements JevDecisionClient {
  constructor(
    private readonly response: unknown,
    private readonly error?: unknown,
  ) {}

  async evaluate(): Promise<unknown> {
    if (this.error !== undefined) {
      throw this.error;
    }

    return this.response;
  }
}

function createScoreAnswer(level: EvaluationLevel) {
  return {
    type: "score",
    score: level,
    confidence: 0.8,
    legend: {
      0: "zero",
      1: "one",
      2: "two",
      3: "three",
      4: "four",
    },
    probabilities: {
      0: level === 0 ? 0.8 : 0.05,
      1: level === 1 ? 0.8 : 0.05,
      2: level === 2 ? 0.8 : 0.05,
      3: level === 3 ? 0.8 : 0.05,
      4: level === 4 ? 0.8 : 0.05,
    },
  };
}

function compatibleReasonCode(
  dimension: EvaluationDimension,
  level: EvaluationLevel,
): string {
  const code = Object.entries(JEV_REASON_DEFINITIONS[dimension]).find(
    ([, definition]) =>
      definition.compatibleLevels.some(
        (compatible: EvaluationLevel) => compatible === level,
      ),
  )?.[0];

  if (code === undefined) {
    throw new Error(`Missing reason fixture for ${dimension}`);
  }

  return code;
}

function createValidResponse(level: EvaluationLevel = 2): unknown {
  const answers: Record<string, unknown> = {};

  for (const dimension of EVALUATION_DIMENSIONS) {
    answers[getJevScoreKey(dimension)] = createScoreAnswer(level);
    const code = compatibleReasonCode(dimension, level);
    answers[getJevReasonKey(dimension)] = {
      type: "choice",
      choice: code,
      confidence: 0.7,
      probabilities: { [code]: 1 },
    };
  }

  answers[JEV_CONTENT_TYPE_KEY] = {
    type: "choice",
    choice: "educational",
    confidence: 0.9,
    probabilities: Object.fromEntries(
      CONTENT_TYPES.map((contentType) => [
        contentType,
        contentType === "educational" ? 1 : 0,
      ]),
    ),
  };

  return {
    model: "jev-test",
    answers,
    usage: {
      input_tokens: 123,
      output_tokens: 45,
    },
  };
}

describe("JevPostEvaluator", () => {
  it("maps a valid Jev response into provider-independent judgments", async () => {
    const evaluator = new JevPostEvaluator({
      client: new FakeJevClient(createValidResponse(3)),
      requestedModel: "jev-test",
    });

    const result = await evaluator.evaluate({ content: "A fixture draft" });

    expect(Object.keys(result.dimensions)).toEqual([...EVALUATION_DIMENSIONS]);
    expect(result.dimensions.hook.level).toBe(3);
    expect(result.dimensions.hook.confidence).toBe(0.8);
    expect(result.dimensions.hook.explanation).toBe(
      JEV_REASON_DEFINITIONS.hook.clear_promise.explanation,
    );
    expect(result.contentType).toBe("educational");
    expect(result.summary).toContain("strongest in Hook");
  });

  it("uses rubric descriptions when reason-code explanations are disabled", async () => {
    const evaluator = new JevPostEvaluator({
      client: new FakeJevClient(createValidResponse(4)),
      explanationMode: "rubric-level",
    });

    const result = await evaluator.evaluate({ content: "A fixture draft" });

    expect(result.dimensions.hook.explanation).toBe("Extremely compelling");
  });

  it("falls back to the rubric when a reason conflicts with the selected level", async () => {
    const response = createValidResponse(2) as {
      answers: Record<string, unknown>;
    };
    response.answers[getJevReasonKey("novelty")] = {
      type: "choice",
      choice: "distinctive_insight",
      confidence: 0.9,
      probabilities: { distinctive_insight: 0.9 },
    };
    const evaluator = new JevPostEvaluator({
      client: new FakeJevClient(response),
    });

    const result = await evaluator.evaluate({ content: "A fixture draft" });

    expect(result.dimensions.novelty.explanation).toBe(
      "Some distinct perspective",
    );
  });

  it("selects the lower level when maximum probabilities tie", () => {
    expect(
      selectJevLevel({
        0: 0,
        1: 0.4,
        2: 0.4,
        3: 0.1,
        4: 0.1,
      }),
    ).toBe(1);
  });

  it("emits diagnostics without raw draft content", async () => {
    const diagnostics: unknown[] = [];
    const evaluator = new JevPostEvaluator({
      client: new FakeJevClient(createValidResponse()),
      requestedModel: "jev-test",
      onDiagnostics: (event) => diagnostics.push(event),
    });

    await evaluator.evaluate({ content: "PRIVATE DRAFT CONTENT" });

    expect(diagnostics).toHaveLength(1);
    expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE DRAFT CONTENT");
    expect(diagnostics[0]).toMatchObject({
      provider: "jev",
      requestedModel: "jev-test",
      resolvedModel: "jev-test",
      usage: { inputTokens: 123, outputTokens: 45 },
    });
  });

  it("rejects a malformed provider response without exposing it", async () => {
    const evaluator = new JevPostEvaluator({
      client: new FakeJevClient({ secret: "provider response" }),
    });

    await expect(
      evaluator.evaluate({ content: "draft" }),
    ).rejects.toMatchObject({
      kind: "malformed-response",
      message:
        "Jev returned a response that does not match the expected schema.",
    });
  });

  it("rejects an unknown content type", async () => {
    const response = createValidResponse() as {
      answers: Record<string, unknown>;
    };
    response.answers[JEV_CONTENT_TYPE_KEY] = {
      type: "choice",
      choice: "viral-thread",
      confidence: 1,
      probabilities: { "viral-thread": 1 },
    };
    const evaluator = new JevPostEvaluator({
      client: new FakeJevClient(response),
    });

    await expect(
      evaluator.evaluate({ content: "draft" }),
    ).rejects.toMatchObject({ kind: "malformed-response" });
  });

  it("maps authentication errors to a safe adapter error", async () => {
    const providerError = new AuthenticationError(
      401,
      { message: "secret provider detail" },
      new Headers(),
    );
    const evaluator = new JevPostEvaluator({
      client: new FakeJevClient(undefined, providerError),
    });

    const error = await evaluator
      .evaluate({ content: "draft" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(JevAdapterError);
    expect(error).toMatchObject({
      kind: "authentication",
      message: "Jev authentication failed.",
    });
    expect(JSON.stringify(error)).not.toContain("secret provider detail");
  });

  it("maps provider timeouts to a safe adapter error", async () => {
    const evaluator = new JevPostEvaluator({
      client: new FakeJevClient(undefined, new APITimeoutError(100)),
    });

    await expect(
      evaluator.evaluate({ content: "draft" }),
    ).rejects.toMatchObject({
      kind: "timeout",
      message: "Jev request timed out.",
    });
  });
});

describe("buildJevQuestions", () => {
  it("builds one score question per dimension plus content type", () => {
    const questions = buildJevQuestions("rubric-level");

    expect(Object.keys(questions)).toHaveLength(9);
    for (const dimension of EVALUATION_DIMENSIONS) {
      expect(questions[getJevScoreKey(dimension)]).toMatchObject({
        type: "score",
      });
    }
    expect(questions[JEV_CONTENT_TYPE_KEY]).toMatchObject({ type: "choice" });
  });

  it("adds one bounded reason question per dimension", () => {
    const questions = buildJevQuestions("reason-code");

    expect(Object.keys(questions)).toHaveLength(17);
    for (const dimension of EVALUATION_DIMENSIONS) {
      expect(questions[getJevReasonKey(dimension)]).toMatchObject({
        type: "choice",
      });
    }
  });
});
