"use client";

import { useState } from "react";
import type { PostEvaluation } from "../evaluation/domain/evaluation.types";
import { drawShareCard } from "./share-card";

export function DownloadShareCard({
  evaluation,
  disabled,
}: {
  readonly evaluation: PostEvaluation;
  readonly disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  const download = async () => {
    try {
      const canvas = document.createElement("canvas");
      drawShareCard(canvas, evaluation);
      const image = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!image) throw new Error("PNG export failed.");

      const url = URL.createObjectURL(image);
      const link = document.createElement("a");
      link.href = url;
      link.download = "postlens-rubric-result.png";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage("PNG score card downloaded.");
    } catch {
      setMessage("Could not create the PNG score card. Please try again.");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void download()}
          disabled={disabled}
          className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Download PNG score card
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--text-subtle)]" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
