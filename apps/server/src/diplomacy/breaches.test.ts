// 조약 위반 장부 시험(줄기 fixes-1117c — 기획 D-255·D-290·D-329 86): 어긴 나라 찾기·세력 신뢰·제재 명분·NPC 고리
import type { SimFaction, SimHooks } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  type Declaration,
  attachBreachBook,
  breachBookOf,
  createBreachBook,
  trustOf,
  warCauseOf,
  withTreatyHooks,
} from "./breaches.ts";

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

  it("선포 기록 쓰기(gov-fix-3 — 2582): 붙기 전 선포는 붙을 때 쓰고, 켤 때 읽은 선포는 더 최근 것을 덮지 않는다", async () => {
    const book = createBreachBook(() => RULES);
    const saved: Declaration[] = [];
    book.declared(1, 2, 100);
    book.persistWith(async (declaration) => {
      saved.push(declaration);
    });
    book.declared(3, 4, 200);
    await book.settle();
    expect(saved).toEqual([
      { attacker: 1, target: 2, atMs: 100 },
      { attacker: 3, target: 4, atMs: 200 },
    ]);
    // 켤 때 읽은 옛 선포(4 → 3, 150)는 더 최근 선포(3 → 4, 200)를 덮지 않고, 없는 쌍은 채운다(쓰지 않는다)
    book.restoreDeclaration(4, 3, 150);
    book.restoreDeclaration(5, 6, 50);
    expect(book.declarerSince(3, 4, 0)).toBe(3);
    expect(book.declarerSince(5, 6, 0)).toBe(5);
    expect(saved).toHaveLength(2);
  });

  it("명분(2585 gov-fix-3): 몫 설정 칸이 0이어도 위반 기록이 기간 안이면 명분이 있다 — 장부를 다 읽은 뒤에만(NPC 고리 warCause·의결 warCauseOf)", () => {
    const ledger = {};
    const rules = { ...RULES, sanctionCauseBonus: 0 };
    const hooks = withTreatyHooks(
      {
        treasuryAsset: () => "credit",
        beforeCityTransfer: () => undefined,
        factionBorn: () => undefined,
        factionDied: () => undefined,
      },
      { ledger },
    );
    expect(hooks.warCause?.(faction(3), faction(1), 30)).toBe(false);
    const book = attachBreachBook(ledger, () => rules);
    book.record(1, 20);
    expect(warCauseOf(ledger, 3, 1, 30)).toBe(false);
    book.markLoaded();
    expect(book.causeBonus(3, 1, 30)).toBe(0);
    expect(book.hasCause(3, 1, 30)).toBe(true);
    expect(hooks.warCause?.(faction(3), faction(1), 30)).toBe(true);
    expect(warCauseOf(ledger, 3, 1, 30)).toBe(true);
    expect(warCauseOf(ledger, 1, 3, 30)).toBe(false);
    expect(warCauseOf(ledger, 3, 1, 20 + rules.sanctionWindowMs + 1)).toBe(false);
  });
});
