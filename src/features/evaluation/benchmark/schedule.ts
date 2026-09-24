import {
  BENCHMARK_FIXTURES,
  type BenchmarkFixture,
} from "../fixtures/benchmark-dataset";
import type { BenchmarkAttempt } from "./benchmark.types";
import { attemptKey, type BenchmarkProvider } from "./benchmark.types";

export const PREFLIGHT_IDS = [
  "strong-educational",
  "generic-educational",
  "career-specific-feedback",
  "edge-unicode-format",
  "edge-instruction-in-draft",
] as const;

export interface ScheduledAttempt {
  readonly key: string;
  readonly fixture: BenchmarkFixture;
  readonly provider: BenchmarkProvider;
  readonly repetition: number;
  readonly order: number;
}

export function createSchedule(
  mode: "preflight" | "run",
  seed = 8_2026,
): readonly ScheduledAttempt[] {
  const fixtures =
    mode === "preflight"
      ? BENCHMARK_FIXTURES.filter((fixture) =>
          PREFLIGHT_IDS.includes(fixture.id as (typeof PREFLIGHT_IDS)[number]),
        )
      : BENCHMARK_FIXTURES;
  const repeats = mode === "preflight" ? 1 : 3;
  const attempts: ScheduledAttempt[] = [];
  for (let repetition = 1; repetition <= repeats; repetition += 1) {
    const ordered = seededShuffle(fixtures, seed + repetition);
    for (let index = 0; index < ordered.length; index += 1) {
      const fixture = ordered[index];
      if (!fixture) continue;
      const providers: readonly BenchmarkProvider[] =
        (index + repetition) % 2 === 0
          ? ["jev", "openai-llm"]
          : ["openai-llm", "jev"];
      for (const provider of providers)
        attempts.push({
          key: attemptKey(fixture.id, repetition, provider),
          fixture,
          provider,
          repetition,
          order: attempts.length + 1,
        });
    }
  }
  return attempts;
}

export function remainingSchedule(
  schedule: readonly ScheduledAttempt[],
  saved: readonly BenchmarkAttempt[],
): readonly ScheduledAttempt[] {
  const planned = new Set(schedule.map((item) => item.key));
  const completed = new Set<string>();
  for (const attempt of saved) {
    if (!planned.has(attempt.key) || completed.has(attempt.key))
      throw new Error(
        "Saved attempts contain an unscheduled or duplicate key.",
      );
    const item = schedule.find((candidate) => candidate.key === attempt.key);
    if (
      !item ||
      item.fixture.id !== attempt.fixtureId ||
      item.provider !== attempt.provider ||
      item.repetition !== attempt.repetition ||
      item.order !== attempt.order
    )
      throw new Error("Saved attempt does not match the frozen schedule.");
    completed.add(attempt.key);
  }
  return schedule.filter((item) => !completed.has(item.key));
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const other = state % (index + 1);
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}
