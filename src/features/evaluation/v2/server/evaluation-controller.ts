import {
  EvaluatePostError,
  type EvaluatePostErrorCode,
} from "../../application/evaluate-post.errors";
import type { V2EvaluatePostResult } from "../evaluate-post";

const STATUS_BY_ERROR_CODE: Record<EvaluatePostErrorCode, number> = {
  INVALID_REQUEST: 400,
  POST_TOO_SHORT: 400,
  POST_TOO_LONG: 400,
  REQUEST_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  EVALUATION_TIMEOUT: 504,
  EVALUATION_BUSY: 429,
  EVALUATION_UNAVAILABLE: 503,
  EVALUATION_FAILED: 502,
  INTERNAL_ERROR: 500,
};

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

export async function handleV2EvaluationRequest(
  request: Request,
  dependency:
    | { execute(input: unknown): Promise<V2EvaluatePostResult> }
    | (() => { execute(input: unknown): Promise<V2EvaluatePostResult> }),
): Promise<Response> {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  )
    return errorResponse(new EvaluatePostError("UNSUPPORTED_MEDIA_TYPE"));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(new EvaluatePostError("INVALID_REQUEST"));
  }
  try {
    const service =
      typeof dependency === "function" ? dependency() : dependency;
    return Response.json(await service.execute(body), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return errorResponse(
      error instanceof EvaluatePostError
        ? error
        : new EvaluatePostError("INTERNAL_ERROR"),
    );
  }
}

function errorResponse(error: EvaluatePostError): Response {
  return Response.json(
    {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        evaluationId: error.evaluationId ?? crypto.randomUUID(),
      },
    },
    { status: STATUS_BY_ERROR_CODE[error.code], headers: JSON_HEADERS },
  );
}
