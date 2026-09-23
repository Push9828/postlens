import type {
  EvaluatePostInput,
  PostJudgments,
} from "../domain/evaluation.types";

export interface PostEvaluator {
  evaluate(input: EvaluatePostInput): Promise<PostJudgments>;
}
