import { getEvaluationService } from "@/features/evaluation/server/create-evaluation-service";
import { handleEvaluationRequest } from "@/features/evaluation/server/evaluation-controller";
import { guardProviderRequest } from "@/features/operations/server/request-guard";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request): Promise<Response> {
  const guarded = await guardProviderRequest(request, "evaluation");
  return "response" in guarded
    ? guarded.response
    : handleEvaluationRequest(guarded.request, getEvaluationService);
}
