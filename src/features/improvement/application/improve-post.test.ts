import { describe, expect, it, vi } from "vitest";
import { EVALUATION_DIMENSIONS } from "../../evaluation/domain/evaluation.types";
import { scorePost } from "../../evaluation/domain/scoring";
import {
  introducesFactualAnchors,
  replaceParagraph,
  selectParagraph,
  selectWeakestDimensions,
} from "../domain/improvement";
import { ImprovePostService } from "./improve-post";
import { ImprovementError, mapImproverError } from "./improvement-error";
import { parseImprovementRequest } from "./improvement-request";
import type { ImprovementContext, PostImprover } from "./post-improver";

const content =
  "A useful opening about a real project.\n\nThe measured outcome was 12%.\n\nWhat would you change?";
const evaluation = scorePost({
  contentType: "case-study",
  summary: "A specific account with a clear question.",
  dimensions: Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension, index) => [
      dimension,
      {
        level: (index === 0 ? 1 : index === 1 ? 2 : 3) as 1 | 2 | 3,
        explanation: `${dimension} explanation`,
      },
    ]),
  ) as ReturnType<typeof scorePost>["dimensions"],
});
const request = {
  content,
  action: "hook" as const,
  evaluationId: "c3f92088-7291-4278-840c-e18a1f7af42c",
  evaluation,
};

describe("improvement application", () => {
  it("selects the two lowest scores in canonical order", () => {
    expect(selectWeakestDimensions(evaluation)).toEqual([
      "hook",
      "specificity",
    ]);
  });

  it("replaces only the chosen paragraph, preserving other bytes", () => {
    const source = "First line\r\ncontinued\r\n\r\nMiddle\r\n\r\nLast line";
    expect(
      replaceParagraph(source, selectParagraph(source, "hook"), "New opening"),
    ).toBe("New opening\r\n\r\nMiddle\r\n\r\nLast line");
    expect(
      replaceParagraph(source, selectParagraph(source, "ending"), "New ending"),
    ).toBe("First line\r\ncontinued\r\n\r\nMiddle\r\n\r\nNew ending");
  });

  it("detects newly introduced numbers and URLs", () => {
    expect(introducesFactualAnchors(content, `${content} Now 99%.`)).toBe(true);
    expect(
      introducesFactualAnchors(content, content.replace("12%", "12%")),
    ).toBe(false);
  });

  it("rejects inconsistent score snapshots and stale rubrics", () => {
    expect(parseImprovementRequest(request).evaluation.overallScore).toBe(
      evaluation.overallScore,
    );
    expect(() =>
      parseImprovementRequest({
        ...request,
        evaluation: { ...evaluation, overallScore: 99 },
      }),
    ).toThrowError(ImprovementError);
    expect(() =>
      parseImprovementRequest({
        ...request,
        evaluation: {
          ...evaluation,
          rubric: { ...evaluation.rubric, version: "old" },
        },
      }),
    ).toThrowError(ImprovementError);
  });

  it("maps provider failure kinds to safe errors", () => {
    expect(mapImproverError("timeout").code).toBe("IMPROVEMENT_TIMEOUT");
    expect(mapImproverError("rate-limit").code).toBe("IMPROVEMENT_BUSY");
  });

  it("assembles a hook suggestion and leaves the evaluation untouched", async () => {
    const improve = vi.fn(async (_context: ImprovementContext) => ({
      status: "suggested" as const,
      text: "A clearer opening from the same project.",
      changeNote: "Clarified the first line.",
    }));
    const service = new ImprovePostService(
      { improve },
      undefined,
      () => 1,
      () => request.evaluationId,
    );
    const result = await service.execute(request);
    expect(result.status).toBe("suggested");
    if (result.status === "suggested")
      expect(result.revisedText).toBe(
        "A clearer opening from the same project.\n\nThe measured outcome was 12%.\n\nWhat would you change?",
      );
    expect(improve.mock.calls[0]?.[0].targetText).toBe(
      "A useful opening about a real project.",
    );
    expect(evaluation.overallScore).toBe(
      scorePost({
        contentType: evaluation.contentType,
        summary: evaluation.summary,
        dimensions: evaluation.dimensions,
      }).overallScore,
    );
  });

  it("accepts a no-safe-change response and rejects invented numeric anchors", async () => {
    const noChange: PostImprover = {
      improve: async () => ({
        status: "no-safe-change",
        reason: "The draft needs a fact from the author.",
      }),
    };
    expect(
      (await new ImprovePostService(noChange).execute(request)).status,
    ).toBe("no-safe-change");
    const unsafe: PostImprover = {
      improve: async () => ({
        status: "suggested",
        text: "A project helped 99% of users.",
        changeNote: "Sharper.",
      }),
    };
    await expect(
      new ImprovePostService(unsafe).execute(request),
    ).rejects.toMatchObject({ code: "UNSAFE_SUGGESTION" });
  });
});
