// 편집기 입력 조작 순수 계산 시험 — 막대 범위·로그 눈금·걸음, 합이 정해진 묶음 다시 나누기, 표 묶음 바꾸기.
import { describe, expect, it } from "vitest";
import {
  bulkApply,
  clampInt,
  curveShape,
  dragFill,
  equalize,
  expectedIndex,
  moveBoundary,
  niceCeil,
  niceFloor,
  normalizeParts,
  pickedByColumn,
  posToValue,
  rectKeys,
  redistribute,
  roundSig2,
  scrubDelta,
  shareText,
  sliderRange,
  sparkHeights,
  spread,
  stepOf,
  stepWithMods,
  valueToPos,
} from "./contentEditorNumeric.ts";

const sum = (values: readonly number[]): number => values.reduce((acc, value) => acc + value, 0);

describe("자르기·걸음", () => {
  it("clampInt는 반올림한 뒤 범위로 자른다", () => {
    expect(clampInt(4.6, 0, 10)).toBe(5);
    expect(clampInt(-3, 0, 10)).toBe(0);
    expect(clampInt(99, 0, 10)).toBe(10);
  });

  it("niceCeil·niceFloor는 1·2·5 × 10^k", () => {
    expect([0, 1, 3, 7, 120, 2400].map(niceCeil)).toEqual([1, 1, 5, 10, 200, 5000]);
    expect([0, 1, 3, 7, 120, 2400].map(niceFloor)).toEqual([1, 1, 2, 5, 100, 2000]);
  });

  it("보조 키: Shift = 10배, Alt = 1", () => {
    expect(stepWithMods(50, {})).toBe(50);
    expect(stepWithMods(50, { shift: true })).toBe(500);
    expect(stepWithMods(50, { alt: true })).toBe(1);
    expect(stepWithMods(50, { alt: true, shift: true })).toBe(10);
  });

  it("끌어서 바꾸기: 4화소에 한 걸음(Alt는 8화소에 1), 방향을 지킨다", () => {
    expect(scrubDelta(3, 1, {})).toBe(0);
    expect(scrubDelta(40, 1, {})).toBe(10);
    expect(scrubDelta(-40, 5, {})).toBe(-50);
    expect(scrubDelta(40, 5, { shift: true })).toBe(500);
    expect(scrubDelta(40, 5, { alt: true })).toBe(5);
  });
});

describe("막대 범위", () => {
  it("폭 ≤ 10,000은 기술 범위 전체를 선형으로", () => {
    const range = sliderRange({ min: 0, max: 1000, value: 300 });
    expect(range).toEqual({ min: 0, max: 1000, scale: "linear", soft: false });
    expect(stepOf(range, 300)).toBe(1);
    expect(stepOf(sliderRange({ min: 0, max: 10_000 }), 0)).toBe(50);
  });

  it("0 이상이고 폭 ≤ 1,000만은 로그", () => {
    const range = sliderRange({ min: 0, max: 100_000, value: 1500 });
    expect(range.scale).toBe("log");
    expect(range.soft).toBe(false);
    // 걸음 = 지금 값의 1/20쯤(1·2·5)
    expect(stepOf(range, 1500)).toBe(50);
    expect(stepOf(range, 7)).toBe(1);
  });

  it("아주 넓은 범위는 값·팩 값의 4배 둘레 창", () => {
    const range = sliderRange({ min: 0, max: 2_147_483_647, value: 30, pack: 20 });
    expect(range).toEqual({ min: 0, max: 200, scale: "linear", soft: true });
    const big = sliderRange({ min: 0, max: 2_147_483_647, value: 600_000 });
    expect(big.max).toBe(5_000_000);
    expect(stepOf(big, 600_000)).toBe(20_000);
  });

  it("음수를 받는 넓은 범위는 0을 가운데 둔 창", () => {
    const range = sliderRange({ min: -1_000_000, max: 1_000_000, value: -40 });
    expect(range).toEqual({ min: -200, max: 200, scale: "linear", soft: true });
  });

  it("창이 기술 범위를 넘지 않는다", () => {
    const range = sliderRange({ min: 5, max: 20_000_000, value: 19_000_000 });
    expect(range.min).toBe(5);
    expect(range.max).toBe(20_000_000);
  });

  it("scale·soft를 주면 그대로 따른다", () => {
    expect(sliderRange({ min: 0, max: 100_000, scale: "linear" }).soft).toBe(true);
    expect(sliderRange({ min: 0, max: 500, scale: "log" }).scale).toBe("log");
    expect(sliderRange({ min: 0, max: 1_000_000, soft: [0, 300] })).toEqual({
      min: 0,
      max: 300,
      scale: "linear",
      soft: true,
    });
  });
});

