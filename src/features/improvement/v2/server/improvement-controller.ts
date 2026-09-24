import { ImprovementError } from "../../application/improvement-error";
import type { V2ImprovementResult } from "../improve-post";

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
export async function handleV2ImprovementRequest(
  request: Request,
  dependency:
    | { execute(input: unknown): Promise<V2ImprovementResult> }
    | (() => { execute(input: unknown): Promise<V2ImprovementResult> }),
): Promise<Response> {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  )
    return errorResponse(new ImprovementError("UNSUPPORTED_MEDIA_TYPE"));
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(new ImprovementError("INVALID_REQUEST"));
  }
  try {
    const service =
      typeof dependency === "function" ? dependency() : dependency;
    return Response.json(await service.execute(body), {
      status: 200,
      headers: HEADERS,
    });
  } catch (error) {
    return errorResponse(
      error instanceof ImprovementError
        ? error
        : new ImprovementError("INTERNAL_ERROR"),
    );
  }
}
function errorResponse(error: ImprovementError): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    },
    { status: error.status, headers: HEADERS },
  );
}
