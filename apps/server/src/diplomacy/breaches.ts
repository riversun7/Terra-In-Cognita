// 조약 위반 나라·세력 신뢰·제재 명분(줄기 fixes-1117c — 질문 2558 고침) — 기획 D-255("조약을 어기면 모두가 보는 신뢰가 떨어진다", 사용자 선택),
// D-329 86("조약은 공격을 막지 않고, 먼저 싸운 쪽에 위반 사건을 남긴다"), D-290(명분 "제재 — 상대가 조약을 어겼다", 판정 재료 "조약 위반 기록"),
// D-443 154("신뢰는 세력마다 하나, 모두가 보는 값"). docs/adr/2026-11-21-diplomacy-treaties.md "바뀜 (fixes-1117c)".
// - 위반한 나라 = 맺은 조약 동안 그 상대에게 선전포고한 나라. 선포 길 셋이 선포를 알린다(declared): NPC 판단(SimHooks.warDeclared — npcRun.ts),
//   의결 선전포고(governance/port.ts declareWar), 참전 수락(diplomacy/port.ts joinWar). 외교 틱이 두 나라 전쟁을 보고 조약을 위반(broken)으로 끝낼 때
//   맺은 뒤의 선포를 찾아 위반 나라를 적는다(diplomacy_treaties.broken_by). 못 찾으면(선포 기록이 켜기 전에 사라짐·시뮬 안 다른 길) 위반 나라 없음 [임시 2582].
// - 세력 신뢰(−100~100) = 시작 0 − 위반 수 × 설정 칸 dip_breach_trust_penalty(위반 기록에서 셈 — 저장하지 않는다). 오르는 길은 아직 없다 [임시 2583].
// - 제재 명분: 위반 기록이 설정 칸 dip_sanction_window_ms 안이면 누구든 그 나라에 제재 명분이 있다 [임시 2584]. NPC 판단 치기 점수의 무명분 선포 몫에서
//   dip_sanction_cause_bonus를 덜어 낸다(SimHooks.causeBonus → RivalView.causeBonus, 무명분 몫까지만). 무명분 선포 비용(국고 소각)은 그대로 [임시 2585].
// 장부는 원장마다 하나(WeakMap — 신용 장부와 같은 자리). 외교 서비스가 붙이고 켤 때 위반 기록을 읽는다. 키는 거울 세계 세력 ID(= 국고 소유 주체).
import type { SimFaction, SimHooks } from "@terra/sim";

/** 세력 신뢰 범위(@terra/shared/faction DiplomacyRow.trust와 같다) */
export const TRUST_MIN = -100;
export const TRUST_MAX = 100;

export interface BreachRules {
  readonly breachTrustPenalty: number;
  readonly sanctionWindowMs: number;
  readonly sanctionCauseBonus: number;
}

/** 위반 수 → 세력 신뢰 */
export function trustOf(breaches: number, penalty: number): number {
  const drop = Math.max(0, Math.trunc(breaches)) * Math.max(0, Math.trunc(penalty));
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, 0 - drop));
}

export interface BreachBook {
  /** 선포를 알린다(공격한 세력 → 상대) */
  declared(attacker: number, target: number, atMs: number): void;
  /** 두 세력 사이에 sinceMs 뒤 가장 최근 선포한 세력(없으면 undefined) */
  declarerSince(a: number, b: number, sinceMs: number): number | undefined;
  /** 위반 기록 하나(켤 때 읽은 것·새로 적은 것) */
  record(breaker: number, atMs: number): void;
  /** 켤 때 다 읽었나 */
  loaded(): boolean;
  markLoaded(): void;
  /** 그 세력의 위반 수 */
  breachesOf(owner: number): number;
  /** attacker가 target에 가진 제재 명분 몫(없으면 0) */
  causeBonus(attacker: number, target: number, nowMs: number): number;
}

const books = new WeakMap<object, BreachBook>();

/** 원장에 붙은 위반 장부(없으면 undefined — 외교가 아직 붙지 않았다) */
export const breachBookOf = (ledger: object): BreachBook | undefined => books.get(ledger);

/** 선포 기록을 얼마나 들고 있나(이보다 오래된 선포는 외교 틱이 이미 봤다) */
const DECLARE_KEEP = 2_000;

const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function createBreachBook(rules: () => BreachRules): BreachBook {
  const declarations = new Map<string, { readonly attacker: number; readonly atMs: number }>();
  const breaches = new Map<number, number[]>();
  let ready = false;
  return {
    declared(attacker, target, atMs) {
      if (attacker === target) return;
      const key = pairKey(attacker, target);
      declarations.delete(key);
      declarations.set(key, { attacker, atMs });
      if (declarations.size > DECLARE_KEEP) {
        const oldest = declarations.keys().next();
        if (!oldest.done) declarations.delete(oldest.value);
      }
    },
    declarerSince(a, b, sinceMs) {
      const found = declarations.get(pairKey(a, b));
      return found && found.atMs >= sinceMs ? found.attacker : undefined;
    },
    record(breaker, atMs) {
      const list = breaches.get(breaker);
      if (list) list.push(atMs);
      else breaches.set(breaker, [atMs]);
    },
    loaded: () => ready,
    markLoaded() {
      ready = true;
    },
    breachesOf: (owner) => breaches.get(owner)?.length ?? 0,
    causeBonus(attacker, target, nowMs) {
      if (attacker === target) return 0;
      const r = rules();
      const since = nowMs - Math.max(0, r.sanctionWindowMs);
      const recent = (breaches.get(target) ?? []).some((atMs) => atMs >= since && atMs <= nowMs);
      return recent ? Math.max(0, Math.trunc(r.sanctionCauseBonus)) : 0;
    },
  };
}

/** 원장에 위반 장부를 붙인다(이미 있으면 그것) */
export function attachBreachBook(ledger: object, rules: () => BreachRules): BreachBook {
  const known = books.get(ledger);
  if (known) return known;
  const book = createBreachBook(rules);
  books.set(ledger, book);
  return book;
}

/**
 * NPC 판단 고리(npc/rulingVault.ts npcRulingHooks가 얹는다 — runtime.ts 1,000줄 상한): 새 선포를 위반 장부에 알리고(warDeclared), 제재 명분 몫을 준다(causeBonus).
 * 장부가 아직 없으면(외교가 붙기 전) 알리지 않고 몫은 0
 */
export function withTreatyHooks(base: SimHooks, o: { readonly ledger: object }): SimHooks {
  return {
    ...base,
    warDeclared(attacker: SimFaction, target: SimFaction, nowMs: number) {
      base.warDeclared?.(attacker, target, nowMs);
      breachBookOf(o.ledger)?.declared(attacker.id, target.id, nowMs);
    },
    causeBonus(attacker: SimFaction, target: SimFaction, nowMs: number) {
      const book = breachBookOf(o.ledger);
      const mine = book?.loaded() === true ? book.causeBonus(attacker.id, target.id, nowMs) : 0;
      return Math.max(mine, base.causeBonus?.(attacker, target, nowMs) ?? 0);
    },
  };
}
