// 랜덤 국가 프리셋 후보 시험(겹치지 않음·결정적·부분 다시 굴리기) — docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)". 값은 가짜다.
import { describe, expect, it } from "vitest";
import { isFactionColor, isFactionShort, isCurrencyTicker } from "./factionProfile.ts";
import { NAME_LENGTH } from "./nameGen.ts";
import type { NationPresetJson } from "./nationEditor.ts";
import {
  NATION_RANDOM_PARTS,
  RANDOM_COLORS,
  colorDistance,
  distinctColor,
  isCreatedNation,
  randomNation,
  randomSeedsOf,
  rerollPart,
} from "./nationRandom.ts";
import { isPowerTier } from "./nationTier.ts";

const base: NationPresetJson = {
  id: "placeholder_nation_01",
  name: { ko: "메리데일", en: "Meridale" },
  shortName: "MRD",
  color: "#c0392b",
  currency: { code: "placeholder_cur_01", name: { ko: "올더", en: "Alder" }, symbol: "Ⱥ", ticker: "ALD" },
  tradeTaxBp: 200,
  enabled: true,
};

const only = (values: readonly (string | undefined)[]) => new Set(values).size === values.length;

describe("randomNation", () => {
  it("같은 시드·같은 바탕이면 같은 후보, 다른 시드면 다른 이름", () => {
    const a = randomNation(randomSeedsOf(7), { existing: [base] });
    expect(randomNation(randomSeedsOf(7), { existing: [base] })).toEqual(a);
    expect(randomNation(randomSeedsOf(8), { existing: [base] }).name.en).not.toBe(a.name.en);
  });

  it("후보는 팩 프리셋 한 줄을 다 채운다: 새 ID·화폐 코드, 이름 길이 규칙, 약어·색·등급·마크·도시·사람 이름", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const entry = randomNation(randomSeedsOf(seed), { existing: [base] });
      expect(isCreatedNation(entry)).toBe(true);
      expect(entry.id).toMatch(/^nation_[a-z0-9]+_1$/);
      for (const name of [entry.name, entry.currency.name]) {
        expect(name.ko.length).toBeGreaterThanOrEqual(NAME_LENGTH.koMin);
        expect(name.ko.length).toBeLessThanOrEqual(NAME_LENGTH.koMax);
        expect(name.en.length).toBeGreaterThanOrEqual(NAME_LENGTH.enMin);
        expect(name.en.length).toBeLessThanOrEqual(NAME_LENGTH.enMax);
      }
      expect(isFactionShort(entry.shortName ?? "")).toBe(true);
      expect(isCurrencyTicker(entry.currency.ticker ?? "")).toBe(true);
      expect(entry.shortName).not.toBe("MRD");
      expect(entry.currency.ticker).not.toBe("ALD");
      expect(entry.currency.ticker).not.toBe(entry.shortName);
      expect(isFactionColor(entry.color ?? "")).toBe(true);
      expect(isPowerTier(entry.powerTier)).toBe(true);
      expect(entry.emblem).toBeDefined();
      expect(entry.cityNames?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(new Set(entry.cityNames).size).toBe(entry.cityNames?.length);
      expect(entry.humanNames?.given.length ?? 0).toBeGreaterThanOrEqual(6);
      expect(entry.leaderName?.en).toMatch(/ /);
      expect(entry.enabled).toBe(true);
    }
  });

  it("잇달아 더해도 ID·화폐 코드·약어·화폐 약어가 하나씩이고 색이 서로 구별된다", () => {
    const list: NationPresetJson[] = [base];
    for (let seed = 1; seed <= 12; seed++)
      list.push(randomNation(randomSeedsOf(seed * 31), { existing: list }));
    expect(only(list.map((entry) => entry.id))).toBe(true);
    expect(only(list.map((entry) => entry.currency.code))).toBe(true);
    expect(only(list.map((entry) => entry.shortName?.toUpperCase()))).toBe(true);
    expect(only(list.map((entry) => entry.currency.ticker))).toBe(true);
    expect(only(list.map((entry) => entry.color))).toBe(true);
    // 새 색은 이미 있는 색 어느 것과도 뚜렷이 다르다(RGB 거리 40 넘게)
    for (let index = 1; index < list.length; index++) {
      const color = list[index]?.color ?? "";
      for (const other of list.slice(0, index))
        expect(Math.sqrt(colorDistance(color, other.color ?? "#000000"))).toBeGreaterThan(40);
    }
  });

  it("같은 이름이 또 나오면 번호가 오르고, 은퇴한 ID는 다시 쓰지 않는다", () => {
    const seeds = randomSeedsOf(5);
    const first = randomNation(seeds, { existing: [base] });
    const again = randomNation(seeds, { existing: [base, { ...first, name: { ko: "다른", en: "Other" } }] });
    expect(again.id).not.toBe(first.id);
    const retired = randomNation(seeds, { existing: [base], retiredIds: [first.id] });
    expect(retired.id).not.toBe(first.id);
    expect(retired.id.replace(/_\d+$/, "")).toBe(first.id.replace(/_\d+$/, ""));
  });

  it("한 부분만 다시 굴리면 그 부분(과 거기서 나오는 것)만 바뀐다", () => {
    const seeds = randomSeedsOf(11);
    const before = randomNation(seeds, { existing: [base] });
    const color = randomNation(rerollPart(seeds, "color"), { existing: [base] });
    expect({ ...color, color: before.color }).toEqual(before);
    const emblem = randomNation(rerollPart(seeds, "emblem"), { existing: [base] });
    expect(emblem.name).toEqual(before.name);
    expect(emblem.currency).toEqual(before.currency);
    const name = randomNation(rerollPart(seeds, "name"), { existing: [base] });
    expect(name.name.en).not.toBe(before.name.en);
    expect(name.currency.name).toEqual(before.currency.name);
    expect(name.leaderName).toEqual(before.leaderName);
    for (const part of NATION_RANDOM_PARTS) expect(rerollPart(seeds, part)[part]).not.toBe(seeds[part]);
  });
});

describe("distinctColor", () => {
  it("색 후보는 #rrggbb이고, 이미 있는 색과 가장 먼 것을 고른다", () => {
    expect(RANDOM_COLORS.every((color) => isFactionColor(color))).toBe(true);
    expect(new Set(RANDOM_COLORS).size).toBe(RANDOM_COLORS.length);
    const taken = ["#c0392b", "#2980b9"];
    const picked = distinctColor(3, taken);
    const score = (color: string) => Math.min(...taken.map((other) => colorDistance(color, other)));
    expect(RANDOM_COLORS.every((color) => score(color) <= score(picked))).toBe(true);
  });
});
