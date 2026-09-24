import { z } from "zod";
import {
  EVALUATION_DIMENSIONS,
  EVALUATION_LEVELS,
} from "../domain/evaluation.types";
import { POSTLENS_RUBRIC } from "../domain/rubric";
import {
  BENCHMARK_FIXTURES,
  HUMAN_LABEL_FIXTURE_IDS,
} from "../fixtures/benchmark-dataset";
import type { HumanLabelFile } from "./benchmark.types";
import type { DatasetManifest } from "./dataset";

const levelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
const levels = z.strictObject(
  Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [dimension, levelSchema]),
  ) as unknown as Record<
    (typeof EVALUATION_DIMENSIONS)[number],
    typeof levelSchema
  >,
);
const fileSchema = z.strictObject({
  datasetHash: z.string().regex(/^[a-f0-9]{64}$/),
  rubricVersion: z.string().min(1),
  primaryRaterId: z.string().trim().min(1).max(80),
  labels: z.array(
    z.strictObject({
      fixtureId: z.string(),
      raterId: z.string().trim().min(1).max(80),
      labeledAt: z.iso.datetime(),
      levels,
      ambiguityNote: z.string().max(500).optional(),
    }),
  ),
});

export function parseHumanLabels(
  input: unknown,
  manifest: DatasetManifest,
): HumanLabelFile {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Human label file has an invalid shape.");
  const file = parsed.data;
  if (
    file.datasetHash !== manifest.hash ||
    file.rubricVersion !== manifest.rubric.version
  )
    throw new Error("Human labels do not match the frozen dataset and rubric.");
  const selected = new Set(HUMAN_LABEL_FIXTURE_IDS);
  const seen = new Set<string>();
  for (const label of file.labels) {
    if (
      !selected.has(label.fixtureId as (typeof HUMAN_LABEL_FIXTURE_IDS)[number])
    )
      throw new Error("A label refers to a fixture outside the frozen subset.");
    const key = `${label.raterId}:${label.fixtureId}`;
    if (seen.has(key)) throw new Error("Duplicate human label.");
    seen.add(key);
  }
  return file;
}

export function createHumanLabelSheet(manifest: DatasetManifest): string {
  const fixtureById = new Map(
    BENCHMARK_FIXTURES.map((fixture) => [fixture.id, fixture]),
  );
  const lines = [
    "# PostLens Phase 8 human labeling sheet",
    "",
    `Dataset version: ${manifest.version}; hash: ${manifest.hash}`,
    `Rubric: ${manifest.rubric.id} ${manifest.rubric.version}`,
    "",
    "Label independently without seeing provider outputs. Record one 0–4 level for each dimension in the JSON label file. Add an ambiguity note when the rubric is unclear.",
    "",
  ];
  for (const id of HUMAN_LABEL_FIXTURE_IDS) {
    const fixture = fixtureById.get(id);
    if (!fixture) throw new Error(`Missing fixture ${id}.`);
    lines.push(
      `## ${id}`,
      "",
      `Category: ${fixture.category}`,
      "",
      "### Draft",
      "",
      "```text",
      fixture.content,
      "```",
      "",
      "### Rubric levels",
      "",
    );
    for (const dimension of EVALUATION_DIMENSIONS) {
      const definition = POSTLENS_RUBRIC.dimensions[dimension];
      lines.push(`**${definition.label}:** ${definition.question}`, "");
      for (const level of EVALUATION_LEVELS)
        lines.push(`- ${level}: ${definition.levels[level]}`);
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

export function createHumanLabelTemplate(manifest: DatasetManifest): string {
  return `${JSON.stringify({ datasetHash: manifest.hash, rubricVersion: manifest.rubric.version, primaryRaterId: "REPLACE_WITH_HUMAN_RATER_ID", labels: HUMAN_LABEL_FIXTURE_IDS.map((fixtureId) => ({ fixtureId, raterId: "REPLACE_WITH_HUMAN_RATER_ID", labeledAt: null, levels: Object.fromEntries(EVALUATION_DIMENSIONS.map((dimension) => [dimension, null])) })) }, null, 2)}\n`;
}
