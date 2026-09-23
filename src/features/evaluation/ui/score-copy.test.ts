import { describe, expect, it } from "vitest";
import {
  CONTENT_TYPES,
  EVALUATION_DIMENSIONS,
} from "../domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../domain/rubric";
import { CONTENT_TYPE_LABELS, DIMENSION_LABELS } from "./score-copy";

describe("score copy", () => {
  it("labels every dimension from the centralized rubric", () => {
    expect(Object.keys(DIMENSION_LABELS)).toEqual([...EVALUATION_DIMENSIONS]);

    for (const dimension of EVALUATION_DIMENSIONS) {
      expect(DIMENSION_LABELS[dimension]).toBe(
        POSTLENS_RUBRIC.dimensions[dimension].label,
      );
    }
  });

  it("labels every content type", () => {
    expect(Object.keys(CONTENT_TYPE_LABELS)).toEqual([...CONTENT_TYPES]);
  });
});
