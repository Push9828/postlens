import type { EvaluatePostResult } from "../application";
import { EvaluatePostError, type EvaluatePostErrorCode } from "../application";

interface EvaluationService {
  execute(input: unknown): Promise<EvaluatePostResult>;
}

export type EvaluationServiceDependency =
  | EvaluationService
  | (() => EvaluationService);

interface EvaluationErrorResponse {
  readonly error: {
    readonly code: EvaluatePostErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly evaluationId: string;
  };
}

const STATUS_BY_ERROR_CODE: Record<EvaluatePostErrorCode, number> = {
  INVALID_REQUEST: 400,
  POST_TOO_SHORT: 400,
  POST_TOO_LONG: 400,
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

export async function handleEvaluationRequest(
  request: Request,
  dependency: EvaluationServiceDependency,
): Promise<Response> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return errorResponse(new EvaluatePostError("UNSUPPORTED_MEDIA_TYPE"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(new EvaluatePostError("INVALID_REQUEST"));
  }

  try {
    const service =
      typeof dependency === "function" ? dependency() : dependency;
    const result = await service.execute(body);

    return Response.json(result, { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    return errorResponse(
      error instanceof EvaluatePostError
        ? error
        : new EvaluatePostError("INTERNAL_ERROR"),
    );
  }
}

function isJsonContentType(contentType: string | null): boolean {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

function errorResponse(error: EvaluatePostError): Response {
  const evaluationId = error.evaluationId ?? crypto.randomUUID();
  const body: EvaluationErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      evaluationId,
    },
  };

  return Response.json(body, {
    status: STATUS_BY_ERROR_CODE[error.code],
    headers: JSON_HEADERS,
  });
}
