import type {
  EvaluatePostInput,
  PostJudgments,
} from "../domain/evaluation.types";

export interface PostEvaluator {
  evaluate(input: EvaluatePostInput): Promise<PostJudgments>;
}

export type PostEvaluatorErrorKind =
  | "configuration"
  | "authentication"
  | "timeout"
  | "rate-limit"
  | "unavailable"
  | "invalid-response"
  | "aborted"
  | "unexpected";

export class PostEvaluatorError extends Error {
  override readonly name = "PostEvaluatorError";

  constructor(
    readonly kind: PostEvaluatorErrorKind,
    message: string,
  ) {
    super(message);
  }
}
