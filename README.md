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
pnpm build
```

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
