import type { EvaluatePostResult } from "../application/evaluate-post";
import type { EvaluationClientError } from "./evaluation-api-client";

export type AnalyzerState =
  | { readonly status: "idle" }
  | {
      readonly status: "submitting";
      readonly requestId: number;
      readonly submittedContent: string;
    }
  | {
      readonly status: "success";
      readonly requestId: number;
      readonly submittedContent: string;
      readonly result: EvaluatePostResult;
    }
  | {
      readonly status: "failure";
      readonly requestId: number;
      readonly submittedContent: string;
      readonly error: EvaluationClientError;
    };

export type AnalyzerAction =
  | {
      readonly type: "submit";
      readonly requestId: number;
      readonly submittedContent: string;
    }
  | {
      readonly type: "succeed";
      readonly requestId: number;
      readonly result: EvaluatePostResult;
    }
  | {
      readonly type: "fail";
      readonly requestId: number;
      readonly error: EvaluationClientError;
    };

export const INITIAL_ANALYZER_STATE: AnalyzerState = { status: "idle" };

export function analyzerReducer(
  state: AnalyzerState,
  action: AnalyzerAction,
): AnalyzerState {
  if (action.type === "submit") {
    return {
      status: "submitting",
      requestId: action.requestId,
      submittedContent: action.submittedContent,
    };
  }

  if (state.status !== "submitting" || state.requestId !== action.requestId) {
    return state;
  }

  if (action.type === "succeed") {
    return {
      status: "success",
      requestId: state.requestId,
      submittedContent: state.submittedContent,
      result: action.result,
    };
  }

  return {
    status: "failure",
    requestId: state.requestId,
    submittedContent: state.submittedContent,
    error: action.error,
  };
}

export function isResultStale(
  state: AnalyzerState,
  currentContent: string,
): boolean {
  return (
    (state.status === "success" || state.status === "failure") &&
    state.submittedContent !== currentContent.trim()
  );
}
