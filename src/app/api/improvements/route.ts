import { getImprovementService } from "@/features/improvement/server/create-improvement-service";
import { handleImprovementRequest } from "@/features/improvement/server/improvement-controller";
import { guardProviderRequest } from "@/features/operations/server/request-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const guarded = await guardProviderRequest(request, "improvement");
  return "response" in guarded
    ? guarded.response
    : handleImprovementRequest(guarded.request, getImprovementService);
}
