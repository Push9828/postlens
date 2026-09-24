import {
  EVALUATION_DIMENSIONS,
  type EvaluationDimension,
  type PostEvaluation,
} from "../../evaluation/domain/evaluation.types";

export const IMPROVEMENT_ACTIONS = [
  "whole-post",
  "hook",
  "ending",
  "weakest-areas",
] as const;
export type ImprovementAction = (typeof IMPROVEMENT_ACTIONS)[number];

export interface ParagraphTarget {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export function selectWeakestDimensions(
  evaluation: PostEvaluation,
): readonly [EvaluationDimension, EvaluationDimension] {
  const ordered = [...EVALUATION_DIMENSIONS].sort(
    (a, b) => evaluation.dimensions[a].score - evaluation.dimensions[b].score,
  );
  return [ordered[0], ordered[1]];
}

export function selectParagraph(
  content: string,
  action: "hook" | "ending",
): ParagraphTarget {
  const matches = [
    ...content.matchAll(/[^\r\n]+(?:\r?\n(?!\s*\r?\n)[^\r\n]+)*/g),
  ].filter((match) => match[0].trim().length > 0);
  const match = action === "hook" ? matches[0] : matches.at(-1);
  if (!match || match.index === undefined) {
    throw new Error("No paragraph found");
  }
  return {
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
  };
}

export function replaceParagraph(
  content: string,
  target: ParagraphTarget,
  replacement: string,
): string {
  return (
    content.slice(0, target.start) + replacement + content.slice(target.end)
  );
}

export function factualAnchors(content: string): ReadonlySet<string> {
  const matches = content.match(/https?:\/\/[^\s)]+|\b\d[\d,.]*%?\b/giu) ?? [];
  return new Set(matches.map((value) => value.toLowerCase()));
}

export function introducesFactualAnchors(
  original: string,
  revised: string,
): boolean {
  const originalAnchors = factualAnchors(original);
  return [...factualAnchors(revised)].some(
    (anchor) => !originalAnchors.has(anchor),
  );
}
