import { describe, expect, it, vi } from "vitest";
import { V2ComparePostsService } from "./compare-posts";
import { v2Fixture } from "./fixtures";

const A = "A synthetic first draft that is long enough for comparison.";
const B = "A synthetic second draft that is long enough for comparison.";

describe("V2ComparePostsService", () => {
  it("shows own scores while deciding a winner under Version A's profile", async () => {
    const first = (await v2Fixture({ novelty: 0, clarity: 4 }, "educational"))
      .result;
    const second = (await v2Fixture({ novelty: 4, clarity: 2 }, "opinion"))
      .result;
    const execute = vi.fn(async (input: unknown) =>
      (input as { content: string }).content === A ? first : second,
    );
    const result = await new V2ComparePostsService(
      { execute },
      undefined,
      () => "4c55ef5b-1bc5-40c2-b332-c24ac8854533",
    ).execute({ versionA: A, versionB: B });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.versions.A.evaluation.scores).toEqual(
      first.evaluation.scores,
    );
    expect(result.versions.B.evaluation.scores).toEqual(
      second.evaluation.scores,
    );
    expect(result.comparison.profileSource).toBe("A");
    expect(result.comparison.originalQuality).toBeCloseTo(
      first.evaluation.scores.contentQuality,
    );
    expect(result.comparison.revisedQuality).not.toBeCloseTo(
      second.evaluation.scores.contentQuality,
    );
    expect(result.comparison.winner).toBe("A");
  });

  it("returns a partial result when one evaluation fails", async () => {
    const first = (await v2Fixture()).result;
    const result = await new V2ComparePostsService({
      execute: async (input: unknown) => {
        if ((input as { content: string }).content === B)
          throw new Error("Private provider failure");
        return first;
      },
    }).execute({ versionA: A, versionB: B });
    expect(result.status).toBe("partial");
    expect(JSON.stringify(result)).not.toContain("Private provider failure");
  });
});
