import type {
  EvaluationEvent,
  EvaluationObserver,
} from "../../application/evaluation-observer";

export class ConsoleEvaluationObserver implements EvaluationObserver {
  observe(event: EvaluationEvent): void {
    console.info(JSON.stringify(event));
  }
}
