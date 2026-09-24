export function introducesFactualAnchors(
  original: string,
  revised: string,
): boolean {
  const anchors = (content: string) =>
    new Set(
      (content.match(/https?:\/\/[^\s)]+|\b\d[\d,.]*%?\b/giu) ?? []).map(
        (value) => value.toLowerCase(),
      ),
    );
  const existing = anchors(original);
  return [...anchors(revised)].some((anchor) => !existing.has(anchor));
}
