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
