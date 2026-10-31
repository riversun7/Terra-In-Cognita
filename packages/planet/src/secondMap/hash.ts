// 2차맵 결과 해시 — FNV-1a 32비트(골든 해시 시험·캐시 확인용). 차례: 높이(i32 작은 끝 4바이트) → 물 높이 → 지표 → 엄폐.
// 기기 바이트 순서와 무관하게 값을 직접 쪼갠다. 차례·모양을 바꾸면 SECOND_MAP_GENERATOR_VERSION을 올린다.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mixInt32(state: number, values: Int32Array): number {
  let s = state;
  for (let k = 0; k < values.length; k++) {
    const value = values[k] ?? 0;
    s = Math.imul(s ^ (value & 0xff), FNV_PRIME) >>> 0;
    s = Math.imul(s ^ ((value >>> 8) & 0xff), FNV_PRIME) >>> 0;
    s = Math.imul(s ^ ((value >>> 16) & 0xff), FNV_PRIME) >>> 0;
    s = Math.imul(s ^ ((value >>> 24) & 0xff), FNV_PRIME) >>> 0;
  }
  return s;
}

function mixBytes(state: number, values: Uint8Array): number {
  let s = state;
  for (let k = 0; k < values.length; k++) s = Math.imul(s ^ (values[k] ?? 0), FNV_PRIME) >>> 0;
  return s;
}

export function hashSecondMap(
  heightsCm: Int32Array,
  waterLevelCm: Int32Array,
  surface: Uint8Array,
  cover: Uint8Array,
): string {
  let state = FNV_OFFSET;
  state = mixInt32(state, heightsCm);
  state = mixInt32(state, waterLevelCm);
  state = mixBytes(state, surface);
  state = mixBytes(state, cover);
  return state.toString(16).padStart(8, "0");
}
