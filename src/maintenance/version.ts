/** Stable releases use canonical SemVer core numbers, bounded to exact JS integers. */
export function parseStableVersion(value: unknown): readonly [number, number, number] | undefined {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return undefined;
  const parts = value.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) return undefined;
  return [parts[0]!, parts[1]!, parts[2]!];
}

export function isStableVersion(value: unknown): value is string {
  return parseStableVersion(value) !== undefined;
}

export function compareVersions(a: string, b: string): number {
  const left = parseStableVersion(a), right = parseStableVersion(b);
  if (!left || !right) throw new Error("invalid stable version");
  for (const index of [0, 1, 2] as const) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}
