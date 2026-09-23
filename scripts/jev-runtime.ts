import {
  type JevDiagnosticsObserver,
  type JevExplanationMode,
  JevPostEvaluator,
  TypeSafeJevClient,
} from "../src/features/evaluation/infrastructure/jev";

export const TYPESAFE_SDK_VERSION = "0.6.0";

export interface JevRuntimeOptions {
  readonly explanationMode: JevExplanationMode;
  readonly onDiagnostics?: JevDiagnosticsObserver;
}

export function createJevRuntime(options: JevRuntimeOptions): {
  readonly evaluator: JevPostEvaluator;
  readonly model: string;
} {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "TYPESAFE_API_KEY is required. Export it in your shell before running Jev experiments.",
    );
  }

  const model = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest";
  const client = new TypeSafeJevClient({
    apiKey,
    model,
    maxRetries: 0,
  });

  return {
    model,
    evaluator: new JevPostEvaluator({
      client,
      requestedModel: model,
      explanationMode: options.explanationMode,
      onDiagnostics: options.onDiagnostics,
    }),
  };
}
