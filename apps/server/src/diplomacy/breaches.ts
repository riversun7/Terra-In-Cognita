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
// 장부는 원장마다 하나(WeakMap — 신용 장부와 같은 자리). 외교 서비스가 붙이고 켤 때 위반 기록을 읽는다. 키는 거울 세계 세력 ID(= 국고 소유 주체).
// 바뀜(gov-fix-3 — 질문 2582 사용자 답 "다시 켜도 어긴 나라를 알아야"): 선포 기록도 표 diplomacy_declarations에 쓴다. 외교 서비스가 장부를 켤 때 읽고(restoreDeclaration)
// 쓰는 곳을 붙인다(persistWith — 붙기 전 선포는 붙을 때 쓴다). 선포 길은 동기라 쓰기는 기다리지 않고 장부가 들고 있다가(settle) 잃지 않게 한다.
// 바뀜(fixes-d592 — 사용자 결정 D-592, 질문 2582 나·2583 다·2584 다):
// - 2582 나: 시뮬 안 정부 재건(D-527 — 약탈당한 나라가 정부를 다시 세우면 약탈한 나라와 다시 전쟁)으로 조약이 깨지면 약탈한 쪽이 어긴 나라다. 재건 때(npc/warOutcomes.ts
//   ended "rebuilt") 약탈한 세력을 그 쌍의 전쟁을 연 쪽으로 적는다(blame — 선포 기록과 같은 자리·같은 표, 다시 켜도 안다). 그 밖에 모르는 길(반란 세력 탄생 등)은 그대로 null.
// - 2583 다: 위반 기록은 설정 칸 dip_breach_expire_ms가 지나면 잊는다(0 = 잊지 않음). 신뢰·명분은 남은 기록에서 셈하므로 잊으면 신뢰가 그만큼 돌아온다.
// - 2584 다: 제재 명분은 어긴 조약의 상대(피해 나라)와 그 나라의 동맹(맺은 동맹 조약 — 외교 틱이 setAllies로 알린다)만 갖는다(옛 "누구든"을 대신함).
import type { SimFaction, SimHooks } from "@terra/sim";

/** 세력 신뢰 범위(@terra/shared/faction DiplomacyRow.trust와 같다) */
export const TRUST_MIN = -100;
export const TRUST_MAX = 100;

export interface BreachRules {
  readonly breachTrustPenalty: number;
  readonly sanctionWindowMs: number;
  readonly sanctionCauseBonus: number;
  /** 위반 기록을 잊는 기간(ms, 0 = 잊지 않음 — 2583 다). 없으면 0 */
  readonly breachExpireMs?: number | undefined;
}

/** 위반 기록이 아직 남았나(잊는 기간 안 — 2583 다) */
export function breachLive(atMs: number, nowMs: number, expireMs: number | undefined): boolean {
  const keep = Math.max(0, Math.trunc(expireMs ?? 0));
  return keep === 0 || atMs + keep > nowMs;
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
  /**
   * 재건으로 다시 난 전쟁의 책임(2582 나): 약탈한 세력(attacker)을 그 쌍의 전쟁을 연 쪽으로 적는다 — 선포 기록과 같은 자리·같은 표(declared와 같다)
   */
  blame(attacker: number, target: number, atMs: number): void;
  /** 위반 기록 하나(켤 때 읽은 것·새로 적은 것). victim = 어긴 조약의 상대(피해 나라 — 2584 다) */
  record(breaker: number, atMs: number, victim: number): void;
  /** 맺은 동맹 조약 쌍(외교 틱마다 통째로 바꾼다 — 2584 다) */
  setAllies(pairs: Iterable<readonly [number, number]>): void;
  /** 켤 때 다 읽었나 */
  loaded(): boolean;
  markLoaded(): void;
  /** 그 세력의 남은 위반 수(잊는 기간이 지난 기록은 빼고 — 2583 다) */
  breachesOf(owner: number, nowMs: number): number;
  /**
   * attacker가 target에 제재 명분이 있나(몫 설정 칸과 무관, 2585 gov-fix-3): target의 남은 위반 기록 가운데 제재 기간 안이고 피해 나라가 attacker이거나 attacker의
   * 동맹인 것이 있으면(2584 다)
   */
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
  /** 어긴 세력 → 위반 기록(시각·피해 나라) */
  const breaches = new Map<number, { readonly atMs: number; readonly victim: number }[]>();
  /** 동맹 쌍 열쇠(pairKey) */
  let allies = new Set<string>();
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
    const r = rules();
    const since = nowMs - Math.max(0, r.sanctionWindowMs);
    return (breaches.get(target) ?? []).some(
      (row) =>
        row.atMs >= since &&
        row.atMs <= nowMs &&
        breachLive(row.atMs, nowMs, r.breachExpireMs) &&
        (row.victim === attacker || allies.has(pairKey(attacker, row.victim))),
    );
  };
  const declare = (attacker: number, target: number, atMs: number): void => {
    if (attacker === target) return;
    remember(attacker, target, atMs);
    write({ attacker, target, atMs });
  };
  return {
    declared: declare,
    blame: declare,
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
    record(breaker, atMs, victim) {
      const list = breaches.get(breaker);
      if (list) list.push({ atMs, victim });
      else breaches.set(breaker, [{ atMs, victim }]);
    },
    setAllies(pairs) {
      const next = new Set<string>();
      for (const [a, b] of pairs) if (a !== b) next.add(pairKey(a, b));
      allies = next;
    },
    loaded: () => ready,
    markLoaded() {
      ready = true;
    },
    breachesOf(owner, nowMs) {
      const expireMs = rules().breachExpireMs;
      return (breaches.get(owner) ?? []).filter((row) => breachLive(row.atMs, nowMs, expireMs)).length;
    },
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

/**
 * 시뮬 안 정부 재건으로 다시 난 전쟁(2582 나 — D-592, D-527): 약탈한 세력을 그 쌍의 전쟁을 연 쪽으로 적는다(위반 장부 blame). npc/warOutcomes.ts가 남은 상태가 "rebuilt"로
 * 끝날 때 부른다(재건 직후 시뮬이 다시 전쟁을 건다 — 그 사이 조약이 맺어져 있었으면 다음 외교 틱이 약탈한 쪽을 어긴 나라로 적는다). 장부가 아직 없으면 아무것도 하지 않는다
 */
export function blameRebuiltWar(ledger: object, looter: number, rebuilder: number, nowMs: number): void {
  breachBookOf(ledger)?.blame(looter, rebuilder, nowMs);
}
