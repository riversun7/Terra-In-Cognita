import { describe, expect, it } from "vitest";
import { createFnv1a, hashCoords, mix32 } from "./hash.ts";

const fnvOfText = (text: string) => {
  const hash = createFnv1a();
  for (let i = 0; i < text.length; i++) hash.updateByte(text.charCodeAt(i));
  return hash.digest();
};

const fnvOfSafeInteger = (value: number) => {
  const hash = createFnv1a();
  hash.updateSafeInteger(value);
  return hash.digest();
};

describe("FNV-1a 32비트", () => {
  it("표준 시험 값과 같다", () => {
    expect(fnvOfText("")).toBe("811c9dc5");
    expect(fnvOfText("a")).toBe("e40c292c");
    expect(fnvOfText("foobar")).toBe("bf9cf968");
  });

  it("32비트 값은 작은 끝 바이트 순서다", () => {
    const words = createFnv1a();
    words.update32(0x64636261); // "abcd"
    expect(words.digest()).toBe(fnvOfText("abcd"));
  });

  it("안전 정수는 음수·큰 수를 구별한다", () => {
    const values = [0, 1, -1, 2 ** 32, 2 ** 32 + 1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
    expect(new Set(values.map(fnvOfSafeInteger)).size).toBe(values.length);
    expect(() => fnvOfSafeInteger(0.5)).toThrow(RangeError);
  });
});

describe("정수 섞기", () => {
  it("결정적이고 32비트 부호 없는 정수를 낸다", () => {
    for (let i = 0; i < 1000; i++) {
      const value = hashCoords(7, i, -i);
      expect(value).toBe(hashCoords(7, i, -i));
      expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
    }
    expect(mix32(0)).toBe(0);
  });

  it("이웃 좌표·시드끼리 값이 겹치지 않는다", () => {
    const seen = new Set<number>();
    for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) seen.add(hashCoords(1, x, y));
    for (let seed = 2; seed < 66; seed++) seen.add(hashCoords(seed, 0, 0));
    expect(seen.size).toBe(64 * 64 + 64);
  });
});
