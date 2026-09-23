export const MIN_POST_CHARACTERS = 20;
export const MAX_POST_CHARACTERS = 3_000;

export function countUnicodeCodePoints(value: string): number {
  return Array.from(value).length;
}
