import { handleComparisonRequest } from "@/features/evaluation/server/comparison-controller";
import { getComparisonService } from "@/features/evaluation/server/create-comparison-service";
import { guardProviderRequest } from "@/features/operations/server/request-guard";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function POST(request: Request): Promise<Response> {
  const guarded = await guardProviderRequest(request, "comparison");
  return "response" in guarded
    ? guarded.response
    : handleComparisonRequest(guarded.request, getComparisonService);
}
