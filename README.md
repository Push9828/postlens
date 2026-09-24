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

## Development

```bash
pnpm install
cp -n .env.example .env
```

### API keys

Edit `.env` and set `TYPESAFE_API_KEY` using a key from your TypeSafe account.
This enables analysis and draft comparison. Set `OPENAI_API_KEY` using a key
from your OpenAI account to enable post improvement. Both keys are needed to
use the complete flow; without OpenAI configured, analysis and comparison
still work, but improvement is unavailable. The keys are read on the server
and `.env` is gitignored. Never commit real API keys.

Start the local server after adding at least your TypeSafe key:

```bash
pnpm dev
```

Local development uses a process-local request quota; production uses a shared
Redis quota.

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
version of the draft. Analysis sends draft text to Jev for evaluation;
improvement also sends it to OpenAI to generate a revision. Review those
providers' data practices before submitting sensitive content.

An empty editor offers two project-written sample drafts. Each dimension can
show its rubric question and selected level. A current result can be downloaded
as a 1200×630 PNG score card. The image contains only rubric results and a
reminder that the score is not a performance prediction.

## Post Battle

Switch to `Compare drafts` on the root page to evaluate Version A and Version B
under the same evaluator configuration and rubric version. The result shows
both Post Potential scores, all eight dimensions, and signed differences defined
as B minus A. A tie remains a tie; a partial failure shows the successful draft
without claiming a winner. Both drafts remain in browser memory while switching
between analysis and comparison, and editing either draft marks an earlier
result stale.

After requesting an improvement, `Compare with original` places the analyzed
draft and suggested revision into Post Battle. You must submit the comparison
to get fresh rubric scores; the suggestion itself is never pre-scored.

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

## Production on Vercel

Deploy this Next.js app as a Vercel project. Configure the server-side variables
in `.env.example`, including a writable Upstash Redis REST URL/token and a
random `RATE_LIMIT_HASH_SECRET` of at least 32 characters. Keep the same hash
secret across deployments. The API fails closed if its production quota store
or trusted client address is unavailable. `/api/health` checks required
configuration without calling an AI provider; a ready response does not prove
that either provider is reachable.

The three provider-backed POST routes have byte limits and shared per-client
minute/hour quotas. Analysis counts as one unit, comparison as two, and
improvement as three (one generation and two evaluations). Requests over quota
return `429` and `Retry-After`;
oversized requests return `413`. Both responses use safe application errors.
Set provider-side spend caps before opening public traffic. Review Vercel and
Redis log retention and access because infrastructure logs can have different
capture defaults from the application's metadata-only events.

## Post Improvement

After analysis, choose `Improve post`. The generator receives all eight
dimension scores, explanations, weights, and rubric criteria. It can revise the
whole draft while preserving the author's facts and voice. PostLens evaluates
the original and proposed drafts together, then shows a suggestion only when
the paired check gains at least three points with at most one one-level
dimension regression.
If the candidate does not pass, it reports that no verified improvement was
found. A suggestion shows the paired check scores and dimension changes; the
existing analysis stays visible until you analyze again. Evaluator judgments
can vary between runs.
Review facts and voice before posting.

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
a controlled `503`. The model only proposes text. Jev evaluates the candidate
and original; deterministic application code calculates and checks the score.
The default model is a documented starting choice. Metadata-only verification
events capture acceptance, score changes, dimension changes, and latency so
quality can be assessed without storing draft text.

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
rubric identity in a local experiment output file. It never writes raw draft
text. `jev:batching` compares all dimension questions in one request with
parallel one-question requests across three fixtures and three repetitions.

## V1 Non-Goals

- browser extension
- LinkedIn scraping
- social automation
- auth
- billing
- scheduler
- analytics dashboard
- virality prediction
