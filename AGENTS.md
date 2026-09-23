# AGENTS.md

## Project

This repository contains **PostLens**, an AI-assisted LinkedIn post evaluator.

Read before significant implementation:

- `docs/PRD.md`
- `docs/architecture.md`
- `docs/evaluation-methodology.md`

`docs/PRD.md` is the primary product specification.

If implementation decisions conflict with the PRD, prefer the PRD unless there is a clear technical reason not to. Document meaningful deviations.

---

## Core Product Principle

PostLens does NOT predict virality.

It evaluates a draft against a defined rubric.

Never introduce claims such as:

- 87% chance of going viral
- this post will outperform
- this will get more impressions
- guaranteed engagement

Acceptable language includes:

- Post Potential
- scores higher against the current rubric
- strong hook score
- high discussion potential

---

## Architecture Principle

Maintain a strict separation between:

```text
Evaluation
Scoring
Generation
```

Responsibilities:

```text
Jev / evaluator
→ bounded AI judgments

Application scoring engine
→ deterministic score calculation

Generative LLM
→ rewriting and suggestions
```

Never use a generative LLM to calculate deterministic scores.

Never ask an evaluator for one arbitrary "viral score."

---

## Provider Isolation

Application/domain code must not depend directly on Jev SDK types.

Use a domain abstraction:

```ts
interface PostEvaluator {
  evaluate(input: EvaluatePostInput): Promise<PostEvaluation>;
}
```

Jev should be implemented as an infrastructure adapter.

Future implementations may include:

- LLMPostEvaluator
- LocalPostEvaluator
- EnsemblePostEvaluator

---

## Evaluation Rubric

The initial rubric contains:

- Hook
- Specificity
- Novelty
- Clarity
- Discussion Potential
- Credibility
- Skimmability
- Emotional Resonance

Weights and score mappings must live in centralized configuration.

---

## Scoring

Scoring must be deterministic.

Given the same evaluation output, the final score must always be identical.

AI providers must never perform weighted score calculation.

Keep scoring logic pure, testable, and provider-independent.

---

## TypeScript

Use strict TypeScript.

Avoid `any` unless an external API forces temporary use at a boundary.

Prefer:

- discriminated unions
- readonly types
- explicit domain types
- Zod validation at external boundaries

Do not allow provider responses directly into domain logic without validation.

---

## Scope Discipline

The first launch does NOT require:

- authentication
- PostgreSQL
- billing
- teams
- social scheduling
- content calendars
- LinkedIn integration
- browser extension
- LinkedIn scraping
- analytics dashboard
- complex user profiles

Do not implement these unless the PRD explicitly moves them into the current phase.

---

## LinkedIn

Do NOT implement:

- LinkedIn DOM scraping
- LinkedIn feed injection
- LinkedIn automation
- automatic posting
- automatic commenting
- browser-extension integration with LinkedIn

V1 accepts content explicitly provided by the user.

---

## Privacy

Do not persist raw user post content by default.

If telemetry is added, prefer metadata such as:

- character count
- dimension scores
- overall score
- latency
- provider
- errors
- timestamp

Do not silently introduce draft persistence.

---

## Testing

Prioritize:

- scoring engine
- evaluation mapping
- schema validation
- Post Battle comparison
- error handling
- provider adapter behavior

Do not create meaningless tests solely to increase coverage.

---

## AI Evaluation Testing

AI behavior must be treated as probabilistic.

When evaluating Jev behavior:

- record inconsistencies
- test representative samples
- measure latency
- measure failures
- compare repeated evaluations
- preserve interesting failure cases

Do not rewrite tests merely to force AI output to appear correct.

---

## Benchmark Integrity

The project may benchmark Jev against generative LLM evaluators.

Never manipulate prompts, datasets, metrics, sample selection, or reporting to manufacture a preferred winner.

If Jev performs worse, preserve and report the result.

The objective is learning, not vendor promotion.

---

# Content Capture

This repository intentionally uses the build process to discover publishable technical content.

The private content workspace is:

```text
content/
```

This directory is excluded from Git.