describe("자리 ↔ 값", () => {
  it("선형: 양 끝과 가운데, 걸음에 맞춘다", () => {
    const range = sliderRange({ min: 0, max: 1000 });
    expect(posToValue(0, range)).toBe(0);
    expect(posToValue(1, range)).toBe(1000);
    expect(posToValue(0.5, range)).toBe(500);
    expect(valueToPos(250, range)).toBe(0.25);
    const stepped = sliderRange({ min: 0, max: 10_000 });
    expect(posToValue(0.123, stepped, 50)).toBe(1250);
    // 걸음에 안 맞는 끝 값도 낼 수 있다
    expect(posToValue(1, { min: 1, max: 9999, scale: "linear", soft: false }, 50)).toBe(9999);
  });

  it("로그: 값 → 자리 → 값이 유효 숫자 두 자리 안에서 돌아온다", () => {
    const range = sliderRange({ min: 0, max: 100_000 });
    expect(valueToPos(0, range)).toBe(0);
    expect(valueToPos(100_000, range)).toBe(1);
    for (const value of [0, 1, 7, 42, 150, 1500, 32_000, 100_000]) {
      expect(posToValue(valueToPos(value, range), range)).toBe(value);
    }
    // 가운데는 작은 값 쪽이다(넓은 범위를 한 막대로)
    expect(posToValue(0.5, range)).toBeLessThan(1000);
  });

  it("로그 값은 유효 숫자 두 자리 정수", () => {
    expect(roundSig2(99)).toBe(99);
    expect(roundSig2(1537)).toBe(1500);
    expect(roundSig2(86_499)).toBe(86_000);
  });

  it("범위 밖 값·자리는 끝에 붙는다", () => {
    const range = sliderRange({ min: 10, max: 110 });
    expect(valueToPos(5, range)).toBe(0);
    expect(valueToPos(500, range)).toBe(1);
    expect(posToValue(-1, range)).toBe(10);
    expect(posToValue(2, range)).toBe(110);
  });
});

