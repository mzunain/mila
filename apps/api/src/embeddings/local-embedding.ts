export const LOCAL_EMBEDDING_DIMENSIONS = 64;

export function embedTextLocally(text: string): number[] {
  const vector = new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2);

  for (const token of tokens) {
    const index = positiveHash(token) % LOCAL_EMBEDDING_DIMENSIONS;
    vector[index] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

export function toPgVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => Number(value.toFixed(6))).join(',')}]`;
}

function positiveHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
