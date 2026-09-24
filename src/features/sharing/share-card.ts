import type { PostEvaluation } from "../evaluation/domain/evaluation.types";
import { EVALUATION_DIMENSIONS } from "../evaluation/domain/evaluation.types";
import { DIMENSION_LABELS } from "../evaluation/ui/score-copy";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export function drawShareCard(
  canvas: HTMLCanvasElement,
  evaluation: PostEvaluation,
): void {
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");

  context.fillStyle = "#eaf0f7";
  context.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  roundedRect(context, 28, 28, 1144, 574, 28, "#101828");
  roundedRect(context, 44, 44, 1112, 542, 22, "#17263b");

  context.fillStyle = "#84adff";
  context.fillRect(84, 88, 5, 38);
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.font = "700 30px Arial, sans-serif";
  context.fillText("PostLens", 108, 117);

  context.fillStyle = "#b8c7dc";
  context.font = "600 17px Arial, sans-serif";
  context.fillText("POST POTENTIAL", 108, 168);

  context.fillStyle = "#ffffff";
  context.font = "700 206px Arial, sans-serif";
  context.fillText(String(evaluation.overallScore), 92, 391);
  const scoreWidth = context.measureText(String(evaluation.overallScore)).width;
  context.fillStyle = "#a9b8cc";
  context.font = "600 40px Arial, sans-serif";
  context.fillText("/ 100", 105 + scoreWidth, 387);

  roundedRect(context, 94, 430, 190, 42, 21, "#233d62");
  context.fillStyle = "#c9dcff";
  context.font = "600 18px Arial, sans-serif";
  context.fillText(evaluation.scoreInterpretation.label, 114, 457, 150);

  context.fillStyle = "#a9b8cc";
  context.font = "400 18px Arial, sans-serif";
  context.fillText("A structured review of your draft", 94, 500);

  context.strokeStyle = "#3b4d66";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(682, 92);
  context.lineTo(682, 486);
  context.stroke();

  context.fillStyle = "#a9b8cc";
  context.font = "600 16px Arial, sans-serif";
  context.fillText("STRONGEST DIMENSIONS", 730, 121);

  const strongest = [...EVALUATION_DIMENSIONS]
    .sort(
      (a, b) =>
        evaluation.dimensions[b].score - evaluation.dimensions[a].score ||
        EVALUATION_DIMENSIONS.indexOf(a) - EVALUATION_DIMENSIONS.indexOf(b),
    )
    .slice(0, 3);

  strongest.forEach((dimension, index) => {
    const y = 190 + index * 91;
    context.fillStyle = "#84adff";
    context.font = "600 15px Arial, sans-serif";
    context.fillText(String(index + 1).padStart(2, "0"), 730, y);

    context.fillStyle = "#ffffff";
    context.font = "600 25px Arial, sans-serif";
    context.fillText(DIMENSION_LABELS[dimension], 782, y, 270);

    context.textAlign = "right";
    context.fillStyle = "#d7e5ff";
    context.font = "700 24px Arial, sans-serif";
    context.fillText(String(evaluation.dimensions[dimension].score), 1090, y);
    context.textAlign = "left";

    if (index < strongest.length - 1) {
      context.strokeStyle = "#34465f";
      context.beginPath();
      context.moveTo(782, y + 28);
      context.lineTo(1090, y + 28);
      context.stroke();
    }
  });

  context.strokeStyle = "#3b4d66";
  context.beginPath();
  context.moveTo(92, 526);
  context.lineTo(1108, 526);
  context.stroke();

  context.textAlign = "left";
  context.fillStyle = "#a9b8cc";
  context.font = "400 15px Arial, sans-serif";
  context.fillText(
    "A writing rubric, not a prediction of reach or engagement.",
    94,
    560,
  );
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}
