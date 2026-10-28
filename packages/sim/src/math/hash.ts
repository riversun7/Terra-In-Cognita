// 결정적 정수 해시 — Math.imul·비트 연산만 쓴다(엔진과 무관하게 같은 값).
// - createFnv1a: 결과 비교용 해시(골든 해시, 생성 결과 확인). 바이트 순서를 직접 정해 기기와 무관하다.
// - mix32·hashCoords: 노이즈용 정수 섞기(임시 지형). 나중에 @terra/shared로 옮길 수 있다.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const TWO_POW_32 = 0x1_0000_0000;

export interface Fnv1a {
  /** 바이트 하나(0~255) */
  updateByte(byte: number): void;
  /** 32비트 정수 하나를 작은 끝(little-endian) 4바이트로 */
  update32(value: number): void;
  /** 안전 정수(음수 포함)를 위·아래 32비트로 나눠 8바이트로 */
  updateSafeInteger(value: number): void;
  /** 짧은 ASCII 문자열(상태 이름 등). 길이를 먼저 넣어 이어 붙인 값끼리 섞이지 않게 한다 */
  updateText(text: string): void;
  /** 지금까지의 해시(16진수 8자리) */
  digest(): string;
}

/** FNV-1a 32비트 */
export function createFnv1a(): Fnv1a {
  let state = FNV_OFFSET;
  const updateByte = (byte: number): void => {
    state = Math.imul(state ^ (byte & 0xff), FNV_PRIME) >>> 0;
  };
  const update32 = (value: number): void => {
    updateByte(value);
    updateByte(value >>> 8);
    updateByte(value >>> 16);
    updateByte(value >>> 24);
  };
  return {
    updateByte,
    update32,
    updateSafeInteger(value) {
      if (!Number.isSafeInteger(value)) throw new RangeError(`not a safe integer: ${value}`);
      const high = Math.floor(value / TWO_POW_32);
      update32(value - high * TWO_POW_32);
      update32(high);
    },
    updateText(text) {
      update32(text.length);
      for (let i = 0; i < text.length; i++) updateByte(text.charCodeAt(i));
    },
    digest: () => state.toString(16).padStart(8, "0"),
  };
}

/**
 * 32비트 정수 섞기. 결과는 0 이상 2^32 미만.
 * 구성(시프트 16·15·16, 곱 0x7feb352d·0x846ca68b)은 Chris Wellons의 lowbias32다
 * (https://github.com/skeeto/hash-prospector @ 396dbe235c94, Unlicense, THIRD_PARTY_NOTICES.md).
 */
export function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** 시드와 정수 좌표 두 개로 32비트 해시(격자 노이즈의 꼭짓점 값) */
export function hashCoords(seed: number, x: number, y: number): number {
  return mix32(mix32(mix32(seed) ^ Math.imul(x, 0x27d4eb2d)) ^ Math.imul(y, 0x165667b1));
}
