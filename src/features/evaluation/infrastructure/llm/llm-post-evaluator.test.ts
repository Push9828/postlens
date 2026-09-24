import { describe, expect, it, vi } from 'vitest';
import { EVALUATION_DIMENSIONS } from '../../domain/evaluation.types';
import { scorePost } from '../../domain/scoring';
import { LLMPostEvaluator } from './llm-post-evaluator';

const output = {
  dimensions: Object.fromEntries(
    EVALUATION_DIMENSIONS.map((dimension) => [
      dimension,
      { level: 2, explanation: `${dimension} has a clear middle level.` },
    ])
  ),
  contentType: 'educational',
};
function response(value: unknown) {
  return Response.json({
    status: 'completed',
    model: 'gpt-4o-mini-2024-07-18',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(value) }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  });
}

describe('LLMPostEvaluator', () => {
  it('requests bounded structured judgments and leaves scoring to application code', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => response(output));
    const diagnostics = vi.fn();
    const evaluator = new LLMPostEvaluator({
      apiKey: 'fake',
      model: 'gpt-4o-mini-2024-07-18',
      timeoutMs: 1000,
      fetcher: fetcher as typeof fetch,
      onDiagnostics: diagnostics,
    });
    const judgments = await evaluator.evaluate({
      content: 'A synthetic post with a clear point.',
    });
    expect(judgments.dimensions.hook.level).toBe(2);
    expect('overallScore' in judgments).toBe(false);
    expect(scorePost(judgments).overallScore).toBe(50);
    const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.instructions).toContain('Do not calculate weighted or overall scores');
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 100, outputTokens: 50 })
    );
  });

  it('rejects malformed provider levels and maps busy responses safely', async () => {
    const invalid = new LLMPostEvaluator({
      apiKey: 'fake',
      model: 'fixed',
      timeoutMs: 1000,
      fetcher: async () =>
        response({
          ...output,
          dimensions: {
            ...output.dimensions,
            hook: { level: 7, explanation: 'bad' },
          },
        }),
    });
    await expect(invalid.evaluate({ content: 'A synthetic post.' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
    const busy = new LLMPostEvaluator({
      apiKey: 'fake',
      model: 'fixed',
      timeoutMs: 1000,
      fetcher: async () => new Response('private provider body', { status: 429 }),
    });
    await expect(busy.evaluate({ content: 'A synthetic post.' })).rejects.toMatchObject({
      kind: 'rate-limit',
    });
  });
});
