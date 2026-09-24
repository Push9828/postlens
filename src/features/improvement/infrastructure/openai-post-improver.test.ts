import { describe, expect, it, vi } from "vitest";
import { EVALUATION_DIMENSIONS } from "../../evaluation/domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../../evaluation/domain/rubric";
import type { ImprovementContext } from "../application/post-improver";
import { OpenAIPostImprover } from "./openai-post-improver";

const context: ImprovementContext = {
  content: "A short project note with 12% measured change.",
  action: "hook",
  rubric: { id: "postlens-linkedin", version: "1.0.0" },
  contentType: "case-study",
  overallScore: 50,
  dimensions: Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      {
        level: 2,
        score: 50,
        explanation: `${dimension} needs work.`,
        criterion: POSTLENS_RUBRIC.dimensions[dimension],
      },
    ]),
  ) as ImprovementContext["dimensions"],
  strongestDimension: "hook",
  weakestDimension: "hook",
  focus: [
    {
      dimension: "hook",
      level: 1,
      explanation: "Opening lacks a concrete point.",
    },
  ],
  targetText: "A short project note with 12% measured change.",
};

function providerResponse(output: unknown) {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(output) }],
      },
    ],
  });
}

describe("OpenAI post improver adapter", () => {
  it("sends a structured, stateless, bounded generation request", async () => {
    const fetcher = vi.fn(async () =>
      providerResponse({
        status: "suggested",
        text: "A better opening with 12% measured change.",
        changeNote: "Clarified the opening.",
        reason: "",
      }),
    );
    const improver = new OpenAIPostImprover({
      apiKey: "fake",
      model: "gpt-4o-mini",
      timeoutMs: 2000,
      fetcher,
    });
    expect((await improver.improve(context)).status).toBe("suggested");
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body as string);
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(2400);
    expect(body.text.format.strict).toBe(true);
    expect(body.input).toContain(context.targetText);
    expect(body.instructions).toContain("Never invent experiences");
  });

  it("maps rate limits and malformed outputs without provider text", async () => {
    const busy = new OpenAIPostImprover({
      apiKey: "fake",
      model: "gpt-4o-mini",
      timeoutMs: 2000,
      fetcher: async () => new Response("private response", { status: 429 }),
    });
    await expect(busy.improve(context)).rejects.toMatchObject({
      kind: "rate-limit",
    });
    const malformed = new OpenAIPostImprover({
      apiKey: "fake",
      model: "gpt-4o-mini",
      timeoutMs: 2000,
      fetcher: async () =>
        providerResponse({
          status: "suggested",
          text: "",
          changeNote: "",
          reason: "",
        }),
    });
    await expect(malformed.improve(context)).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });
});
