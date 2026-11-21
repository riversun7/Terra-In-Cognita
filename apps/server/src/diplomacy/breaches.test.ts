// 조약 위반 장부 시험(줄기 fixes-1117c — 기획 D-255·D-290·D-329 86): 어긴 나라 찾기·세력 신뢰·제재 명분·NPC 고리
import type { SimFaction, SimHooks } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { attachBreachBook, breachBookOf, createBreachBook, trustOf, withTreatyHooks } from "./breaches.ts";

const RULES = { breachTrustPenalty: 30, sanctionWindowMs: 1_000, sanctionCauseBonus: 150 };
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 고리는 세력 ID만 읽는다
const faction = (id: number): SimFaction => ({ id }) as unknown as SimFaction;

describe("조약 위반 장부", () => {
  it("세력 신뢰 = 0 − 위반 수 × 벌점(−100까지)", () => {
    expect(trustOf(0, 30)).toBe(0);
    expect(trustOf(2, 30)).toBe(-60);
    expect(trustOf(9, 30)).toBe(-100);
    expect(trustOf(3, 0)).toBe(0);
  });

  it("맺은 뒤 가장 최근 선포한 쪽이 어긴 나라다(맺기 전 선포는 세지 않는다)", () => {
    const book = createBreachBook(() => RULES);
    book.declared(1, 2, 100);
    expect(book.declarerSince(2, 1, 50)).toBe(1);
    expect(book.declarerSince(1, 2, 150)).toBeUndefined();
    book.declared(2, 1, 200);
    expect(book.declarerSince(1, 2, 150)).toBe(2);
    book.declared(3, 3, 300);
    expect(book.declarerSince(3, 3, 0)).toBeUndefined();
  });

  it("위반 기록이 기간 안이면 누구든 그 나라에 제재 명분 몫이 있다", () => {
    const book = createBreachBook(() => RULES);
    book.record(5, 1_000);
    expect(book.breachesOf(5)).toBe(1);
    expect(book.causeBonus(7, 5, 1_500)).toBe(150);
    expect(book.causeBonus(7, 5, 2_001)).toBe(0);
    expect(book.causeBonus(5, 5, 1_500)).toBe(0);
    expect(book.causeBonus(5, 7, 1_500)).toBe(0);
  });

  it("NPC 고리: 장부가 붙기 전에는 아무것도 하지 않고, 붙으면 선포를 알리고 몫을 준다(켤 때 다 읽은 뒤에만)", () => {
    const ledger = {};
    const seen: number[] = [];
    const base: SimHooks = {
      treasuryAsset: () => "credit",
      beforeCityTransfer: () => undefined,
      factionBorn: () => undefined,
      factionDied: () => undefined,
      warDeclared: (attacker) => seen.push(attacker.id),
    };
    const hooks = withTreatyHooks(base, { ledger });
    hooks.warDeclared?.(faction(1), faction(2), 10);
    expect(seen).toEqual([1]);
    expect(hooks.causeBonus?.(faction(3), faction(1), 10)).toBe(0);
    const book = attachBreachBook(ledger, () => RULES);
    expect(breachBookOf(ledger)).toBe(book);
    expect(attachBreachBook(ledger, () => RULES)).toBe(book);
    hooks.warDeclared?.(faction(1), faction(2), 20);
    expect(book.declarerSince(1, 2, 15)).toBe(1);
    book.record(1, 20);
    expect(hooks.causeBonus?.(faction(3), faction(1), 30)).toBe(0);
    book.markLoaded();
    expect(hooks.causeBonus?.(faction(3), faction(1), 30)).toBe(150);
  });
});
