import type { FormEvent, KeyboardEvent, RefObject } from "react";
import {
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../application/evaluate-post.limits";

interface DraftEditorProps {
  readonly content: string;
  readonly characterCount: number;
  readonly validationMessage?: string;
  readonly isSubmitting: boolean;
  readonly canSubmit: boolean;
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly onChange: (content: string) => void;
  readonly onSubmit: () => void;
  readonly onInvalidSubmit: () => void;
}

export function DraftEditor({
  content,
  characterCount,
  validationMessage,
  isSubmitting,
  canSubmit,
  textareaRef,
  onChange,
  onSubmit,
  onInvalidSubmit,
}: DraftEditorProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (canSubmit) {
      onSubmit();
    } else {
      onInvalidSubmit();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();

    if (canSubmit) {
      onSubmit();
    } else {
      onInvalidSubmit();
    }
  };

  const descriptionIds = [
    "draft-help",
    "draft-counter",
    validationMessage === undefined ? undefined : "draft-error",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      className="editor-panel rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--panel-shadow)] sm:p-6"
      onSubmit={handleSubmit}
      aria-busy={isSubmitting}
      noValidate
    >
      <div className="flex items-baseline justify-between gap-4">
        <label
          htmlFor="post-draft"
          className="text-sm font-semibold text-[var(--text-primary)]"
        >
          LinkedIn draft
        </label>
        <span
          id="draft-counter"
          className={`font-mono text-xs tabular-nums ${
            characterCount > MAX_POST_CHARACTERS
              ? "text-[var(--error)]"
              : "text-[var(--text-subtle)]"
          }`}
        >
          {characterCount.toLocaleString()} /{" "}
          {MAX_POST_CHARACTERS.toLocaleString()}
        </span>
      </div>

      <p id="draft-help" className="mt-2 text-sm text-[var(--text-muted)]">
        Paste {MIN_POST_CHARACTERS.toLocaleString()} to{" "}
        {MAX_POST_CHARACTERS.toLocaleString()} characters. Paragraphs and line
        breaks are preserved.
      </p>

      <textarea
        ref={textareaRef}
        id="post-draft"
        name="content"
        value={content}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-describedby={descriptionIds}
        aria-invalid={validationMessage !== undefined}
        className="mt-5 min-h-72 w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--input)] px-4 py-3 text-base leading-7 text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-ring)] sm:min-h-96"
        placeholder="Paste the draft you are preparing to publish..."
        spellCheck="true"
      />

      <div className="mt-2 min-h-6">
        {validationMessage === undefined ? null : (
          <p
            id="draft-error"
            className="text-sm font-medium text-[var(--error)]"
            role="alert"
          >
            {validationMessage}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[var(--text-subtle)]">
          Your draft is analyzed on request and is not saved.
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-describedby="submit-hint"
          className="min-h-11 w-full shrink-0 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-[var(--accent-contrast)] transition-[background-color,transform] duration-150 hover:bg-[var(--accent-hover)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[var(--button-disabled)] disabled:text-[var(--button-disabled-text)] sm:w-auto"
        >
          {isSubmitting ? "Analyzing..." : "Analyze draft"}
        </button>
      </div>
      <p id="submit-hint" className="sr-only">
        {canSubmit
          ? "Submit with this button or press Control Enter or Command Enter in the draft field."
          : "The draft must be within the stated character limits before it can be analyzed."}
      </p>
    </form>
  );
}
