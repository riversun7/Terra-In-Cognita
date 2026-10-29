// 생성 결과 해시 — FNV-1a 32비트를 정해진 바이트 순서로 (골든 해시 시험·캐시 확인용, PLAN 5.5)
// 바이트 순서: 면 레벨 1바이트 → elevationM(Int16, 작은 끝 2바이트씩) → biome → temperatureC(2의 보수 1바이트)
// → precipitationMm(Uint16, 작은 끝) → humidity → water → river → forest. 칸은 모두 칸 번호 순서.
// 기기의 바이트 순서와 무관하게 값을 직접 쪼갠다. 순서를 바꾸면 모든 해시가 바뀐다(GENERATOR_VERSION).
import type { SurfaceFields } from "./surface.ts";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 바이트 배열(값 & 0xff만 쓴다)을 이어서 섞는다 */
function mixBytes(state: number, values: ArrayLike<number>): number {
  let s = state;
  for (let k = 0; k < values.length; k++) s = Math.imul(s ^ ((values[k] ?? 0) & 0xff), FNV_PRIME) >>> 0;
  return s;
}

/** 16비트 값 배열을 작은 끝 2바이트씩 */
function mixWords(state: number, values: ArrayLike<number>): number {
  let s = state;
  for (let k = 0; k < values.length; k++) {
    const value = values[k] ?? 0;
    s = Math.imul(s ^ (value & 0xff), FNV_PRIME) >>> 0;
    s = Math.imul(s ^ ((value >> 8) & 0xff), FNV_PRIME) >>> 0;
  }
  return s;
}

export function hashPlanetFields(faceLevel: number, fields: SurfaceFields): string {
  let state = Math.imul(FNV_OFFSET ^ (faceLevel & 0xff), FNV_PRIME) >>> 0;
  state = mixWords(state, fields.elevationM);
  state = mixBytes(state, fields.biome);
  state = mixBytes(state, fields.temperatureC);
  state = mixWords(state, fields.precipitationMm);
  state = mixBytes(state, fields.humidity);
  state = mixBytes(state, fields.water);
  state = mixBytes(state, fields.river);
  state = mixBytes(state, fields.forest);
  return state.toString(16).padStart(8, "0");
}
