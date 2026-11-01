// 밸런스 프리셋 순수 코드 시험 — 같은지(이름은 보지 않음), 저장할 값, 이름 검사, 새로 생긴 ID, 고르기 칸 목록
import type { BalancePresetView } from "@terra/shared/balance";
import { describe, expect, it } from "vitest";
import {
  addedPresetId,
  optionsWith,
  presetMatches,
  presetName,
  presetNameValid,
  presetValuesFrom,
  presetValuesOf,
} from "./balancePresetModel.ts";

const flat = (value: number) => ({ str: value, vit: value, int: value, wis: value, dex: value, agi: value });
const preset = (id: string, extra: Partial<BalancePresetView> = {}): BalancePresetView => ({
  id,
  name: { ko: "새 사이보그", en: "New cyborg" },
  primaries: flat(10),
  weapon: "unarmed",
  count: 1,
  runs: 10,
  limitSec: 120,
  source: "pack",
  version: 0,
  updatedBy: null,
  updatedAt: null,
  ...extra,
});
const form = { primaries: flat(10), weapon: "unarmed", count: 1, runs: 10, limitSec: 120 };

describe("프리셋 순수 코드", () => {
  it("같은지: 1차·무기·인원·판 수·제한이 모두 같아야 한다(이름은 보지 않는다), 1차가 틀리면 다르다", () => {
    expect(presetMatches(preset("a", { name: { ko: "딴 이름", en: "Other" } }), form)).toBe(true);
    expect(presetMatches(preset("a"), { ...form, primaries: { ...flat(10), agi: 11 } })).toBe(false);
    expect(presetMatches(preset("a"), { ...form, weapon: "test_sword" })).toBe(false);
    expect(presetMatches(preset("a"), { ...form, runs: 20 })).toBe(false);
    expect(presetMatches(preset("a"), { ...form, primaries: null })).toBe(false);
  });

  it("저장할 값 = 이름 + 기준 유닛 칸(1차가 틀리면 null)", () => {
    expect(presetValuesFrom({ ko: "가", en: "A" }, { ...form, count: 2 })).toEqual({
      name: { ko: "가", en: "A" },
      primaries: flat(10),
      weapon: "unarmed",
      count: 2,
      runs: 10,
      limitSec: 120,
    });
    expect(presetValuesFrom({ ko: "가", en: "A" }, { ...form, primaries: null })).toBeNull();
  });

  it("화면 모양에서 값 칸만 뽑는다(ID·출처·판·바꾼 사람은 빠진다: 서버 입력이 모르는 칸을 받지 않음)", () => {
    expect(Object.keys(presetValuesOf(preset("a", { source: "edited", version: 3 }))).toSorted()).toEqual([
      "count",
      "limitSec",
      "name",
      "primaries",
      "runs",
      "weapon",
    ]);
  });

  it("이름은 ko·en 모두 1~40자(앞뒤 빈칸 뺌)", () => {
    expect(presetNameValid({ ko: " 가 ", en: "A" })).toBe(true);
    expect(presetNameValid({ ko: "  ", en: "A" })).toBe(false);
    expect(presetNameValid({ ko: "가", en: "x".repeat(41) })).toBe(false);
  });

  it("새로 생긴 ID, 지금 언어 이름, 고르기 칸에 없는 값을 끼워 넣기", () => {
    expect(addedPresetId([preset("a")], [preset("a"), preset("dev_0123456789ab")])).toBe("dev_0123456789ab");
    expect(addedPresetId([preset("a")], [preset("a")])).toBeNull();
    expect(presetName(preset("a"), "en")).toBe("New cyborg");
    expect(presetName(preset("a"), "ko")).toBe("새 사이보그");
    expect(optionsWith([4, 6, 10], 8)).toEqual([4, 6, 8, 10]);
    expect(optionsWith([4, 6, 10], 6)).toEqual([4, 6, 10]);
  });
});
