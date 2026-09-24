import { createHash } from "node:crypto";
import {
  countUnicodeCodePoints,
  MAX_POST_CHARACTERS,
  MIN_POST_CHARACTERS,
} from "../application/evaluate-post.limits";
import { POSTLENS_RUBRIC } from "../domain/rubric";
import {
  BENCHMARK_DATASET_VERSION,
  BENCHMARK_FIXTURES,
  type BenchmarkFixture,
  HUMAN_LABEL_FIXTURE_IDS,
} from "../fixtures/benchmark-dataset";

export interface DatasetManifest {
  readonly version: string;
  readonly hash: string;
  readonly rubric: {
    readonly id: string;
    readonly version: string;
    readonly hash: string;
  };
  readonly fixtureCount: number;
  readonly labelFixtureIds: readonly string[];
  readonly fixtures: readonly {
    readonly id: string;
    readonly category: string;
    readonly description: string;
    readonly provenance: string;
    readonly characterCount: number;
    readonly contentHash: string;
  }[];
}

export function createDatasetManifest(
  fixtures: readonly BenchmarkFixture[] = BENCHMARK_FIXTURES,
  labelIds: readonly string[] = HUMAN_LABEL_FIXTURE_IDS,
  version = BENCHMARK_DATASET_VERSION,
): DatasetManifest {
  if (fixtures.length !== 50 || labelIds.length !== 24)
    throw new Error(
      "The frozen dataset requires 50 drafts and 24 human-label IDs.",
    );
  const seen = new Set<string>();
  const categories = new Set<string>();
  const entries = fixtures.map((fixture) => {
    if (!/^[a-z0-9-]+$/.test(fixture.id) || seen.has(fixture.id))
      throw new Error("Dataset fixture IDs must be unique and stable.");
    seen.add(fixture.id);
    categories.add(fixture.category);
    if (
      fixture.provenance !== "project-synthetic" ||
      !fixture.description.trim() ||
      fixture.content !== fixture.content.trim()
    )
      throw new Error(`Invalid provenance or text for ${fixture.id}.`);
    const characterCount = countUnicodeCodePoints(fixture.content);
    if (
      characterCount < MIN_POST_CHARACTERS ||
      characterCount > MAX_POST_CHARACTERS
    )
      throw new Error(`Input length is invalid for ${fixture.id}.`);
    return {
      id: fixture.id,
      category: fixture.category,
      description: fixture.description,
      provenance: fixture.provenance,
      characterCount,
      contentHash: sha256(fixture.content),
    };
  });
  for (const category of [
    "educational",
    "story",
    "career",
    "opinion",
    "announcement",
    "build-in-public",
    "case-study",
    "other",
  ]) {
    if (!categories.has(category))
      throw new Error(`Dataset is missing ${category}.`);
  }
  if (new Set(labelIds).size !== 24 || labelIds.some((id) => !seen.has(id)))
    throw new Error("Human-label IDs must be 24 unique dataset fixtures.");
  return {
    version,
    hash: sha256(JSON.stringify({ version, fixtures, labelIds })),
    rubric: {
      id: POSTLENS_RUBRIC.id,
      version: POSTLENS_RUBRIC.version,
      hash: sha256(JSON.stringify(POSTLENS_RUBRIC)),
    },
    fixtureCount: fixtures.length,
    labelFixtureIds: labelIds,
    fixtures: entries,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
