import type { PostImproverErrorKind } from "./post-improver";

export const IMPROVEMENT_ERRORS = {
  INVALID_REQUEST: {
    message: "Send a valid draft, action, and evaluation.",
    retryable: false,
    status: 400,
  },
  POST_TOO_SHORT: {
    message: "The post must contain at least 20 characters.",
    retryable: false,
    status: 400,
  },
  POST_TOO_LONG: {
    message: "The post must contain no more than 3,000 characters.",
    retryable: false,
    status: 400,
  },
  REQUEST_TOO_LARGE: {
    message: "The request is too large.",
    retryable: false,
    status: 413,
  },
  STALE_RUBRIC: {
    message: "Analyze this draft again with the current rubric.",
    retryable: false,
    status: 409,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    message: "Use Content-Type: application/json.",
    retryable: false,
    status: 415,
  },
  IMPROVEMENT_TIMEOUT: {
    message: "The improvement took too long. Please try again.",
    retryable: true,
    status: 504,
  },
  IMPROVEMENT_BUSY: {
    message: "The generator is busy. Please try again shortly.",
    retryable: true,
    status: 429,
  },
  IMPROVEMENT_UNAVAILABLE: {
    message: "Improvement is temporarily unavailable.",
    retryable: true,
    status: 503,
  },
  IMPROVEMENT_FAILED: {
    message:
      "The generator returned an unreadable suggestion. Please try again.",
    retryable: true,
    status: 502,
  },
  UNSAFE_SUGGESTION: {
    message:
      "The suggestion could not be safely applied. Try another action or revise the draft yourself.",
    retryable: false,
    status: 422,
  },
  INTERNAL_ERROR: {
    message: "The improvement could not be completed.",
    retryable: false,
    status: 500,
  },
} as const;

export type ImprovementErrorCode = keyof typeof IMPROVEMENT_ERRORS;

export class ImprovementError extends Error {
  override readonly name = "ImprovementError";
  readonly retryable: boolean;
  readonly status: number;
  constructor(readonly code: ImprovementErrorCode) {
    super(IMPROVEMENT_ERRORS[code].message);
    this.retryable = IMPROVEMENT_ERRORS[code].retryable;
    this.status = IMPROVEMENT_ERRORS[code].status;
  }
}

export function mapImproverError(
  kind: PostImproverErrorKind,
): ImprovementError {
  const code: Record<PostImproverErrorKind, ImprovementErrorCode> = {
    timeout: "IMPROVEMENT_TIMEOUT",
    "rate-limit": "IMPROVEMENT_BUSY",
    unavailable: "IMPROVEMENT_UNAVAILABLE",
    "invalid-response": "IMPROVEMENT_FAILED",
    unexpected: "INTERNAL_ERROR",
  };
  return new ImprovementError(code[kind]);
}
