export type V2ImproverErrorKind =
  | "timeout"
  | "rate-limit"
  | "unavailable"
  | "invalid-response"
  | "unexpected";

export class V2ImproverError extends Error {
  override readonly name = "V2ImproverError";
  constructor(readonly kind: V2ImproverErrorKind) {
    super(kind);
  }
}