During implementation, watch for observations that could become useful:

- technical blog posts
- LinkedIn posts
- X posts
- architecture explanations
- benchmark findings
- debugging stories
- launch material
- conference-talk ideas

## IMPORTANT: Content Discovery Rule

Whenever you encounter something genuinely interesting while building, append it to:

```text
content/ideas.md
```

Examples include:

- surprising Jev behavior
- counterintuitive evaluation result
- measurable latency difference
- interesting cost observation
- evaluator inconsistency
- useful TypeScript pattern
- architecture trade-off
- failed approach
- prompt design lesson
- rubric design problem
- scoring problem
- debugging discovery
- provider limitation
- unexpected benchmark result
- product insight
- something that looked correct but was wrong
- a technical question worth investigating publicly

Use this approximate format:

```md
## YYYY-MM-DD — Short idea title

### Observation
What happened?

### Why it is interesting
Why would another engineer care?

### Possible content angle
Potential post/article/demo angle.

### Evidence
Relevant benchmark, file, function, error, experiment, or implementation detail.
```

Do not fabricate findings.

Only record things actually observed during implementation or experimentation.

---

## Content Capture Must Not Block Development

Do NOT stop the current implementation task to fully write an article.

Instead:

1. capture the idea
2. preserve relevant evidence
3. continue implementation

Content creation happens separately.

---

## Build Log

When making a meaningful architectural or product decision, add a concise entry to:

```text
content/build-log.md
```

Use:

```md
## YYYY-MM-DD

### Change
What changed?

### Reason
Why?

### Alternatives considered
What else could have been done?

### Result
What happened?

### Content potential
Does this create a useful public lesson?
```

Do not log trivial code changes.

---

## Benchmark Notes

Benchmark-related observations belong in:

```text
content/experiments/
```

Preserve:

- test conditions
- model/provider
- dataset size
- date
- configuration
- latency
- cost where available
- failure rate
- observations

Benchmark results without test conditions are not useful.

---

## Content Quality

Do not create promotional claims without evidence.

Bad:

```text
Jev is much faster than LLMs.
```

Good:

```text
In experiment X, Jev had p50 latency of Y versus Z under these conditions.
```

Bad:

```text
PostLens predicts what will go viral.
```

Good:

```text
PostLens evaluates drafts against a structured content rubric.
```

---

## Documentation

Update documentation when changing:

- domain model
- evaluation methodology
- weights
- score mappings
- provider architecture
- user-visible scoring meaning

Do not allow documentation and implementation to diverge significantly.

---

## Code Quality

Prefer:

- small modules
- explicit naming
- boring architecture
- pure domain functions
- clear boundaries
- few dependencies

Avoid speculative abstractions.

An abstraction should exist because:

- there are multiple implementations, or
- a provider boundary needs isolation, or
- the domain concept is independently meaningful

Not because it might theoretically become useful someday.

---

## UI

Keep V1 visually simple.

Primary journey:

```text
Paste
→ Analyze
→ Understand
→ Improve or Compare
```

Avoid secondary navigation unless required.

---

## Error Experience

Never expose raw provider errors to users.

Log appropriate diagnostics while presenting useful application-level errors.

---

## Performance

Record external AI latency separately from total request latency when practical.

Avoid unnecessary sequential provider calls.

Where Jev supports evaluating multiple independent questions efficiently, prefer fewer round trips while preserving correctness.

---

## Implementation Order

Unless the current task explicitly says otherwise, prioritize work approximately in this order:

1. Domain model
2. Rubric
3. Scoring engine
4. Jev experiment / CLI
5. Evaluation tests
6. Analyzer API
7. Analyzer UI
8. Post Battle
9. Generative improvement
10. Benchmark tooling
11. Sharing
12. Launch polish

Do not build later-phase features before the evaluation foundation works.

---

## Definition of Useful Progress

A small validated experiment is better than a large speculative implementation.

When uncertain about an AI behavior:

```text
write an experiment
run it
measure it
document the result
then design around the evidence
```

Do not guess when the behavior can reasonably be measured.
