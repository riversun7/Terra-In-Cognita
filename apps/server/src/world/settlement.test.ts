// 직무 멈춤 겹치기 시험(D-516 364) — 산출 구간(노동 계약 몫)에 건물 작업 구간을 겹친다(순수 함수)
import { describe, expect, it } from "vitest";
import { mergePauses } from "./settlement.ts";

const base = () => 1;
const contract = () => 2;
const show = (list: ReturnType<typeof mergePauses>) =>
  list.map((segment) => [segment.untilMs, segment.stock === null ? "x" : segment.stock()]);

describe("직무 멈춤 구간", () => {
  it("계약 몫이 없으면 기본 창고, 작업 구간만 산출 없음(null)", () => {
    expect(show(mergePauses(undefined, [{ fromMs: 30, untilMs: 60 }], 0, 100, base))).toEqual([
      [30, 1],
      [60, "x"],
      [100, 1],
    ]);
  });

  it("정산 구간 밖으로 걸친 작업은 잘라 겹치고, 계약 몫 구간과 섞인다", () => {
    const segments = [
      { untilMs: 50, stock: contract },
      { untilMs: 80, stock: null },
    ];
    expect(show(mergePauses(segments, [{ fromMs: -10, untilMs: 20 }], 0, 100, base))).toEqual([
      [20, "x"],
      [50, 2],
      [80, "x"],
      [100, 1],
    ]);
    // 작업이 정산 구간 전체를 덮으면 하나
    expect(show(mergePauses(segments, [{ fromMs: 0, untilMs: 500 }], 0, 100, base))).toEqual([[100, "x"]]);
  });

  it("구간 밖의 작업은 아무것도 바꾸지 않는다", () => {
    expect(show(mergePauses(undefined, [{ fromMs: 200, untilMs: 300 }], 0, 100, base))).toEqual([[100, 1]]);
  });
});
