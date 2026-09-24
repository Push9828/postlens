import "server-only";

import { V2ComparePostsService } from "../compare-posts";
import { getV2EvaluationService } from "./create-evaluation-service";

let service: V2ComparePostsService | undefined;
export function getV2ComparisonService(): V2ComparePostsService {
  if (!service)
    service = new V2ComparePostsService(getV2EvaluationService(), (event) =>
      console.info(JSON.stringify(event)),
    );
  return service;
}
