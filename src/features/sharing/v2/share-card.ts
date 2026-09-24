import type { V2PostEvaluation } from "../../evaluation/v2/evaluate-post";
import { EVALUATION_DIMENSIONS } from "../../evaluation/v2/types";
import {
  V2_DIMENSION_LABELS,
  V2_TYPE_LABELS,
} from "../../evaluation/v2/ui/score-copy";

export function drawV2ShareCard(
  canvas: HTMLCanvasElement,
  evaluation: V2PostEvaluation,
  brandIcon: HTMLImageElement,
): void {
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");
  context.fillStyle = "#101828";
  context.fillRect(0, 0, 1200, 630);
  context.drawImage(brandIcon, 66, 49, 58, 58);
  context.fillStyle = "#ffffff";
  context.font = "700 36px Arial, sans-serif";
  context.fillText("PostLens", 140, 100);
  context.fillStyle = "#b8c7dc";
  context.font = "400 19px Arial, sans-serif";
  context.fillText(
    `${V2_TYPE_LABELS[evaluation.resolvedProfile.resolvedPostType === "generic" ? evaluation.detectedClassification.primaryType : evaluation.resolvedProfile.resolvedPostType]} · Rubric ${evaluation.rubricVersion}`,
    72,
    156,
  );
  const cards = [
    {
      label: "CONTENT QUALITY",
      score: evaluation.scores.contentQuality,
      x: 72,
    },
    {
      label: "ENGAGEMENT POTENTIAL",
      score: evaluation.scores.engagementPotential,
      x: 620,
    },
  ];
  for (const card of cards) {
    context.fillStyle = "#1b2b42";
    context.fillRect(card.x, 196, 508, 224);
    context.fillStyle = "#b8c7dc";
    context.font = "600 20px Arial, sans-serif";
    context.fillText(card.label, card.x + 28, 240);
    context.fillStyle = "#ffffff";
    context.font = "700 116px Arial, sans-serif";
    context.fillText(String(Math.round(card.score)), card.x + 24, 367);
    context.font = "400 28px Arial, sans-serif";
    context.fillStyle = "#b8c7dc";
    context.fillText("/ 100", card.x + 286, 366);
  }
  const strongest = [...EVALUATION_DIMENSIONS]
    .sort(
      (a, b) => evaluation.dimensionScores[b] - evaluation.dimensionScores[a],
    )
    .slice(0, 3);
  context.fillStyle = "#d7e5ff";
  context.font = "600 20px Arial, sans-serif";
  context.fillText(
    `Strongest: ${strongest.map((dimension) => V2_DIMENSION_LABELS[dimension]).join(" · ")}`,
    72,
    477,
    1060,
  );
  context.fillStyle = "#a9b8cc";
  context.font = "400 18px Arial, sans-serif";
  context.fillText(
    "A content rubric, not a prediction of impressions, reach, or virality.",
    72,
    558,
  );
}
