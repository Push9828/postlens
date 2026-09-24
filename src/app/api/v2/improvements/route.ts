import { getV2ImprovementService } from "@/features/improvement/v2/server/create-improvement-service";
import { handleV2ImprovementRequest } from "@/features/improvement/v2/server/improvement-controller";
import { guardProviderRequest } from "@/features/operations/server/request-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const guarded = await guardProviderRequest(request, "improvement");
  return "response" in guarded
    ? guarded.response
    : handleV2ImprovementRequest(guarded.request, getV2ImprovementService);
}
