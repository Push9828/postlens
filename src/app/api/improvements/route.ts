import { getImprovementService } from "@/features/improvement/server/create-improvement-service";
import { handleImprovementRequest } from "@/features/improvement/server/improvement-controller";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleImprovementRequest(request, getImprovementService);
}
