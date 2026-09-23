export interface EvaluationFixture {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly content: string;
}

export const JEV_EVALUATION_FIXTURES = [
  {
    id: "strong-educational",
    category: "educational",
    description: "Concrete technical lesson with a clear opening and tradeoff.",
    content: `I deleted 40% of our caching code last week.

The surprising result: p95 latency improved by 18ms.

We had cached objects at three layers. Each layer was individually reasonable, but invalidation caused repeated database reads whenever one layer expired before the others.

We kept the request-level cache, removed the repository cache, and added one measured query index.

The lesson wasn't “caching is bad.” It was that every cache needs an owner, a measured benefit, and an invalidation story.

Where has removing an optimization made your system faster?`,
  },
  {
    id: "generic-educational",
    category: "educational",
    description: "Generic advice without examples or supporting detail.",
    content: `Software development is always changing.

To succeed, developers need to keep learning, communicate well, and focus on writing clean code.

Consistency is the key to growth. Never stop improving and always believe in yourself.`,
  },
  {
    id: "concrete-technical-story",
    category: "story",
    description: "Technical story with tension, evidence, and a scoped lesson.",
    content: `At 2:17 a.m. our queue was growing by 9,000 jobs a minute.

The workers were healthy. CPU was below 30%. The database looked normal.

The failure was a six-line retry helper. A timeout retried immediately, then each retry scheduled two more attempts.

We capped retries, added jitter, and drained the queue in 43 minutes.

I now review retry code as capacity code, not error-handling code.`,
  },
  {
    id: "vague-motivational-story",
    category: "story",
    description: "Motivational narrative with no concrete event or lesson.",
    content: `I almost gave up.

Things were hard and nobody believed in the vision.

But I kept going, worked harder, and proved that persistence always wins.

If you're struggling today, remember that your breakthrough may be closer than you think.`,
  },
  {
    id: "evidence-backed-opinion",
    category: "opinion",
    description: "Scoped opinion supported by observed engineering outcomes.",
    content: `Most teams don't need a microservice for every domain boundary.

On our 11-person product team, moving three services back into one deployable reduced failed releases from seven in a quarter to two. We also removed two queues and one duplicated authorization layer.

That doesn't make monoliths universally better. It means deployment independence should be earned by an operational need, not copied from an architecture diagram.`,
  },
  {
    id: "empty-contrarian-opinion",
    category: "opinion",
    description: "Contrarian claim without reasoning or evidence.",
    content: `Unpopular opinion: clean code is a waste of time.

The best engineers move fast and don't worry about rules.

Most best practices are just excuses created by people who can't ship. Agree?`,
  },
  {
    id: "concrete-case-study",
    category: "case-study",
    description:
      "Case study with baseline, intervention, and measured outcome.",
    content: `Our onboarding flow converted 31% of invited developers.

Session recordings showed that users reached the API-key screen, opened another tab, and often never returned.

We replaced the key-first flow with a sandbox request using a temporary credential. In a two-week test across 1,842 invitations, completion rose to 46%.

The permanent key still matters. We simply moved that decision until after users saw one successful response.`,
  },
  {
    id: "unsupported-case-study",
    category: "case-study",
    description: "Claims dramatic results without conditions or evidence.",
    content: `We changed one button and transformed our entire business.

Conversions skyrocketed, customers loved it, and revenue exploded.

This proves that small design changes always create massive growth.`,
  },
  {
    id: "specific-build-in-public",
    category: "build-in-public",
    description:
      "Specific progress update including a failure and next decision.",
    content: `Week 3 of building PostLens:

• 12 synthetic drafts evaluated
• 39 deterministic scoring tests passing
• 1 architecture mistake caught before the API layer

The mistake was letting evaluator output include a weighted score. That would have made provider behavior and application logic impossible to test independently.

Next I’m measuring whether eight rubric questions are more stable in one Jev request or separate calls.`,
  },
  {
    id: "vague-announcement",
    category: "announcement",
    description: "Announcement without useful product or audience detail.",
    content: `Big news!

We've been working on something incredible behind the scenes and can't wait to share it.

This changes everything. Stay tuned!`,
  },
  {
    id: "natural-discussion",
    category: "opinion",
    description: "Invites discussion through a real professional tradeoff.",
    content: `Code review speed and code review depth pull in opposite directions.

Requiring every reviewer to understand every changed line improved defect detection on our team, but it also pushed median review time beyond 19 hours.

We now label changes by risk: routine changes need one reviewer; authorization and billing changes need a written failure analysis and two reviewers.

How does your team change review depth based on risk?`,
  },
  {
    id: "engagement-bait",
    category: "other",
    description: "Interaction prompts without meaningful discussion content.",
    content: `Agree or disagree?

Leadership is everything.

Comment YES if you agree.
Like if you've had a great manager.
Repost so more people can see this.`,
  },
] as const satisfies readonly EvaluationFixture[];

export function getEvaluationFixture(
  id: string,
): EvaluationFixture | undefined {
  return JEV_EVALUATION_FIXTURES.find((fixture) => fixture.id === id);
}
