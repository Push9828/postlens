export type V2JevEvaluatorErrorKind =
  | "configuration"
  | "authentication"
  | "rate-limit"
  | "timeout"
  | "aborted"
  | "unavailable"
  | "invalid-response"
  | "unexpected";

export class V2JevEvaluatorError extends Error {
  override readonly name = "V2JevEvaluatorError";

  constructor(
    readonly kind: V2JevEvaluatorErrorKind,
    message: string,
  ) {
    super(message);
  }
}
