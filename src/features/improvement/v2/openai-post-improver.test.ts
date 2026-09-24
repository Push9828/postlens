import { describe, expect, it, vi } from "vitest";
import { v2Fixture } from "../../evaluation/v2/fixtures";
import { POSTLENS_RUBRIC_V2 } from "../../evaluation/v2/rubric";
import { V2OpenAIPostImprover } from "./openai-post-improver";

const content =
  "A synthetic draft about a concrete technical decision and outcome.";
function response(value: unknown, status = 200) {
  return Response.json(
    {
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(value) }],
        },
      ],
    },
    { status },
  );
}

describe("V2OpenAIPostImprover", () => {
  it("sends nine criteria and both weight profiles without asking for a score", async () => {
    const { result } = await v2Fixture();
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) =>
      response({
        status: "suggested",
        text: `${content} Added detail.`,
        changeNote: "Added detail.",
        reason: "",
      }),
    );
    const output = await new V2OpenAIPostImprover({
      apiKey: "fixture",
      model: "fixture-model",
      timeoutMs: 1000,
      fetcher: fetcher as typeof fetch,
    }).improve({
      content,
      evaluation: result.evaluation,
      focus: ["hook", "specificity"],
      rubric: POSTLENS_RUBRIC_V2,
    });
    expect(output.status).toBe("suggested");
    const request = fetcher.mock.calls[0];
    const body = JSON.parse((request[1] as RequestInit).body as string);
    const input = JSON.parse(body.input);
    expect(body.store).toBe(false);
    expect(Object.keys(input.dimensions)).toHaveLength(9);
    expect(input.qualityWeights).toEqual(
      result.evaluation.resolvedProfile.qualityWeights,
    );
    expect(input.engagementWeights).toEqual(
      result.evaluation.resolvedProfile.engagementWeights,
    );
    expect(body.instructions).toContain("Never calculate scores");
  });

  it("maps malformed provider output without exposing it", async () => {
    const { result } = await v2Fixture();
    const improver = new V2OpenAIPostImprover({
      apiKey: "fixture",
      model: "fixture-model",
      timeoutMs: 1000,
      fetcher: (async () =>
        response({
          status: "suggested",
          text: "",
          changeNote: "",
          reason: "secret",
        })) as typeof fetch,
    });
    await expect(
      improver.improve({
        content,
        evaluation: result.evaluation,
        focus: ["hook"],
        rubric: POSTLENS_RUBRIC_V2,
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });
});
