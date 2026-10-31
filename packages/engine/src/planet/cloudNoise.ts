// 1차맵 구름 노이즈 원천 — 순수 함수(시험 대상, three.js를 쓰지 않는다). ADR 2026-10-29-primary-map-sky 6절.
// - 3D 노이즈 텍스처의 격자값(64³ R8, 되풀이)을 행성 시드로 만든다. createRng(mulberry32, 정수 연산)라 모든 기기에서 같다.
//   셰이더는 칸 안 위치를 smoothstep으로 바꾼 자리를 하드웨어 삼선형으로 읽는다(값 노이즈 한 번 = 텍스처 읽기 한 번).
// - 날씨 창(실제 3시간): 창 번호 = 기원에서 잰 정수 ms ÷ 창 길이(내림, 64비트 JS 수 — 32비트 uniform으로 넘기지 않는다).
//   창 번호 → createRng → 노이즈를 읽는 자리 오프셋. 창 안에서는 구름이 그대로다.
import { createRng } from "@terra/shared";

/** 노이즈 격자 한 변(칸 수). 64³ R8 = 256KiB */
export const CLOUD_NOISE_SIZE = 64;
/** [임시] 날씨 창 길이(ms, 실제 3시간 = 행성의 3일, 기획 질문 17) */
export const WEATHER_WINDOW_MS = 3 * 3_600_000;

/** 격자값(size³, x가 가장 빨리 바뀐다). 32비트 난수의 위 8비트 */
export function cloudNoiseLattice(seed: number, size = CLOUD_NOISE_SIZE): Uint8Array {
  const rng = createRng(seed);
  const data = new Uint8Array(size * size * size);
  for (let i = 0; i < data.length; i++) data[i] = rng.nextU32() >>> 24;
  return data;
}

/** 날씨 창 번호(기원 앞이면 음수). msSinceEpoch는 공용 달력의 정수 ms */
export function weatherWindowIndex(msSinceEpoch: number): number {
  return Math.floor(msSinceEpoch / WEATHER_WINDOW_MS);
}

/** 행성 시드·창 번호 → 노이즈 공간 오프셋(각 축 0 이상 size 미만). 되풀이 텍스처라 size를 넘을 일이 없다 */
export function weatherOffset(
  seed: number,
  windowIndex: number,
  size = CLOUD_NOISE_SIZE,
): readonly [number, number, number] {
  // 창 번호를 시드에 섞는다(황금비 곱, 32비트). 같은 시드·창이면 늘 같다
  const rng = createRng((seed ^ Math.imul(windowIndex | 0, 0x9e3779b1)) >>> 0);
  const unit = (): number => (rng.nextU32() / 0x1_0000_0000) * size;
  return [unit(), unit(), unit()];
}

/**
 * 목록 정보의 정의 해시(64자리 16진수) 앞 8자리 → 구름 시드(u32). 정의를 고치면 지형도 바뀌므로 구름도 다시 섞인다(의도).
 * 해시가 틀리면 0
 */
export function skySeedOfHash(definitionHash: string): number {
  const head = definitionHash.slice(0, 8);
  return /^[0-9a-f]{8}$/i.test(head) ? Number.parseInt(head, 16) >>> 0 : 0;
}
