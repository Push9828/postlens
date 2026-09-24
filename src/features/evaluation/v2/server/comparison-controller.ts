import {
  EvaluatePostError,
  type EvaluatePostErrorCode,
} from "../../application/evaluate-post.errors";
import type { V2ComparePostsResult } from "../compare-posts";
import { V2ComparisonError } from "../compare-posts";

const STATUS: Record<EvaluatePostErrorCode, number> = {
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
const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export async function handleV2ComparisonRequest(
  request: Request,
  dependency:
    | { execute(input: unknown): Promise<V2ComparePostsResult> }
    | (() => { execute(input: unknown): Promise<V2ComparePostsResult> }),
): Promise<Response> {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  )
    return errorResponse(
      new V2ComparisonError("UNSUPPORTED_MEDIA_TYPE", crypto.randomUUID()),
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      new V2ComparisonError("INVALID_REQUEST", crypto.randomUUID()),
    );
  }
  try {
    const service =
      typeof dependency === "function" ? dependency() : dependency;
    const result = await service.execute(body);
    return Response.json(result, { status: 200, headers: HEADERS });
  } catch (error) {
    return errorResponse(
      error instanceof V2ComparisonError
        ? error
        : new V2ComparisonError("INTERNAL_ERROR", crypto.randomUUID()),
    );
  }
}

function errorResponse(error: V2ComparisonError): Response {
  const safe = new EvaluatePostError(error.code);
  return Response.json(
    {
      error: {
        code: error.code,
        message: safe.message,
        retryable: safe.retryable,
        comparisonId: error.comparisonId,
        ...(error.field ? { field: error.field } : {}),
      },
    },
    { status: STATUS[error.code], headers: HEADERS },
  );
}
