"use client";

import { useState } from "react";
import type { V2PostEvaluation } from "../../evaluation/v2/evaluate-post";
import { drawV2ShareCard } from "./share-card";

export function V2DownloadShareCard({
  evaluation,
  disabled,
}: {
  readonly evaluation: V2PostEvaluation;
  readonly disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  const download = async () => {
    try {
      const brandIcon = new Image();
      brandIcon.src = "/favicon.ico";
      await brandIcon.decode();
      const canvas = document.createElement("canvas");
      drawV2ShareCard(canvas, evaluation, brandIcon);
      const image = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!image) throw new Error("PNG export failed.");
      const url = URL.createObjectURL(image);
      const link = document.createElement("a");
      link.href = url;
      link.download = "postlens-rubric-v2.png";
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
      <button
        type="button"
        onClick={() => void download()}
        disabled={disabled}
        className="min-h-11 cursor-pointer rounded-lg border border-[var(--border-strong)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        Download PNG score card
      </button>
      <p className="mt-2 text-xs text-[var(--text-subtle)]" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
