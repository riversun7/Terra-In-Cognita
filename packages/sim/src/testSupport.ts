// 시험 도우미 — 큰 타입 배열 비교(vitest toEqual은 6만 칸 배열에서 느리다)

/** 두 배열이 처음 다른 칸 번호. 길이가 다르면 짧은 쪽 길이, 같으면 -1 */
export function firstDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : length;
}
