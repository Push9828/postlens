import {
  ComparePostsError,
  type ComparePostsResult,
} from "../application/compare-posts";
import {
  EvaluatePostError,
  type EvaluatePostErrorCode,
} from "../application/evaluate-post.errors";

interface ComparisonService {
  execute(input: unknown): Promise<ComparePostsResult>;
}

export type ComparisonServiceDependency =
  | ComparisonService
  | (() => ComparisonService);

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

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

export async function handleComparisonRequest(
  request: Request,
  dependency: ComparisonServiceDependency,
): Promise<Response> {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  ) {
    return errorResponse(
      new ComparePostsError("UNSUPPORTED_MEDIA_TYPE", crypto.randomUUID()),
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      new ComparePostsError("INVALID_REQUEST", crypto.randomUUID()),
    );
  }

  try {
    const service =
      typeof dependency === "function" ? dependency() : dependency;
    const result = await service.execute(body);
    return Response.json(result, {
      status: result.status === "failed" ? failedStatus(result) : 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return errorResponse(
      error instanceof ComparePostsError
        ? error
        : error instanceof EvaluatePostError
          ? new ComparePostsError(
              error.code,
              crypto.randomUUID(),
              undefined,
              error.retryable,
            )
          : new ComparePostsError("INTERNAL_ERROR", crypto.randomUUID()),
    );
  }
}

function failedStatus(
  result: Extract<ComparePostsResult, { status: "failed" }>,
): number {
  const codeA = result.versions.A.error.code;
  const codeB = result.versions.B.error.code;
  return codeA === codeB ? STATUS_BY_ERROR_CODE[codeA] : 502;
}

function errorResponse(error: ComparePostsError): Response {
  const definition = new EvaluatePostError(error.code);
  return Response.json(
    {
      error: {
        code: error.code,
        message: definition.message,
        retryable: error.retryable,
        comparisonId: error.comparisonId,
        ...(error.field === undefined ? {} : { field: error.field }),
      },
    },
    { status: STATUS_BY_ERROR_CODE[error.code], headers: JSON_HEADERS },
  );
}
