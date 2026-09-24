import type { PostEvaluation } from "../evaluation/domain/evaluation.types";
import { EVALUATION_DIMENSIONS } from "../evaluation/domain/evaluation.types";
import { DIMENSION_LABELS } from "../evaluation/ui/score-copy";

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });

export function createShareCardSvg(evaluation: PostEvaluation): string {
  const strongest = [...EVALUATION_DIMENSIONS]
    .sort(
      (a, b) => evaluation.dimensions[b].score - evaluation.dimensions[a].score,
    )
    .slice(0, 2);
  const [first, second] = strongest;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="PostLens rubric result">
<rect width="1200" height="630" fill="#101828"/>
<rect x="54" y="54" width="1092" height="522" rx="32" fill="#1d2939" stroke="#475467"/>
<text x="104" y="126" fill="#84adff" font-family="Arial,sans-serif" font-size="30" font-weight="700">PostLens</text>
<text x="104" y="190" fill="#d0d5dd" font-family="Arial,sans-serif" font-size="26">POST POTENTIAL · RUBRIC RESULT</text>
<text x="100" y="390" fill="#ffffff" font-family="Arial,sans-serif" font-size="190" font-weight="700">${evaluation.overallScore}<tspan fill="#98a2b3" font-size="56"> / 100</tspan></text>
<text x="740" y="286" fill="#d0d5dd" font-family="Arial,sans-serif" font-size="24">STRONGEST DIMENSIONS</text>
<text x="740" y="337" fill="#ffffff" font-family="Arial,sans-serif" font-size="32">${escapeXml(DIMENSION_LABELS[first])} · ${evaluation.dimensions[first].score}</text>
<text x="740" y="392" fill="#ffffff" font-family="Arial,sans-serif" font-size="32">${escapeXml(DIMENSION_LABELS[second])} · ${evaluation.dimensions[second].score}</text>
<path d="M104 446H1096" stroke="#475467"/>
<text x="104" y="501" fill="#d0d5dd" font-family="Arial,sans-serif" font-size="23">Evaluated against PostLens rubric ${escapeXml(evaluation.rubric.version)}</text>
<text x="104" y="542" fill="#98a2b3" font-family="Arial,sans-serif" font-size="21">A writing rubric, not a prediction of reach or engagement.</text>
</svg>`;
}
