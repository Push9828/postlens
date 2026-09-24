import { describe, expect, it } from "vitest";
import { ImprovementError } from "../application/improvement-error";
import { handleImprovementRequest } from "./improvement-controller";

describe("improvement controller", () => {
  it("requires JSON and suppresses raw server errors", async () => {
    const dependency = {
      execute: async () => {
        throw new Error("private draft and provider detail");
      },
    };
    const unsupported = await handleImprovementRequest(
      new Request("https://local/api/improvements", {
        method: "POST",
        body: "hi",
      }),
      dependency,
    );
    expect(unsupported.status).toBe(415);
    const failed = await handleImprovementRequest(
      new Request("https://local/api/improvements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      dependency,
    );
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("private draft");
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });

  it("maps controlled provider failure to stable status", async () => {
    const response = await handleImprovementRequest(
      new Request("https://local/api/improvements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      {
        execute: async () => {
          throw new ImprovementError("IMPROVEMENT_BUSY");
        },
      },
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { code: "IMPROVEMENT_BUSY", retryable: true },
    });
  });
});
