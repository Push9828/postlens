# PostLens

An AI-assisted LinkedIn post evaluator built around structured judgment, deterministic scoring, and targeted generative improvement.

## Core Idea

```text
Jev → judgment
Code → scoring
LLM → rewriting
```

PostLens does **not** claim to predict virality.

It evaluates a draft against an explicit rubric.

## Start Here

Read:

1. `docs/PRD.md`
2. `AGENTS.md`
3. `docs/architecture.md`
4. `docs/evaluation-methodology.md`

## Initial Milestones

### M0 — Foundation
Domain types, rubric, deterministic scoring, tests.

### M1 — Jev Spike
CLI evaluator, Jev integration, fixtures, repeatability and latency experiments.

### M2 — Evaluation API
Production evaluator abstraction, validation, errors.

### M3 — Analyzer
Paste → analyze → results.

### M4 — Post Battle
A/B comparison.

### M5 — Improvement
LLM-powered targeted rewriting.

### M6 — Evaluation Quality
Human-labelled dataset and consistency tooling.

### M7 — Benchmark
Jev vs generative LLM.

### M8 — Launch
README, methodology, sharing, deployment, launch content.

## Development

```bash
pnpm install
pnpm dev
```

Before committing changes, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Install the Chromium browser once before running end-to-end tests:

```bash
pnpm exec playwright install chromium
```

## Analyzer Experience

The root page provides the complete anonymous analyzer journey:

```text
Paste -> Analyze -> Understand
```

It shows Post Potential, the score interpretation, content type, strongest and
weakest dimensions, a deterministic next focus, and explanations for all eight
rubric dimensions. Results are explicitly scoped to the PostLens rubric and do
not predict reach or virality.

Drafts remain in transient browser memory only. The analyzer does not place
them in URLs, browser storage, analytics, or client logs. Editing after an
analysis keeps the result visible but marks it as belonging to an earlier
version of the draft.

## Post Battle

Switch to `Compare drafts` on the root page to evaluate Version A and Version B
under the same evaluator configuration and rubric version. The result shows
both Post Potential scores, all eight dimensions, and signed differences defined
as B minus A. A tie remains a tie; a partial failure shows the successful draft
without claiming a winner. Both drafts remain in browser memory while switching
between analysis and comparison, and editing either draft marks an earlier
result stale.

`POST /api/comparisons` accepts a strict JSON body with `versionA` and
`versionB`, each 20–3,000 Unicode characters after trimming. It returns a
`complete`, `partial`, or `failed` outcome with a comparison ID. The endpoint
uses `Cache-Control: no-store` and does not persist or return the raw drafts.

## Evaluation API

`POST /api/evaluations` accepts a strict JSON object containing a LinkedIn
draft:

```json
{
  "content": "Your draft of 20 to 3,000 Unicode characters."
}
```

The endpoint returns an application evaluation ID and the complete,
deterministically scored `PostEvaluation`. It is stateless, sends
`Cache-Control: no-store`, and does not persist or log raw draft content.

Runtime configuration:

```text
TYPESAFE_API_KEY=required
TYPESAFE_DEFAULT_MODEL=jev-latest
TYPESAFE_TIMEOUT_MS=10000
```

Missing or invalid provider configuration becomes a controlled `503` response
and does not prevent the application from building.

## Targeted Improvement

After analysis, choose `Improve this post`, `Improve the hook`, `Improve the
ending`, or `Improve the weakest areas`. The proposed draft appears beside the
unchanged rubric result. You can copy it or explicitly use it in the editor;
the revised draft has no new score until you analyze it. Review facts and voice
before posting.

`POST /api/improvements` accepts a strict JSON object with `content`, `action`,
`evaluationId`, and the analyzer's `evaluation` result. The server checks the
current rubric identity and recomputes all scores from the submitted levels.
Because this endpoint is stateless, these checks establish internal consistency
but do not prove that an evaluation belongs to the supplied draft. No draft or
suggestion is stored by PostLens. The endpoint sends `Cache-Control: no-store`.

Generation uses a server-only OpenAI Responses API adapter with structured
output. Configure `OPENAI_API_KEY`, optionally
`OPENAI_IMPROVEMENT_MODEL` (default `gpt-4o-mini`) and
`OPENAI_IMPROVEMENT_TIMEOUT_MS` (default `20000`). Missing configuration returns
a controlled `503`. The model only proposes text; application code chooses
weakest dimensions and assembles paragraph edits, and the scoring engine never
uses generated output. The default model is a documented starting choice;
live latency and quality checks still require an API key.

### Jev technical validation

Copy `.env.example` to the ignored `.env` file and provide a
`TYPESAFE_API_KEY`. The scripts load `.env` automatically and intentionally
disable retries so failure rates remain observable:

```bash
pnpm jev:smoke
pnpm jev:experiment
pnpm jev:batching
```

`jev:experiment` evaluates 12 synthetic, project-owned fixtures in both
rubric-level and reason-code explanation modes. It records repeatability,
latency, failures, scores, probabilities, token usage, model identity, and
rubric identity under the private `content/experiments/` workspace. It never
writes raw draft text. `jev:batching` compares all dimension questions in one
request with parallel one-question requests across three fixtures and three
repetitions.

## Private Content Workspace

The `content/` directory is intentionally gitignored.

Codex should capture useful build discoveries there according to `AGENTS.md`.

## V1 Non-Goals

- browser extension
- LinkedIn scraping
- social automation
- auth
- billing
- scheduler
- analytics dashboard
- virality prediction
