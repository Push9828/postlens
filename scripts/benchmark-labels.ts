import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatasetManifest } from "../src/features/evaluation/benchmark/dataset";
import {
  createHumanLabelSheet,
  createHumanLabelTemplate,
  parseHumanLabels,
} from "../src/features/evaluation/benchmark/labels";

const directory = resolve("content/experiments/phase-8-labels");
const manifest = createDatasetManifest();

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "export") {
    await mkdir(directory, { recursive: true });
    const sheet = resolve(directory, "labeling-sheet.md");
    const template = resolve(directory, "labels-template.json");
    await writeFile(sheet, createHumanLabelSheet(manifest), "utf8");
    await writeFile(template, createHumanLabelTemplate(manifest), "utf8");
    console.log(
      JSON.stringify({
        sheet,
        template,
        selectedFixtures: manifest.labelFixtureIds.length,
      }),
    );
    return;
  }
  if (command === "validate") {
    const path = process.argv[3];
    if (!path)
      throw new Error("Provide the path to a completed label JSON file.");
    const labels = parseHumanLabels(
      JSON.parse(await readFile(resolve(path), "utf8")),
      manifest,
    );
    const primaryCount = labels.labels.filter(
      (label) => label.raterId === labels.primaryRaterId,
    ).length;
    console.log(
      JSON.stringify({
        primaryRaterId: labels.primaryRaterId,
        primaryCount,
        requiredCount: 24,
        complete: primaryCount === 24,
      }),
    );
    return;
  }
  throw new Error(
    "Use benchmark:labels export or benchmark:labels validate PATH.",
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Label workflow failed.",
  );
  process.exitCode = 1;
});
