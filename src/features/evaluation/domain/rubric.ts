import type { EvaluationDimension, EvaluationLevel } from "./evaluation.types";

export interface DimensionRubric {
  readonly label: string;
  readonly question: string;
  readonly weight: number;
  readonly levels: Readonly<Record<EvaluationLevel, string>>;
  readonly guidance?: readonly string[];
}

export interface RubricDefinition {
  readonly id: string;
  readonly version: string;
  readonly dimensions: Readonly<Record<EvaluationDimension, DimensionRubric>>;
}

export const NORMALIZED_SCORE_BY_LEVEL = {
  0: 0,
  1: 25,
  2: 50,
  3: 75,
  4: 100,
} as const satisfies Readonly<Record<EvaluationLevel, number>>;

export const POSTLENS_RUBRIC = {
  id: "postlens-linkedin",
  version: "1.0.0",
  dimensions: {
    hook: {
      label: "Hook",
      question:
        "How effectively does the opening create a reason for a LinkedIn reader to continue reading?",
      weight: 0.18,
      levels: {
        0: "No meaningful reason to continue",
        1: "Weak reason to continue",
        2: "Some curiosity or interest",
        3: "Strong reason to continue",
        4: "Extremely compelling",
      },
    },
    specificity: {
      label: "Specificity",
      question: "How concrete and specific is the post?",
      weight: 0.14,
      levels: {
        0: "Almost entirely generic",
        1: "Mostly generic",
        2: "Contains some useful specifics",
        3: "Consistently concrete",
        4: "Rich in relevant concrete detail",
      },
    },
    novelty: {
      label: "Novelty",
      question: "How non-obvious is the central observation or perspective?",
      weight: 0.14,
      levels: {
        0: "Extremely familiar",
        1: "Mostly familiar",
        2: "Some distinct perspective",
        3: "Meaningfully non-obvious",
        4: "Highly distinctive insight",
      },
      guidance: ["Do not reward contrarianism merely for being contrarian."],
    },
    clarity: {
      label: "Clarity",
      question: "How easily can a reader understand the central idea?",
      weight: 0.12,
      levels: {
        0: "Difficult to identify",
        1: "Frequently unclear",
        2: "Mostly understandable",
        3: "Clear",
        4: "Exceptionally clear",
      },
    },
    discussionPotential: {
      label: "Discussion Potential",
      question:
        "Does the content naturally give readers something meaningful to respond to?",
      weight: 0.14,
      levels: {
        0: "Almost nothing to discuss",
        1: "Limited discussion potential",
        2: "Some potential",
        3: "Strong discussion potential",
        4: "Very strong discussion potential",
      },
      guidance: ["Do not reward engagement bait."],
    },
    credibility: {
      label: "Credibility",
      question:
        "How well does the post support its claims through evidence, reasoning, concrete experience, or appropriately scoped language?",
      weight: 0.1,
      levels: {
        0: "Unsupported or misleading",
        1: "Weakly supported",
        2: "Reasonably supported",
        3: "Strongly supported",
        4: "Highly credible presentation",
      },
    },
    skimmability: {
      label: "Skimmability",
      question:
        "How easy is the post to consume in a fast-moving professional feed?",
      weight: 0.1,
      levels: {
        0: "Difficult to scan",
        1: "Dense",
        2: "Acceptable",
        3: "Easy to scan",
        4: "Exceptionally well structured",
      },
      guidance: [
        "Consider paragraph size, sentence length, structure, repetition, and visual density.",
      ],
    },
    emotionalResonance: {
      label: "Emotional Resonance",
      question:
        "How strongly does the post create an appropriate human reaction such as curiosity, recognition, surprise, tension, empathy, or excitement?",
      weight: 0.08,
      levels: {
        0: "Emotionally flat",
        1: "Weak response",
        2: "Moderate response",
        3: "Strong response",
        4: "Very strong response",
      },
      guidance: ["Do not reward manufactured drama."],
    },
  },
} as const satisfies RubricDefinition;
