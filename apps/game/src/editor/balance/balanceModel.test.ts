// 밸런스 화면 순수 코드 시험 — 담은 칸·칸 상태·입력 글·약한 1차·오류 키
import type { BalanceDuelRow, BalanceRowView } from "@terra/shared/balance";
import { describe, expect, it } from "vitest";
import {
  balanceErrorOf,
  cellState,
  editsOf,
  formatDelta,
  marginText,
  minutesSeconds,
  parseCellInput,
  parsePrimaries,
  percentText,
  prunePending,
  settingsProblem,
  shownValue,
  stageCell,
  weakPrimaries,
} from "./balanceModel.ts";

const hp: BalanceRowView = {
  id: "hp",
  name: { ko: "HP", en: "HP" },
  shape: "quantity",
  cells: [
    { field: "vit", pack: 3000, value: 3000, override: null },
    { field: "str", pack: 1500, value: 1800, override: null },
  ],
};
const [vit, str] = hp.cells;
if (!vit || !str) throw new Error("cells");

describe("담은 칸", () => {
  it("실효 값과 같으면 담지 않고, 팩 값이면 되돌리기(null)로 담는다", () => {
    let pending = stageCell(new Map(), hp, vit, 3500);
    expect([...pending]).toEqual([["hp.vit", 3500]]);
    expect(cellState(hp, vit, pending)).toBe("staged");
    expect(shownValue(hp, vit, pending)).toBe(3500);
    pending = stageCell(pending, hp, vit, 3000);
    expect(pending.size).toBe(0);
    // 덮어쓰기(1800)가 있는 칸을 팩 값으로
    pending = stageCell(pending, hp, str, 1500);
    expect([...pending]).toEqual([["hp.str", null]]);
    expect(shownValue(hp, str, pending)).toBe(1500);
    expect(cellState(hp, str, new Map())).toBe("override");
    expect(cellState(hp, vit, new Map())).toBe("pack");
    expect(editsOf(pending)).toEqual([{ key: "hp.str", value: null }]);
  });

  it("새 표를 받으면 바뀔 것이 없어진 칸·표에 없는 칸은 뺀다", () => {
    const pending = new Map<string, number | null>([
      ["hp.vit", 3000],
      ["hp.str", 2000],
      ["gone.str", 1],
    ]);
    expect([...prunePending(pending, [hp])]).toEqual([["hp.str", 2000]]);
  });

  it("입력 글: 정수·칸 범위만(쉼표 허용)", () => {
    expect(parseCellInput("1,500", "str")).toBe(1500);
    expect(parseCellInput("-20", "str")).toBe(-20);
    expect(parseCellInput("1.5", "str")).toBeNull();
    expect(parseCellInput("100001", "str")).toBeNull();
    expect(parseCellInput("1001", "cap")).toBeNull();
    expect(parseCellInput("0", "half")).toBeNull();
    expect(parseCellInput("", "base")).toBeNull();
  });

  it("1차 입력 6칸: 하나라도 틀리면 null", () => {
    const text = { str: "10", vit: "10", int: "10", wis: "10", dex: "10", agi: "10" };
    expect(parsePrimaries(text)).toEqual({ str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 });
    expect(parsePrimaries({ ...text, agi: "" })).toBeNull();
    expect(parsePrimaries({ ...text, agi: "10001" })).toBeNull();
    expect(parsePrimaries({ ...text, agi: "-1" })).toBeNull();
  });
});

const row = (primary: BalanceDuelRow["primary"], scorePm: number): BalanceDuelRow => ({
  primary,
  runs: 10,
  wins: 0,
  losses: 0,
  timeoutWins: 0,
  timeoutLosses: 0,
  timeoutEven: 10,
  avgMs: 0,
  scorePm,
  marginPm: 0,
});

describe("대결·숫자", () => {
  it("설정 상한: 짝수 판 수, 판 수 × 제한 ≤ 2400초", () => {
    expect(settingsProblem({ runs: 10, limitSec: 120, count: 1 })).toBeNull();
    expect(settingsProblem({ runs: 40, limitSec: 120, count: 1 })).toBe("budget");
    expect(settingsProblem({ runs: 5, limitSec: 120, count: 1 })).toBe("runs");
  });

  it("약한 1차 = +10 승률 ≤ 50%", () => {
    expect(weakPrimaries([row("str", 700), row("int", 500), row("wis", 420)])).toEqual(["int", "wis"]);
  });

  it("숫자 글", () => {
    expect(formatDelta(15, "ko")).toBe("+15");
    expect(formatDelta(-1200, "en")).toBe("−1,200");
    expect(formatDelta(0, "en")).toBe("0");
    expect(percentText(625, "en")).toBe("62.5");
    expect(marginText(123, "en")).toBe("+12.3");
    expect(marginText(-40, "ko")).toBe("−4");
    expect(minutesSeconds(125_400)).toEqual({ minutes: 2, seconds: 5 });
  });

  it("오류 키: 밸런스 까닭·설정 칸 까닭·코드", () => {
    expect(balanceErrorOf({ data: { code: "TOO_MANY_REQUESTS", reason: "busy" } }).key).toBe("busy");
    expect(
      balanceErrorOf({
        data: { code: "BAD_REQUEST", reason: "rules_conflict", details: ["stat_primary_unused", "x"] },
      }),
    ).toEqual({ key: "rules_conflict", problems: ["stat_primary_unused"], sessionEnded: false });
    expect(balanceErrorOf({ data: { code: "UNAUTHORIZED" } })).toMatchObject({ sessionEnded: true });
    expect(balanceErrorOf(new Error("offline")).key).toBe("network");
  });
});
