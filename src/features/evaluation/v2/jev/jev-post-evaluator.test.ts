import {
  APITimeoutError,
  AuthenticationError,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { EVALUATION_DIMENSIONS, type EvaluationLevel } from "../types";
import {
  type JevV2Client,
  type JevV2Diagnostics,
  PRIMARY_TYPE_KEY,
  SECONDARY_TYPE_KEY,
  scoreQuestionKey,
  TYPE_EVIDENCE_KEY,
} from "./jev.types";
import { V2JevEvaluatorError } from "./jev-error";
import { JevV2PostEvaluator, selectJevV2Level } from "./jev-post-evaluator";
import {
  buildSecondaryClarificationQuestions,
  buildV2JevQuestions,
  TypeSafeJevV2Client,
} from "./typesafe-jev-client";

class FakeJevClient implements JevV2Client {
  calls = 0;
  constructor(
    private readonly result: unknown,
    private readonly error?: unknown,
  ) {}
  async evaluate(): Promise<unknown> {
    this.calls += 1;
    if (this.error !== undefined) throw this.error;
    return this.result;
  }
}

function choiceAnswer(choice: string, confidence = 0.82) {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: confidence },
  };
}

function scoreAnswer(level: EvaluationLevel) {
  return {
    type: "score",
    score: level + 0.1,
    confidence: 0.8,
    legend: { 0: "zero", 1: "one", 2: "two", 3: "three", 4: "four" },
    probabilities: {
      0: level === 0 ? 0.8 : 0.05,
      1: level === 1 ? 0.8 : 0.05,
      2: level === 2 ? 0.8 : 0.05,
      3: level === 3 ? 0.8 : 0.05,
      4: level === 4 ? 0.8 : 0.05,
    },
  };
}

function response(
  options: {
    primary?: string;
    secondary?: string;
    evidence?: string;
    confidence?: number;
    level?: EvaluationLevel;
  } = {},
) {
  return {
    model: "jev-test",
    answers: {
      ...Object.fromEntries(
        EVALUATION_DIMENSIONS.map((dimension) => [
          scoreQuestionKey(dimension),
          scoreAnswer(options.level ?? 3),
        ]),
      ),
      [PRIMARY_TYPE_KEY]: choiceAnswer(
        options.primary ?? "case-study",
        options.confidence ?? 0.68,
      ),
      [SECONDARY_TYPE_KEY]: choiceAnswer(options.secondary ?? "educational"),
      [TYPE_EVIDENCE_KEY]: choiceAnswer(
        options.evidence ?? "problem_resolution",
      ),
    } as Record<string, unknown>,
    usage: { input_tokens: 123, output_tokens: 45 },
  };
}

describe("V2 Jev questions", () => {
  it("batches nine dimension judgments with primary, optional secondary, and evidence choices", () => {
    const questions = buildV2JevQuestions();
    expect(Object.keys(questions)).toEqual([
      ...EVALUATION_DIMENSIONS.map(scoreQuestionKey),
      PRIMARY_TYPE_KEY,
      SECONDARY_TYPE_KEY,
      TYPE_EVIDENCE_KEY,
    ]);
    expect(JSON.stringify(questions[PRIMARY_TYPE_KEY])).toContain(
      "dominant communicative purpose",
    );
    expect(JSON.stringify(questions[SECONDARY_TYPE_KEY])).toContain("none");
    expect(JSON.stringify(questions[PRIMARY_TYPE_KEY])).toContain("discussion");
  });

  it("excludes the known primary from a dependent secondary clarification", () => {
    const questions = buildSecondaryClarificationQuestions("case-study");
    const question = questions[SECONDARY_TYPE_KEY] as {
      criteria: Record<string, string>;
    };
    expect(Object.keys(questions)).toEqual([SECONDARY_TYPE_KEY]);
    expect(Object.keys(question.criteria)).toContain("none");
    expect(Object.keys(question.criteria)).toContain("educational");
    expect(Object.keys(question.criteria)).not.toContain("case-study");
  });
});

