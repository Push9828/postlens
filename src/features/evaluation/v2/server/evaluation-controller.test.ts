import { describe, expect, it, vi } from "vitest";
import { EvaluatePostError } from "../../application/evaluate-post.errors";
import { handleV2EvaluationRequest } from "./evaluation-controller";

const EVALUATION_ID = "3c55ef5b-1bc5-40c2-b332-c24ac8854533";
const PRIVATE_DRAFT = "A private draft with enough detail to evaluate.";
const request = (body: string, contentType = "application/json") =>
  new Request("http://localhost/api/v2/evaluations", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });

describe("handleV2EvaluationRequest", () => {
  it("returns a no-store V2 envelope", async () => {
    const result = {
      evaluationId: EVALUATION_ID,
      evaluation: { rubricVersion: "2.0" },
    };
    const execute = vi.fn(async () => result);
    const response = await handleV2EvaluationRequest(
      request(JSON.stringify({ content: PRIVATE_DRAFT })),
      { execute } as never,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(result);
    expect(execute).toHaveBeenCalledWith({ content: PRIVATE_DRAFT });
  });

  it("rejects bad content types and JSON before service creation", async () => {
    const factory = vi.fn();
    const media = await handleV2EvaluationRequest(
      request("{}", "text/plain"),
      factory,
    );
    const json = await handleV2EvaluationRequest(request("{"), factory);
    expect(media.status).toBe(415);
    expect(json.status).toBe(400);
    expect(factory).not.toHaveBeenCalled();
  });

  it("returns safe mapped and unexpected errors", async () => {
    const mapped = await handleV2EvaluationRequest(request("{}"), {
      execute: async () => {
        throw new EvaluatePostError("EVALUATION_TIMEOUT", true, EVALUATION_ID);
      },
    });
    const unexpected = await handleV2EvaluationRequest(request("{}"), {
      execute: async () => {
        throw new Error(PRIVATE_DRAFT);
      },
    });
    expect(mapped.status).toBe(504);
    expect(await mapped.json()).toMatchObject({
      error: { code: "EVALUATION_TIMEOUT", evaluationId: EVALUATION_ID },
    });
    expect(unexpected.status).toBe(500);
    expect(JSON.stringify(await unexpected.json())).not.toContain(
      PRIVATE_DRAFT,
    );
  });
});
