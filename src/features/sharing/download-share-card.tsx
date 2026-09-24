"use client";

import { useState } from "react";
import type { PostEvaluation } from "../evaluation/domain/evaluation.types";
import { DIMENSION_LABELS } from "../evaluation/ui/score-copy";
import { createShareCardSvg } from "./share-card";

export function DownloadShareCard({
  evaluation,
  disabled,
}: {
  readonly evaluation: PostEvaluation;
  readonly disabled: boolean;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const download = () => {
    const image = new Blob([createShareCardSvg(evaluation)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(image);
    const link = document.createElement("a");
    link.href = url;
    link.download = "postlens-rubric-result.svg";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const copySummary = async () => {
    const strongest = evaluation.strongestDimension;
    const summary = `Post Potential: ${evaluation.overallScore}/100 against the PostLens rubric. Strongest dimension: ${DIMENSION_LABELS[strongest]} (${evaluation.dimensions[strongest].score}/100). A rubric result, not a prediction of reach or engagement.`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopyMessage("Score summary copied.");
    } catch {
      setCopyMessage("Copy failed. You can still download the score card.");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={download}
          disabled={disabled}
          className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Download score card
        </button>
        <button
          type="button"
          onClick={() => void copySummary()}
          disabled={disabled}
          className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Copy score summary
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--text-subtle)]" aria-live="polite">
        {copyMessage}
      </p>
    </div>
  );
}
