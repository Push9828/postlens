import type {
  PostEvaluatorError,
  PostEvaluatorErrorKind,
} from "./post-evaluator";

export type EvaluatePostErrorCode =
  | "INVALID_REQUEST"
  | "POST_TOO_SHORT"
  | "POST_TOO_LONG"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "EVALUATION_TIMEOUT"
  | "EVALUATION_BUSY"
  | "EVALUATION_UNAVAILABLE"
  | "EVALUATION_FAILED"
  | "INTERNAL_ERROR";

interface ErrorDefinition {
  readonly message: string;
  readonly retryable: boolean;
}

const ERROR_DEFINITIONS = {
  INVALID_REQUEST: {
    message: "Send a JSON object containing only a text content field.",
    retryable: false,
  },
  POST_TOO_SHORT: {
    message: "The post must contain at least 20 characters.",
    retryable: false,
  },
  POST_TOO_LONG: {
    message: "The post must contain no more than 3,000 characters.",
    retryable: false,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    message: "Use Content-Type: application/json.",
    retryable: false,
  },
  EVALUATION_TIMEOUT: {
    message: "The evaluation took too long. Please try again.",
    retryable: true,
  },
  EVALUATION_BUSY: {
    message: "The evaluator is busy. Please try again shortly.",
    retryable: true,
  },
  EVALUATION_UNAVAILABLE: {
    message: "Evaluation is temporarily unavailable.",
    retryable: true,
  },
  EVALUATION_FAILED: {
    message: "The evaluator could not complete this request. Please try again.",
    retryable: true,
  },
  INTERNAL_ERROR: {
    message: "The evaluation could not be completed.",
    retryable: false,
  },
} as const satisfies Record<EvaluatePostErrorCode, ErrorDefinition>;

export class EvaluatePostError extends Error {
  override readonly name = "EvaluatePostError";

  constructor(
    readonly code: EvaluatePostErrorCode,
    readonly retryable: boolean = ERROR_DEFINITIONS[code].retryable,
    readonly evaluationId?: string,
  ) {
    super(ERROR_DEFINITIONS[code].message);
  }

  withEvaluationId(evaluationId: string): EvaluatePostError {
    return new EvaluatePostError(this.code, this.retryable, evaluationId);
  }
}

export function mapPostEvaluatorError(
  error: PostEvaluatorError,
): EvaluatePostError {
  const codeByKind: Record<PostEvaluatorErrorKind, EvaluatePostErrorCode> = {
    configuration: "EVALUATION_UNAVAILABLE",
    authentication: "EVALUATION_UNAVAILABLE",
    timeout: "EVALUATION_TIMEOUT",
    "rate-limit": "EVALUATION_BUSY",
    unavailable: "EVALUATION_UNAVAILABLE",
    "invalid-response": "EVALUATION_FAILED",
    aborted: "EVALUATION_FAILED",
    unexpected: "INTERNAL_ERROR",
  };
  const code = codeByKind[error.kind];
  const retryable =
    error.kind === "configuration" || error.kind === "authentication"
      ? false
      : ERROR_DEFINITIONS[code].retryable;

  return new EvaluatePostError(code, retryable);
}
