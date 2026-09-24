import type { EvaluationDimension, EvaluationLevel } from "./types";
import { RUBRIC_VERSION } from "./types";

export const NORMALIZED_SCORE_BY_LEVEL = {
  0: 0,
  1: 25,
  2: 50,
  3: 75,
  4: 100,
} as const satisfies Readonly<Record<EvaluationLevel, number>>;

interface DimensionCriterion {
  readonly label: string;
  readonly question: string;
  readonly levels: Readonly<Record<EvaluationLevel, string>>;
  readonly guidance: readonly string[];
}

export const POSTLENS_RUBRIC_V2 = {
  id: "postlens-linkedin",
  version: RUBRIC_VERSION,
  dimensions: {
    hook: {
      label: "Hook",
      question:
        "How effectively does the opening give the intended LinkedIn reader a reason to continue reading?",
      levels: {
        0: "No clear reason to continue",
        1: "Weak or generic opening",
        2: "Some relevant interest",
        3: "Clear, relevant reason to continue",
        4: "Especially compelling premise without exaggeration",
      },
      guidance: [
        "Consider immediate relevance, curiosity, tension, specificity, and premise.",
        "Do not reward clickbait or require sensationalism.",
      ],
    },
    clarity: {
      label: "Clarity",
      question:
        "How easily can the intended reader understand the central message, argument, lesson, or update?",
      levels: {
        0: "Central message is difficult to identify",
        1: "Frequent confusion or missing connections",
        2: "Understandable with some effort",
        3: "Clear message and progression",
        4: "Immediately clear throughout, even where ideas are complex",
      },
      guidance: [
        "Consider progression, transitions, ambiguity, and unnecessary complexity.",
      ],
    },
    credibility: {
      label: "Credibility",
      question:
        "How responsibly and convincingly does the post present its claims?",
      levels: {
        0: "Claims are misleading or unsupported",
        1: "Major claims lack support or appropriate qualification",
        2: "Reasonably supported for the claim type",
        3: "Strong reasoning, experience, or evidence",
        4: "Claims are consistently well supported and carefully scoped",
      },
      guidance: [
        "Personal experience can support a claim without external citations.",
        "Avoid rewarding unsupported certainty.",
      ],
    },
    specificity: {
      label: "Specificity",
      question:
        "How concrete and specific is the post compared with generic commentary?",
      levels: {
        0: "Almost entirely generic",
        1: "Mostly generic",
        2: "Some relevant concrete detail",
        3: "Consistently concrete and relevant",
        4: "Rich in precise detail that advances the message",
      },
      guidance: [
        "Reward relevant examples, implementation details, numbers, observations, problems, and experiences.",
        "Do not reward irrelevant detail.",
      ],
    },
    novelty: {
      label: "Novelty",
      question:
        "How distinctive or non-obvious is the central insight, framing, experience, or perspective for the intended audience?",
      levels: {
        0: "Entirely familiar idea and framing",
        1: "Familiar takeaway with a personal detail",
        2: "Some distinct insight, framing, or experience",
        3: "Meaningfully distinctive central perspective",
        4: "Highly distinctive and well developed perspective",
      },
      guidance: [
        "Record novelty alone; post-type weights determine its importance.",
        "Do not demand novel ideas from every educational or announcement post.",
      ],
    },
    relevanceValue: {
      label: "Relevance / Value",
      question:
        "How much useful, meaningful, or relevant value does the post provide to its intended audience?",
      levels: {
        0: "No discernible reader value",
        1: "Limited relevant value",
        2: "Some useful or meaningful value",
        3: "Clear value for the intended reader",
        4: "Substantial, sustained value for the intended reader",
      },
      guidance: [
        "Value may be teaching, context, insight, a practical lesson, a meaningful update, a question, or a relatable experience.",
      ],
    },
    readabilityStructure: {
      label: "Readability / Structure",
      question:
        "How effectively is the information structured for comfortable reading in a professional feed?",
      levels: {
        0: "Difficult to follow",
        1: "Poor flow or excessive density",
        2: "Readable with some structural friction",
        3: "Comfortable flow and structure",
        4: "Structure makes complex content effortless to follow",
      },
      guidance: [
        "Consider paragraphs, flow, sentence density, repetition, and sequencing.",
        "Do not enforce one-sentence paragraphs or reward formulaic formatting.",
      ],
    },
    readerResonance: {
      label: "Reader Resonance",
      question:
        "How strongly does the content itself create an appropriate human reaction?",
      levels: {
        0: "No discernible reaction",
        1: "Weak reaction",
        2: "Some recognition, curiosity, or usefulness",
        3: "Strong appropriate reaction",
        4: "Especially strong and earned reaction",
      },
      guidance: [
        "Curiosity, recognition, surprise, empathy, tension, excitement, usefulness, and identification may count.",
        "Do not require emotional drama; educational satisfaction counts.",
      ],
    },
    conversationPotential: {
      label: "Conversation Potential",
      question:
        "How naturally does the substance of this post give readers something meaningful to discuss, challenge, add to, or respond to?",
      levels: {
        0: "No substantive opening for discussion",
        1: "Little to respond to beyond agreement",
        2: "Some meaningful response paths",
        3: "Clear substantive room for discussion",
        4: "Several compelling, substantive response paths",
      },
      guidance: [
        "Do not reward requests for comments without substantive content.",
        "Questions alone do not establish discussion potential.",
      ],
    },
  },
} as const satisfies {
  readonly id: string;
  readonly version: string;
  readonly dimensions: Readonly<
    Record<EvaluationDimension, DimensionCriterion>
  >;
};
