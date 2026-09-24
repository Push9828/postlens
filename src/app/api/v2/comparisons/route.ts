import { handleV2ComparisonRequest } from "@/features/evaluation/v2/server/comparison-controller";
import { getV2ComparisonService } from "@/features/evaluation/v2/server/create-comparison-service";
import { guardProviderRequest } from "@/features/operations/server/request-guard";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const guarded = await guardProviderRequest(request, "comparison");
  return "response" in guarded
    ? guarded.response
    : handleV2ComparisonRequest(guarded.request, getV2ComparisonService);
}
