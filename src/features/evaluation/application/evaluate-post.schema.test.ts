import { describe, expect, it } from "vitest";
import { EvaluatePostError } from "./evaluate-post.errors";
import {
  countUnicodeCodePoints,
  parseEvaluatePostInput,
} from "./evaluate-post.schema";

describe("parseEvaluatePostInput", () => {
  it("accepts the exact minimum and maximum Unicode lengths", () => {
    expect(
      parseEvaluatePostInput({ content: "a".repeat(20) }).content,
    ).toHaveLength(20);
    expect(
      countUnicodeCodePoints(
        parseEvaluatePostInput({ content: "🚀".repeat(3_000) }).content,
      ),
    ).toBe(3_000);
  });

  it("counts non-BMP characters as one code point", () => {
    expect(countUnicodeCodePoints("a🚀b")).toBe(3);
    expect(() =>
      parseEvaluatePostInput({ content: "🚀".repeat(19) }),
    ).toThrowError(expect.objectContaining({ code: "POST_TOO_SHORT" }));
  });

  it("trims outside whitespace while preserving internal formatting", () => {
    const content = "First paragraph here.\n\n  Second paragraph here.";

    expect(parseEvaluatePostInput({ content: `  \n${content}\n  ` })).toEqual({
      content,
    });
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { content: 42 },
    { content: "a".repeat(20), extra: true },
  ])("rejects an invalid request shape: %j", (input) => {
    expect(() => parseEvaluatePostInput(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_REQUEST" }),
    );
  });

  it.each(["", "   ", "a".repeat(19)])("rejects short content", (content) => {
    expect(() => parseEvaluatePostInput({ content })).toThrowError(
      expect.objectContaining({ code: "POST_TOO_SHORT" }),
    );
  });

  it("rejects content above the maximum", () => {
    expect(() =>
      parseEvaluatePostInput({ content: "a".repeat(3_001) }),
    ).toThrowError(expect.objectContaining({ code: "POST_TOO_LONG" }));
  });

  it("uses safe application errors", () => {
    try {
      parseEvaluatePostInput({ content: "short" });
    } catch (error) {
      expect(error).toBeInstanceOf(EvaluatePostError);
      expect(JSON.stringify(error)).not.toContain("short");
    }
  });
});
