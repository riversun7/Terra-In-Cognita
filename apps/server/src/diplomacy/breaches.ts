// 조약 위반 나라·세력 신뢰·제재 명분(줄기 fixes-1117c — 질문 2558 고침) — 기획 D-255("조약을 어기면 모두가 보는 신뢰가 떨어진다", 사용자 선택),
// D-329 86("조약은 공격을 막지 않고, 먼저 싸운 쪽에 위반 사건을 남긴다"), D-290(명분 "제재 — 상대가 조약을 어겼다", 판정 재료 "조약 위반 기록"),
// D-443 154("신뢰는 세력마다 하나, 모두가 보는 값"). docs/adr/2026-11-21-diplomacy-treaties.md "바뀜 (fixes-1117c)".
// - 위반한 나라 = 맺은 조약 동안 그 상대에게 선전포고한 나라. 선포 길 셋이 선포를 알린다(declared): NPC 판단(SimHooks.warDeclared — npcRun.ts),
//   의결 선전포고(governance/port.ts declareWar), 참전 수락(diplomacy/port.ts joinWar). 외교 틱이 두 나라 전쟁을 보고 조약을 위반(broken)으로 끝낼 때
//   맺은 뒤의 선포를 찾아 위반 나라를 적는다(diplomacy_treaties.broken_by). 못 찾으면(선포 기록이 켜기 전에 사라짐·시뮬 안 다른 길) 위반 나라 없음 [임시 2582].
// - 세력 신뢰(−100~100) = 시작 0 − 위반 수 × 설정 칸 dip_breach_trust_penalty(위반 기록에서 셈 — 저장하지 않는다). 오르는 길은 아직 없다 [임시 2583].
// - 제재 명분: 위반 기록이 설정 칸 dip_sanction_window_ms 안이면 누구든 그 나라에 제재 명분이 있다 [임시 2584]. NPC 판단 치기 점수의 무명분 선포 몫에서
//   dip_sanction_cause_bonus를 덜어 낸다(SimHooks.causeBonus → RivalView.causeBonus, 무명분 몫까지만).
//   바뀜(gov-fix-3 — 질문 2585 사용자 답, D-290 반대 읽기 "명분 없이도 선포할 수 있다. 그러면 관계 점수 하락 + 국고 선포 비용"): 명분(hasCause)이 있으면 선포 비용(국고 소각
//   s3_war_cost)을 내지 않는다 — NPC 판단(SimHooks.warCause → society.declareWar caused)·의결 선전포고(governance/port.ts) 둘 다. 관계 점수 체계는 서버·시뮬에
//   아직 없어(세력 쌍 호감 D-255는 화면 시안뿐) 무명분 선포의 관계 하락도 없다 — 건너뛸 것이 없다.
//   바뀜(gov-fix-4 — D-591): 세력 쌍 호감(affinity.ts)이 생겨 명분 없는 선포는 선포한 나라와 모든 나라의 호감을 내린다(명분이 있으면 건너뜀 — causedWar).
// 장부는 원장마다 하나(WeakMap — 신용 장부와 같은 자리). 외교 서비스가 붙이고 켤 때 위반 기록을 읽는다. 키는 거울 세계 세력 ID(= 국고 소유 주체).
// 바뀜(gov-fix-3 — 질문 2582 사용자 답 "다시 켜도 어긴 나라를 알아야"): 선포 기록도 표 diplomacy_declarations에 쓴다. 외교 서비스가 장부를 켤 때 읽고(restoreDeclaration)
// 쓰는 곳을 붙인다(persistWith — 붙기 전 선포는 붙을 때 쓴다). 선포 길은 동기라 쓰기는 기다리지 않고 장부가 들고 있다가(settle) 잃지 않게 한다.
import type { SimFaction, SimHooks } from "@terra/sim";
import { affinityBookOf } from "./affinity.ts";

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

/** 선포 하나(거울 세계 세력 ID) */
export interface Declaration {
  readonly attacker: number;
  readonly target: number;
  readonly atMs: number;
}