describe("몫대로 나누기", () => {
  it("spread는 합이 amount인 정수 배열", () => {
    expect(spread(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(spread(1000, [950, 50])).toEqual([950, 50]);
    expect(spread(7, [0, 0])).toEqual([4, 3]);
    expect(spread(0, [5, 5])).toEqual([0, 0]);
    expect(sum(spread(1000, [3, 3, 3]))).toBe(1000);
  });

  it("normalizeParts: 잠그지 않은 칸만 맞춘다", () => {
    expect(normalizeParts([500, 300, 300], 1000)).toEqual([454, 273, 273]);
    expect(normalizeParts([500, 300, 300], 1000, new Set([0]))).toEqual([500, 250, 250]);
    // 잠근 합이 넘치면 잠금을 무시한다
    expect(sum(normalizeParts([900, 300, 100], 1000, new Set([0, 1])))).toBe(1000);
    expect(normalizeParts([0, 0, 0], 9)).toEqual([3, 3, 3]);
  });
});

describe("한 칸 바꾸기(합 그대로)", () => {
  const base = [600, 300, 100, 0];

  it("늘리면 나머지가 지금 몫대로 줄어든다", () => {
    const next = redistribute(base, 0, 800, 1000);
    expect(next).toEqual([800, 150, 50, 0]);
    expect(sum(next)).toBe(1000);
  });

  it("줄이면 나머지가 지금 몫대로 늘어난다(0인 칸은 0 그대로)", () => {
    expect(redistribute(base, 0, 200, 1000)).toEqual([200, 600, 200, 0]);
  });

  it("나머지가 모두 0이면 고르게 나눈다", () => {
    expect(redistribute([1000, 0, 0], 0, 700, 1000)).toEqual([700, 150, 150]);
  });

  it("잠근 칸은 움직이지 않고, 바꾸는 칸은 남은 양을 넘지 못한다", () => {
    const locked = new Set([1]);
    expect(redistribute(base, 0, 650, 1000, locked)).toEqual([650, 300, 50, 0]);
    expect(redistribute(base, 0, 999, 1000, locked)).toEqual([700, 300, 0, 0]);
  });

  it("나눌 칸이 없으면 그 칸은 남은 양으로 정해진다", () => {
    expect(redistribute([600, 400], 0, 100, 1000, new Set([1]))).toEqual([600, 400]);
  });

  it("음수·넘는 값은 자른다", () => {
    expect(redistribute(base, 2, -50, 1000)).toEqual([667, 333, 0, 0]);
    expect(redistribute(base, 2, 5000, 1000)).toEqual([0, 0, 1000, 0]);
  });

  it("같은 base에서 잇달아 셈해도 합이 1000이고 반올림이 쌓이지 않는다", () => {
    const start = [333, 333, 334, 0, 0];
    for (let value = 0; value <= 1000; value += 7) {
      const next = redistribute(start, 3, value, 1000);
      expect(sum(next)).toBe(1000);
      expect(next[3]).toBe(value);
      expect(next.every((part) => part >= 0 && Number.isInteger(part))).toBe(true);
    }
    // 처음 값으로 돌아오면 처음 묶음
    expect(redistribute(start, 3, 0, 1000)).toEqual(start);
  });

  it("합이 틀린 base도 total로 맞춘다", () => {
    expect(sum(redistribute([500, 300, 300], 0, 500, 1000))).toBe(1000);
  });
});

describe("경계 옮기기", () => {
  const base = [500, 300, 200, 0];

  it("오른쪽으로: 왼 칸이 늘고 오른 칸이 준다", () => {
    expect(moveBoundary(base, 0, 1, 100)).toEqual([600, 200, 200, 0]);
  });

  it("오른 칸이 0이 되면 그다음 칸을 민다", () => {
    expect(moveBoundary(base, 0, 1, 400)).toEqual([900, 0, 100, 0]);
    expect(moveBoundary(base, 0, 1, 9999)).toEqual([1000, 0, 0, 0]);
  });

  it("왼쪽으로: 오른 칸이 늘고 왼 칸부터 준다", () => {
    expect(moveBoundary(base, 1, 2, -350)).toEqual([450, 0, 550, 0]);
  });

  it("잠근 칸은 건너뛰고, 경계의 두 칸이 잠겼으면 그대로", () => {
    expect(moveBoundary(base, 0, 1, 400, new Set([2]))).toEqual([800, 0, 200, 0]);
    expect(moveBoundary(base, 0, 1, 100, new Set([0]))).toEqual(base);
    expect(moveBoundary(base, 0, 1, 100, new Set([1]))).toEqual(base);
  });

  it("합은 바뀌지 않는다", () => {
    for (const delta of [-999, -120, -1, 0, 1, 77, 999]) {
      expect(sum(moveBoundary(base, 1, 2, delta))).toBe(1000);
    }
  });
});

describe("균등·기대값·몫 글", () => {
  it("균등: 잠그지 않은 칸에 고르게(only가 있으면 그 안에서)", () => {
    expect(equalize([700, 200, 100], 1000)).toEqual([334, 333, 333]);
    expect(equalize([700, 200, 100], 1000, new Set([0]))).toEqual([700, 150, 150]);
    expect(equalize([700, 200, 100, 0], 1000, new Set(), new Set([0, 1]))).toEqual([500, 500, 0, 0]);
  });

  it("기대 차례 = Σ(차례 × 몫) ÷ 합", () => {
    expect(expectedIndex([1000, 0, 0])).toBe(0);
    expect(expectedIndex([500, 500])).toBe(0.5);
    expect(expectedIndex([0, 0, 1000])).toBe(2);
    expect(expectedIndex([0, 0])).toBeNull();
  });

  it("몫 글은 소수 한 자리 백분율", () => {
    expect(shareText(950, 1000)).toBe("95.0%");
    expect(shareText(5, 1000)).toBe("0.5%");
    expect(shareText(1, 3)).toBe("33.3%");
    expect(shareText(1, 0)).toBe("0%");
  });
});

describe("표 묶음 바꾸기", () => {
  const limits = { min: 0, max: 1000 };

  it("값으로·더하기·곱하기는 고른 칸만, 범위로 자른다", () => {
    expect(bulkApply([10, 20, 30], [0, 2], { kind: "set", value: 7 }, limits)).toEqual([7, 20, 7]);
    expect(bulkApply([10, 20, 30], [1], { kind: "add", value: -50 }, limits)).toEqual([10, 0, 30]);
    expect(bulkApply([10, 25, 900], [1, 2], { kind: "scale", percent: 150 }, limits)).toEqual([10, 38, 1000]);
  });

  it("선형 채우기: 첫 칸과 끝 칸 사이를 같은 차이로", () => {
    expect(bulkApply([100, 0, 0, 0, 500], [0, 1, 2, 3, 4], { kind: "linear" }, limits)).toEqual([
      100, 200, 300, 400, 500,
    ]);
    // 떨어진 칸도 고른 차례대로
    expect(bulkApply([0, 9, 9, 9, 30], [0, 2, 4], { kind: "linear" }, limits)).toEqual([0, 9, 15, 9, 30]);
  });

  it("등비 채우기: 같은 비율로(두 끝 양수), 아니면 선형", () => {
    expect(bulkApply([1, 0, 0, 1000], [0, 1, 2, 3], { kind: "geometric" }, limits)).toEqual([
      1, 10, 100, 1000,
    ]);
    expect(bulkApply([0, 0, 100], [0, 1, 2], { kind: "geometric" }, limits)).toEqual([0, 50, 100]);
  });

  it("한 칸만 고르면 채우기는 그대로", () => {
    expect(bulkApply([1, 2, 3], [1], { kind: "linear" }, limits)).toEqual([1, 2, 3]);
  });

  it("끌어 채우기: 처음 칸의 값을 사이 칸에", () => {
    expect(dragFill([5, 1, 2, 3], 0, 2)).toEqual([5, 5, 5, 3]);
    expect(dragFill([5, 1, 2, 3], 3, 1)).toEqual([5, 3, 3, 3]);
  });

  it("곡선 높이·모양", () => {
    expect(sparkHeights([0, 50, 100])).toEqual([0, 0.5, 1]);
    expect(sparkHeights([7, 7])).toEqual([1, 1]);
    expect(sparkHeights([0, 0])).toEqual([0, 0]);
    expect(sparkHeights([-10, 0, 10])).toEqual([0, 0.5, 1]);
    expect(curveShape([1, 2, 2, 5])).toBe("up");
    expect(curveShape([5, 2, 2, 1])).toBe("down");
    expect(curveShape([1, 3, 2])).toBe("mixed");
    expect(curveShape([4, 4])).toBe("flat");
  });

  it("고른 칸: 네모·열마다 줄", () => {
    expect(rectKeys([0, 1], [1, 2])).toEqual(["0:1", "0:2", "1:1", "1:2"]);
    expect(pickedByColumn(["2:1", "0:1", "1:3"])).toEqual(
      new Map([
        [1, [0, 2]],
        [3, [1]],
      ]),
    );
  });
});
