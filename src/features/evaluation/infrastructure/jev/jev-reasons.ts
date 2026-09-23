import type {
  EvaluationDimension,
  EvaluationLevel,
} from "../../domain/evaluation.types";

export interface JevReasonDefinition {
  readonly criterion: string;
  readonly explanation: string;
  readonly compatibleLevels: readonly EvaluationLevel[];
}

type JevReasonDefinitions = Readonly<
  Record<EvaluationDimension, Readonly<Record<string, JevReasonDefinition>>>
>;

export const JEV_REASON_DEFINITIONS = {
  hook: {
    no_clear_lead: {
      criterion: "The opening does not establish a clear reason to continue.",
      explanation: "The opening does not establish a clear reason to continue.",
      compatibleLevels: [0, 1],
    },
    generic_lead: {
      criterion: "The opening is understandable but familiar or generic.",
      explanation:
        "The opening is understandable, but it feels familiar or generic.",
      compatibleLevels: [1, 2],
    },
    clear_promise: {
      criterion:
        "The opening makes a clear and relevant promise to the reader.",
      explanation:
        "The opening gives the reader a clear and relevant reason to continue.",
      compatibleLevels: [2, 3],
    },
    immediate_tension: {
      criterion:
        "The opening creates immediate curiosity, tension, or surprise.",
      explanation: "The opening creates immediate curiosity or tension.",
      compatibleLevels: [3, 4],
    },
  },
  specificity: {
    mostly_abstract: {
      criterion: "The post relies mainly on abstract or generic claims.",
      explanation: "The post relies mainly on abstract or generic claims.",
      compatibleLevels: [0, 1],
    },
    limited_detail: {
      criterion: "The post includes a small amount of concrete detail.",
      explanation:
        "The post includes some detail, but much of it remains general.",
      compatibleLevels: [1, 2],
    },
    concrete_example: {
      criterion:
        "The post uses a concrete example, number, event, or implementation detail.",
      explanation:
        "A concrete example or implementation detail makes the point specific.",
      compatibleLevels: [2, 3],
    },
    evidence_rich: {
      criterion: "Concrete and relevant detail supports the post throughout.",
      explanation: "Relevant concrete details support the post throughout.",
      compatibleLevels: [3, 4],
    },
  },
  novelty: {
    familiar_take: {
      criterion: "The central idea repeats a widely familiar observation.",
      explanation: "The central idea is widely familiar.",
      compatibleLevels: [0, 1],
    },
    minor_distinction: {
      criterion: "The post adds a small distinction to a familiar idea.",
      explanation:
        "The post adds a small distinction to an otherwise familiar idea.",
      compatibleLevels: [1, 2],
    },
    fresh_connection: {
      criterion:
        "The post connects familiar material in a meaningfully fresh way.",
      explanation:
        "The post makes a meaningfully fresh connection between familiar ideas.",
      compatibleLevels: [2, 3],
    },
    distinctive_insight: {
      criterion:
        "The post presents a distinctive, non-obvious insight without relying on empty contrarianism.",
      explanation:
        "The central insight is distinctive and meaningfully non-obvious.",
      compatibleLevels: [3, 4],
    },
  },
  clarity: {
    unclear_thesis: {
      criterion: "The central idea is difficult to identify.",
      explanation: "The central idea is difficult to identify.",
      compatibleLevels: [0, 1],
    },
    competing_points: {
      criterion:
        "Several competing points make the main idea harder to follow.",
      explanation: "Competing points make the main idea harder to follow.",
      compatibleLevels: [1, 2],
    },
    clear_thesis: {
      criterion:
        "The central idea is clear and supported by the post's structure.",
      explanation: "The central idea is clear and easy to follow.",
      compatibleLevels: [2, 3],
    },
    precise_progression: {
      criterion: "Each part of the post advances a precise central idea.",
      explanation: "Each part of the post advances a precise central idea.",
      compatibleLevels: [3, 4],
    },
  },
  discussionPotential: {
    closed_statement: {
      criterion: "The post leaves readers little meaningful room to respond.",
      explanation: "The post leaves readers little meaningful room to respond.",
      compatibleLevels: [0, 1],
    },
    generic_prompt: {
      criterion:
        "The response opportunity is generic or weakly connected to the post.",
      explanation:
        "The response opportunity is generic or weakly connected to the post.",
      compatibleLevels: [1, 2],
    },
    natural_tradeoff: {
      criterion:
        "A genuine tradeoff, decision, or shared experience invites a substantive response.",
      explanation:
        "A genuine tradeoff or shared experience invites a substantive response.",
      compatibleLevels: [2, 3, 4],
    },
    engagement_bait: {
      criterion:
        "The post asks for interaction through engagement bait rather than meaningful discussion.",
      explanation:
        "The call for interaction reads as engagement bait rather than meaningful discussion.",
      compatibleLevels: [0, 1, 2],
    },
  },
  credibility: {
    unsupported_claim: {
      criterion: "Important claims are unsupported or overstated.",
      explanation: "Important claims are unsupported or overstated.",
      compatibleLevels: [0, 1],
    },
    scoped_claim: {
      criterion:
        "Claims are appropriately scoped but have limited supporting evidence.",
      explanation:
        "The claims are appropriately scoped, though supporting evidence is limited.",
      compatibleLevels: [1, 2],
    },
    concrete_experience: {
      criterion: "Concrete experience or reasoning supports the main claims.",
      explanation: "Concrete experience or reasoning supports the main claims.",
      compatibleLevels: [2, 3],
    },
    strong_evidence: {
      criterion:
        "Specific evidence and careful language strongly support the claims.",
      explanation:
        "Specific evidence and careful language strongly support the claims.",
      compatibleLevels: [3, 4],
    },
  },
  skimmability: {
    dense_block: {
      criterion:
        "Dense blocks or long sentences make the post difficult to scan.",
      explanation:
        "Dense blocks or long sentences make the post difficult to scan.",
      compatibleLevels: [0, 1],
    },
    uneven_structure: {
      criterion: "The structure is usable but visually uneven or repetitive.",
      explanation: "The structure is usable but visually uneven or repetitive.",
      compatibleLevels: [1, 2],
    },
    clear_structure: {
      criterion:
        "Short sections and clear progression make the post easy to scan.",
      explanation:
        "Short sections and clear progression make the post easy to scan.",
      compatibleLevels: [2, 3],
    },
    highly_scannable: {
      criterion:
        "The post is exceptionally concise, structured, and visually easy to scan.",
      explanation:
        "The post is concise, structured, and exceptionally easy to scan.",
      compatibleLevels: [3, 4],
    },
  },
  emotionalResonance: {
    emotionally_flat: {
      criterion: "The post creates little appropriate human reaction.",
      explanation: "The post creates little emotional or human reaction.",
      compatibleLevels: [0, 1],
    },
    mild_recognition: {
      criterion: "The post creates mild recognition or curiosity.",
      explanation: "The post creates some recognition or curiosity.",
      compatibleLevels: [1, 2],
    },
    human_tension: {
      criterion:
        "A credible human tension, surprise, or moment of recognition is present.",
      explanation:
        "A credible human tension or moment of recognition gives the post resonance.",
      compatibleLevels: [2, 3, 4],
    },
    manufactured_drama: {
      criterion:
        "The post relies on manufactured drama rather than an appropriate human reaction.",
      explanation:
        "The emotional framing feels manufactured rather than earned.",
      compatibleLevels: [0, 1, 2],
    },
  },
} as const satisfies JevReasonDefinitions;

export function getReasonDefinition(
  dimension: EvaluationDimension,
  code: string,
): JevReasonDefinition | undefined {
  const definitions: Readonly<Record<string, JevReasonDefinition>> =
    JEV_REASON_DEFINITIONS[dimension];

  return definitions[code];
}