describe("V2 Jev client round trips", () => {
  it("asks a dependent question only when Jev repeats the primary type", async () => {
    const first = response({ secondary: "case-study" });
    const second = {
      model: "jev-test",
      answers: { [SECONDARY_TYPE_KEY]: choiceAnswer("educational", 0.72) },
      usage: { input_tokens: 20, output_tokens: 5 },
    };
    const spy = vi
      .spyOn(TypeSafeClient.prototype, "systemOne")
      .mockResolvedValueOnce(first as never)
      .mockResolvedValueOnce(second as never);
    try {
      const client = new TypeSafeJevV2Client({ apiKey: "test-key" });
      const result = await new JevV2PostEvaluator({ client }).evaluate(
        "fixture draft",
      );
      expect(spy).toHaveBeenCalledTimes(2);
      expect(result.classification.secondaryType).toBe("educational");
      const followUpRequest = spy.mock.calls[1][0] as {
        questions: Record<string, { criteria: Record<string, string> }>;
      };
      expect(Object.keys(followUpRequest.questions)).toEqual([
        SECONDARY_TYPE_KEY,
      ]);
      expect(
        Object.keys(followUpRequest.questions[SECONDARY_TYPE_KEY].criteria),
      ).not.toContain("case-study");
    } finally {
      spy.mockRestore();
    }
  });

  it("uses one request when the secondary is distinct", async () => {
    const spy = vi
      .spyOn(TypeSafeClient.prototype, "systemOne")
      .mockResolvedValueOnce(response() as never);
    try {
      const client = new TypeSafeJevV2Client({ apiKey: "test-key" });
      const result = await new JevV2PostEvaluator({ client }).evaluate(
        "fixture draft",
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(result.classification.secondaryType).toBe("educational");
    } finally {
      spy.mockRestore();
    }
  });

  it("retains a usable primary result if the secondary clarification fails", async () => {
    const spy = vi
      .spyOn(TypeSafeClient.prototype, "systemOne")
      .mockResolvedValueOnce(response({ secondary: "case-study" }) as never)
      .mockRejectedValueOnce(new Error("provider unavailable"));
    try {
      const client = new TypeSafeJevV2Client({ apiKey: "test-key" });
      const result = await new JevV2PostEvaluator({ client }).evaluate(
        "fixture draft",
      );
      expect(spy).toHaveBeenCalledTimes(2);
      expect(result.classification.primaryType).toBe("case-study");
      expect(result.classification.secondaryType).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("V2 Jev adapter", () => {
  it("maps one response to separate classification and raw judgments without scores or weights", async () => {
    const client = new FakeJevClient(response());
    const evaluator = new JevV2PostEvaluator({
      client,
      requestedModel: "jev-test",
    });
    const result = await evaluator.evaluate("Private fixture draft");
    expect(client.calls).toBe(1);
    expect(result.classification).toEqual({
      primaryType: "case-study",
      secondaryType: "educational",
      confidence: 0.68,
      reasoning:
        "The post mainly examines a concrete problem, action, and outcome.",
    });
    expect(Object.keys(result.rawEvaluation.dimensions)).toEqual([
      ...EVALUATION_DIMENSIONS,
    ]);
    expect(result.rawEvaluation.dimensions.clarity).toEqual({
      level: 3,
      explanation: "Clear message and progression",
      confidence: 0.8,
    });
    expect(JSON.stringify(result)).not.toContain("contentQuality");
    expect(JSON.stringify(result)).not.toContain("engagementPotential");
    expect(JSON.stringify(result)).not.toContain("Weights");
  });

  it("keeps no secondary and discards a duplicate primary", async () => {
    for (const secondary of ["none", "story"]) {
      const result = await new JevV2PostEvaluator({
        client: new FakeJevClient(
          response({ primary: "story", secondary, evidence: "narrative" }),
        ),
      }).evaluate("Fixture draft");
      expect(result.classification.secondaryType).toBeUndefined();
    }
  });

  it("handles representative discussion, announcement, and build-in-public classifications", async () => {
    for (const [primary, evidence] of [
      ["discussion", "substantive_question"],
      ["announcement", "news"],
      ["build-in-public", "building_process"],
    ] as const) {
      const result = await new JevV2PostEvaluator({
        client: new FakeJevClient(
          response({ primary, secondary: "none", evidence }),
        ),
      }).evaluate("Fixture draft");
      expect(result.classification.primaryType).toBe(primary);
      expect(result.classification.reasoning).not.toBe("");
    }
  });

  it("uses a safe primary-type explanation when bounded evidence disagrees", async () => {
    const result = await new JevV2PostEvaluator({
      client: new FakeJevClient(
        response({ primary: "story", evidence: "news" }),
      ),
    }).evaluate("Fixture draft");
    expect(result.classification.reasoning).toBe(
      "The post's main communicative purpose is story.",
    );
  });

  it("selects the lower level on a probability tie", () => {
    expect(selectJevV2Level({ 0: 0, 1: 0.4, 2: 0.4, 3: 0.1, 4: 0.1 })).toBe(1);
  });

  it("reports metadata and latency without draft text", async () => {
    const diagnostics: JevV2Diagnostics[] = [];
    await new JevV2PostEvaluator({
      client: new FakeJevClient(response()),
      requestedModel: "jev-test",
      onDiagnostics: (event) => diagnostics.push(event),
    }).evaluate("PRIVATE DRAFT CONTENT");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      provider: "jev",
      requestedModel: "jev-test",
      resolvedModel: "jev-test",
      rubricVersion: "2.0",
      usage: { inputTokens: 123, outputTokens: 45 },
      classification: { primaryType: "case-study", confidence: 0.68 },
    });
    expect(diagnostics[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(diagnostics)).not.toContain("PRIVATE DRAFT CONTENT");
  });

  it.each([
    [PRIMARY_TYPE_KEY, choiceAnswer("viral-thread")],
    [SECONDARY_TYPE_KEY, choiceAnswer("viral-thread")],
    [TYPE_EVIDENCE_KEY, choiceAnswer("viral-thread")],
    [scoreQuestionKey("hook"), undefined],
  ])("rejects an invalid %s response safely", async (key, answer) => {
    const invalid = response();
    invalid.answers[key] = answer;
    await expect(
      new JevV2PostEvaluator({ client: new FakeJevClient(invalid) }).evaluate(
        "draft",
      ),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("rejects malformed confidence without leaking a provider response", async () => {
    const invalid = response({ confidence: 1.5 });
    await expect(
      new JevV2PostEvaluator({ client: new FakeJevClient(invalid) }).evaluate(
        "draft",
      ),
    ).rejects.toMatchObject({
      kind: "invalid-response",
      message:
        "Jev returned a response that does not match the expected schema.",
    });
  });

  it("maps provider authentication and timeout errors to safe errors", async () => {
    const authentication = new AuthenticationError(
      401,
      { message: "secret" },
      new Headers(),
    );
    for (const [providerError, kind] of [
      [authentication, "authentication"],
      [new APITimeoutError(100), "timeout"],
    ] as const) {
      const error = await new JevV2PostEvaluator({
        client: new FakeJevClient(undefined, providerError),
      })
        .evaluate("draft")
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(V2JevEvaluatorError);
      expect(error).toMatchObject({ kind });
      expect(JSON.stringify(error)).not.toContain("secret");
    }
  });
});
