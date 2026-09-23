import { scorePost } from "../src/features/evaluation/domain/scoring";
import {
  getEvaluationFixture,
  JEV_EVALUATION_FIXTURES,
} from "../src/features/evaluation/fixtures/jev-fixtures";
import {
  JevAdapterError,
  type JevEvaluationDiagnostics,
} from "../src/features/evaluation/infrastructure/jev";
import { createJevRuntime } from "./jev-runtime";

async function main(): Promise<void> {
  const fixtureId = process.argv[2] ?? JEV_EVALUATION_FIXTURES[0]?.id;
  const fixture = fixtureId ? getEvaluationFixture(fixtureId) : undefined;

  if (fixture === undefined) {
    throw new Error(`Unknown fixture: ${String(fixtureId)}`);
  }

  let diagnostics: JevEvaluationDiagnostics | undefined;
  const { evaluator } = createJevRuntime({
    explanationMode: "reason-code",
    onDiagnostics: (event) => {
      diagnostics = event;
    },
  });
  const judgments = await evaluator.evaluate({ content: fixture.content });
  const evaluation = scorePost(judgments);

  console.log(
    JSON.stringify(
      {
        fixture: {
          id: fixture.id,
          category: fixture.category,
          description: fixture.description,
        },
        judgments,
        evaluation,
        diagnostics,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  if (error instanceof JevAdapterError) {
    console.error(JSON.stringify({ kind: error.kind, message: error.message }));
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Jev smoke test failed unexpectedly.");
  }

  process.exitCode = 1;
});
