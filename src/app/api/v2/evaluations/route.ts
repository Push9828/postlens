import { getV2EvaluationService } from "@/features/evaluation/v2/server/create-evaluation-service";
import { handleV2EvaluationRequest } from "@/features/evaluation/v2/server/evaluation-controller";
import { guardProviderRequest } from "@/features/operations/server/request-guard";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request): Promise<Response> {
  const guarded = await guardProviderRequest(request, "evaluation");
  return "response" in guarded
    ? guarded.response
    : handleV2EvaluationRequest(guarded.request, getV2EvaluationService);
}
