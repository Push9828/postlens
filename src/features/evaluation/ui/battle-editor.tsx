import type { KeyboardEvent, RefObject } from "react";
import {
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../application/evaluate-post.limits";

export function BattleEditor({
  label,
  id,
  content,
  count,
  error,
  textareaRef,
  onChange,
  onKeyDown,
}: {
  readonly label: string;
  readonly id: string;
  readonly content: string;
  readonly count: number;
  readonly error?: string;
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
  readonly onChange: (content: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-sm font-semibold text-[var(--text-primary)]"
        >
          {label}
        </label>
        <span
          id={`${id}-counter`}
          className={`font-mono text-xs tabular-nums ${count > MAX_POST_CHARACTERS ? "text-[var(--error)]" : "text-[var(--text-subtle)]"}`}
        >
          {count.toLocaleString()} / {MAX_POST_CHARACTERS.toLocaleString()}
        </span>
      </div>
      <p id={`${id}-help`} className="mt-2 text-sm text-[var(--text-muted)]">
        {MIN_POST_CHARACTERS} to {MAX_POST_CHARACTERS.toLocaleString()}{" "}
        characters.
      </p>
      <textarea
        ref={textareaRef}
        id={id}
        value={content}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby={`${id}-help ${id}-counter${error ? ` ${id}-error` : ""}`}
        aria-invalid={error !== undefined}
        className="mt-4 min-h-64 w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--input)] px-4 py-3 text-base leading-7 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--focus-ring)]"
        placeholder={`Paste ${label.toLowerCase()} here...`}
        spellCheck="true"
      />
      <div className="mt-2 min-h-6">
        {error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm font-medium text-[var(--error)]"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
