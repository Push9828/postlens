import type { ImprovementResult } from "../application/improve-post";
import { ImprovementError } from "../application/improvement-error";

type Dependency =
  | { execute(input: unknown): Promise<ImprovementResult> }
  | (() => { execute(input: unknown): Promise<ImprovementResult> });
const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

export async function handleImprovementRequest(
  request: Request,
  dependency: Dependency,
): Promise<Response> {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    return errorResponse(new ImprovementError("UNSUPPORTED_MEDIA_TYPE"));
  }
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