export interface BreachBook {
  /** 선포를 알린다(공격한 세력 → 상대). 쓰는 곳이 붙어 있으면 바로 쓴다(기다리지 않음) */
  declared(attacker: number, target: number, atMs: number): void;
  /** 켤 때 읽은 선포 하나(더 최근 것이 이미 있으면 그대로 — 쓰지 않는다) */
  restoreDeclaration(attacker: number, target: number, atMs: number): void;
  /** 선포를 쓰는 곳을 붙인다(이미 들고 있는 쓰지 않은 선포를 이어서 쓴다) */
  persistWith(save: (declaration: Declaration) => Promise<void>): void;
  /** 진행 중인 선포 쓰기를 기다린다 */
  settle(): Promise<void>;
  /** 두 세력 사이에 sinceMs 뒤 가장 최근 선포한 세력(없으면 undefined) */
  declarerSince(a: number, b: number, sinceMs: number): number | undefined;
  /** 위반 기록 하나(켤 때 읽은 것·새로 적은 것) */
  record(breaker: number, atMs: number): void;
  /** 켤 때 다 읽었나 */
  loaded(): boolean;
  markLoaded(): void;
  /** 그 세력의 위반 수 */
  breachesOf(owner: number): number;
  /** attacker가 target에 제재 명분이 있나(위반 기록이 기간 안 — 몫 설정 칸과 무관, 2585 gov-fix-3) */
  hasCause(attacker: number, target: number, nowMs: number): boolean;
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
  /** 쓰는 곳이 붙기 전 선포(붙을 때 쓴다) */
  let unsaved: Declaration[] = [];
  let save: ((declaration: Declaration) => Promise<void>) | undefined;
  const writing = new Set<Promise<void>>();
  const write = (declaration: Declaration): void => {
    if (!save) {
      unsaved.push(declaration);
      if (unsaved.length > DECLARE_KEEP) unsaved.shift();
      return;
    }
    const job = save(declaration).finally(() => writing.delete(job));
    writing.add(job);
  };
  const remember = (attacker: number, target: number, atMs: number): void => {
    const key = pairKey(attacker, target);
    declarations.delete(key);
    declarations.set(key, { attacker, atMs });
    if (declarations.size > DECLARE_KEEP) {
      const oldest = declarations.keys().next();
      if (!oldest.done) declarations.delete(oldest.value);
    }
  };
  const hasCause = (attacker: number, target: number, nowMs: number): boolean => {
    if (attacker === target) return false;
    const since = nowMs - Math.max(0, rules().sanctionWindowMs);
    return (breaches.get(target) ?? []).some((atMs) => atMs >= since && atMs <= nowMs);
  };
  return {
    declared(attacker, target, atMs) {
      if (attacker === target) return;
      remember(attacker, target, atMs);
      write({ attacker, target, atMs });
    },
    restoreDeclaration(attacker, target, atMs) {
      if (attacker === target) return;
      const have = declarations.get(pairKey(attacker, target));
      if (!have || have.atMs < atMs) remember(attacker, target, atMs);
    },
    persistWith(next) {
      save = next;
      const waiting = unsaved;
      unsaved = [];
      for (const declaration of waiting) write(declaration);
    },
    async settle() {
      await Promise.all(writing);
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
    hasCause,
    causeBonus(attacker, target, nowMs) {
      return hasCause(attacker, target, nowMs) ? Math.max(0, Math.trunc(rules().sanctionCauseBonus)) : 0;
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

/** 선포 명분이 있나(제재 — 위반 장부를 다 읽었을 때만, 2585 gov-fix-3). 의결 선전포고·NPC 고리가 같이 쓴다 */
export function warCauseOf(ledger: object, attacker: number, target: number, nowMs: number): boolean {
  const book = breachBookOf(ledger);
  return book?.loaded() === true && book.hasCause(attacker, target, nowMs);
}

/** 선포에 명분이 있나(제재 — warCauseOf, 해방 — 떨어져 나간 반란 세력 rebelOf. society.declareWar의 비용 면제와 같은 셈 — 줄기 gov-fix-4) */
export function causedWar(
  ledger: object,
  attacker: Pick<SimFaction, "id">,
  target: Pick<SimFaction, "id" | "rebelOf">,
  nowMs: number,
): boolean {
  return target.rebelOf === attacker.id || warCauseOf(ledger, attacker.id, target.id, nowMs);
}

/**
 * NPC 판단 고리(npc/rulingVault.ts npcRulingHooks가 얹는다 — runtime.ts 1,000줄 상한): 새 선포를 위반 장부에 알리고(warDeclared), 제재 명분 몫(causeBonus)·명분 여부(warCause — 선포 비용 면제, 2585)를 준다.
 * 장부가 아직 없으면(외교가 붙기 전) 알리지 않고 몫은 0
 */
export function withTreatyHooks(base: SimHooks, o: { readonly ledger: object }): SimHooks {
  return {
    ...base,
    warDeclared(attacker: SimFaction, target: SimFaction, nowMs: number) {
      base.warDeclared?.(attacker, target, nowMs);
      breachBookOf(o.ledger)?.declared(attacker.id, target.id, nowMs);
      // 명분 없는 선포면 모든 나라와 호감이 내려간다(D-290 — affinity.ts, 줄기 gov-fix-4. 명분 = 제재·해방, society.declareWar 비용 셈과 같다)
      affinityBookOf(o.ledger)?.declaredByOwner(
        attacker.id,
        causedWar(o.ledger, attacker, target, nowMs),
        nowMs,
      );
    },
    causeBonus(attacker: SimFaction, target: SimFaction, nowMs: number) {
      const book = breachBookOf(o.ledger);
      const mine = book?.loaded() === true ? book.causeBonus(attacker.id, target.id, nowMs) : 0;
      return Math.max(mine, base.causeBonus?.(attacker, target, nowMs) ?? 0);
    },
    warCause(attacker: SimFaction, target: SimFaction, nowMs: number) {
      if (base.warCause?.(attacker, target, nowMs) === true) return true;
      return warCauseOf(o.ledger, attacker.id, target.id, nowMs);
    },
  };
}
