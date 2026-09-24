import "server-only";

import { ComparePostsService } from "../application/compare-posts";
import { getEvaluationService } from "./create-evaluation-service";

let service: ComparePostsService | undefined;

export function getComparisonService(): ComparePostsService {
  if (service !== undefined) {
    return service;
  }

  service = new ComparePostsService({
    evaluationService: getEvaluationService(),
    observe: (event) => console.info(JSON.stringify(event)),
  });
  return service;
}
