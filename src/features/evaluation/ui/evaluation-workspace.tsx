"use client";

import { useState } from "react";
import { Analyzer } from "./analyzer";
import { PostBattle } from "./post-battle";

export function EvaluationWorkspace() {
  const [mode, setMode] = useState<"analyze" | "compare">("analyze");
  const [versionA, setVersionA] = useState("");
  const [versionB, setVersionB] = useState("");

  return (
    <>
      <fieldset className="mb-6 flex flex-wrap gap-2">
        <legend className="sr-only">Evaluation mode</legend>
        <button
          type="button"
          aria-pressed={mode === "analyze"}
          onClick={() => setMode("analyze")}
          className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${mode === "analyze" ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]"}`}
        >
          Analyze
        </button>
        <button
          type="button"
          aria-pressed={mode === "compare"}
          onClick={() => setMode("compare")}
          className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold ${mode === "compare" ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]"}`}
        >
          Compare drafts
        </button>
      </fieldset>
      {mode === "analyze" ? (
        <Analyzer content={versionA} onContentChange={setVersionA} />
      ) : (
        <PostBattle
          versionA={versionA}
          versionB={versionB}
          onVersionAChange={setVersionA}
          onVersionBChange={setVersionB}
        />
      )}
    </>
  );
}
