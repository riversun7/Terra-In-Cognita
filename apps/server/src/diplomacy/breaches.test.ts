// 조약 위반 장부 시험(줄기 fixes-1117c — 기획 D-255·D-290·D-329 86): 어긴 나라 찾기·세력 신뢰·제재 명분·NPC 고리.
// 바뀜(fixes-d592 — D-592): 피해 나라·동맹만 명분(2584 다), 잊는 기간(2583 다), 재건 전쟁 책임(2582 나)
import type { SimFaction, SimHooks } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { attachAffinityBook } from "./affinity.ts";
import {
  type Declaration,
  attachBreachBook,
  blameRebuiltWar,
  breachBookOf,
  breachLive,
  createBreachBook,
  relationOfOwners,
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

  it("위반 기록이 기간 안이면 피해 나라에 제재 명분 몫이 있다", () => {
    const book = createBreachBook(() => RULES);
    book.record(5, 1_000, 7);
    expect(book.breachesOf(5, 1_000)).toBe(1);
    expect(book.causeBonus(7, 5, 1_500)).toBe(150);
    expect(book.causeBonus(7, 5, 2_001)).toBe(0);
    expect(book.causeBonus(5, 5, 1_500)).toBe(0);
    expect(book.causeBonus(5, 7, 1_500)).toBe(0);
  });

  it("제재 명분은 피해 나라와 그 동맹만(2584 다 — D-592): 상관없는 나라는 없고, 동맹이 풀리면 없어진다", () => {
    const book = createBreachBook(() => RULES);
    book.record(5, 1_000, 7);
    expect(book.hasCause(7, 5, 1_200)).toBe(true);
    expect(book.hasCause(8, 5, 1_200)).toBe(false);
    book.setAllies([[8, 7]]);
    expect(book.hasCause(8, 5, 1_200)).toBe(true);
    expect(book.hasCause(9, 5, 1_200)).toBe(false);
    book.setAllies([]);
    expect(book.hasCause(8, 5, 1_200)).toBe(false);
    expect(book.hasCause(7, 5, 1_200)).toBe(true);
  });

  it("위반 기록은 잊는 기간이 지나면 세지 않는다 — 신뢰가 돌아오고 명분도 없어진다(2583 다 — D-592, 0 = 잊지 않음)", () => {
    const rules = { ...RULES, sanctionWindowMs: 10_000, breachExpireMs: 5_000 };
    const book = createBreachBook(() => rules);
    book.record(5, 1_000, 7);
    book.record(5, 3_000, 7);
    expect(book.breachesOf(5, 4_000)).toBe(2);
    expect(book.breachesOf(5, 6_000)).toBe(1);
    expect(book.hasCause(7, 5, 6_000)).toBe(true);
    expect(book.breachesOf(5, 8_000)).toBe(0);
    expect(book.hasCause(7, 5, 8_000)).toBe(false);
    expect(trustOf(book.breachesOf(5, 8_000), rules.breachTrustPenalty)).toBe(0);
    expect(breachLive(1_000, 1_000_000, 0)).toBe(true);
    expect(breachLive(1_000, 1_000_000, undefined)).toBe(true);
    expect(breachLive(1_000, 6_000, 5_000)).toBe(false);
  });

  it("재건으로 다시 난 전쟁(2582 나 — D-592): 약탈한 쪽이 그 쌍의 전쟁을 연 쪽으로 남는다(선포 기록과 같은 표)", async () => {
    const ledger = {};
    blameRebuiltWar(ledger, 3, 4, 100);
    const book = attachBreachBook(ledger, () => RULES);
    const saved: Declaration[] = [];
    book.persistWith(async (declaration) => {
      saved.push(declaration);
    });
    book.declared(4, 3, 50);
    blameRebuiltWar(ledger, 3, 4, 200);
    await book.settle();
    expect(book.declarerSince(4, 3, 150)).toBe(3);
    expect(saved.at(-1)).toEqual({ attacker: 3, target: 4, atMs: 200 });
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
    book.record(1, 20, 3);
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
    book.record(1, 20, 3);
    expect(warCauseOf(ledger, 3, 1, 30)).toBe(false);
    book.markLoaded();
    expect(book.causeBonus(3, 1, 30)).toBe(0);
    expect(book.hasCause(3, 1, 30)).toBe(true);
    expect(hooks.warCause?.(faction(3), faction(1), 30)).toBe(true);
    expect(warCauseOf(ledger, 3, 1, 30)).toBe(true);
    expect(warCauseOf(ledger, 1, 3, 30)).toBe(false);
    expect(warCauseOf(ledger, 3, 1, 20 + rules.sanctionWindowMs + 1)).toBe(false);
  });

  it("관계 점수 고리(줄기 npc-diplo — 질문 2663): 두 나라 호감·상대 세력 신뢰, 장부를 다 읽기 전에는 중립", () => {
    const ledger = {};
    const hooks = withTreatyHooks(
      {
        treasuryAsset: () => "credit",
        beforeCityTransfer: () => undefined,
        factionBorn: () => undefined,
        factionDied: () => undefined,
      },
      { ledger },
    );
    expect(hooks.relationOf?.(faction(101), faction(102), 0)).toEqual({ affinity: 0, trust: 0 });
    const breaches = attachBreachBook(ledger, () => ({ ...RULES, breachExpireMs: 500 }));
    breaches.record(102, 100, 103);
    const affinity = attachAffinityBook(ledger, {
      rules: () => ({ independenceAffinity: 80, noCauseAffinity: 30, joinRefuseAffinity: 20 }),
      nations: () => [1, 2, 3],
      rowOfOwner: (owner) => owner - 100,
    });
    affinity.restore(1, 2, -45);
    // 다 읽기 전에는 0
    expect(relationOfOwners(ledger, 101, 102, 200)).toEqual({ affinity: 0, trust: 0 });
    breaches.markLoaded();
    affinity.markLoaded();
    expect(hooks.relationOf?.(faction(101), faction(102), 200)).toEqual({ affinity: -45, trust: -30 });
    expect(breaches.trust(102, 200)).toBe(-30);
    // 잊는 기간이 지나면 신뢰가 돌아온다(fixes-d592 — 2583 다)
    expect(relationOfOwners(ledger, 101, 102, 700)).toEqual({ affinity: -45, trust: 0 });
    expect(relationOfOwners(ledger, 102, 103, 200)).toEqual({ affinity: 0, trust: 0 });
  });
});
