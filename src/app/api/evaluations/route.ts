import { getEvaluationService } from "@/features/evaluation/server/create-evaluation-service";
import { handleEvaluationRequest } from "@/features/evaluation/server/evaluation-controller";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleEvaluationRequest(request, getEvaluationService);
}
