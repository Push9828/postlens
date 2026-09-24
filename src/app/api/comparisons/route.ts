import { handleComparisonRequest } from "@/features/evaluation/server/comparison-controller";
import { getComparisonService } from "@/features/evaluation/server/create-comparison-service";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleComparisonRequest(request, getComparisonService);
}
