// 세력 쌍 호감(줄기 gov-fix-4) — 사용자 결정 D-591(질문 2531 "관계점수 많은 양이 깍여서 시작" — 가문 독립 뒤 옛 나라와, 자동 전쟁 없음), 기획 D-255("관계 점수:
// 호감·신뢰. NPC의 판단과 화면 표시에 쓴다")·D-443 154("호감은 세력 쌍마다, 신뢰는 세력마다 하나")·D-290("명분 없이 선포하면 모든 세력과의 관계 점수가 크게
// 떨어진다")·D-291("참전 요청을 거절하면 그 동맹과의 관계 점수가 떨어진다")·질문 2585(명분이 있으면 무명분 대가 없음). docs/adr/2026-11-21-diplomacy-treaties.md
// "바뀜 (gov-fix-4, D-591)".
// - 호감 = −100~100(@terra/shared/faction RELATION_SCORE_MIN·MAX, 띠 relationBand), 시작 0. 세력 행 쌍마다 하나 — 두 나라가 같은 값을 본다(방향 없음 [임시 2661]).
//   세력 신뢰(세력마다)는 위반 기록에서 셈한다(breaches.ts — 여기 두지 않는다).
// - 바꾸는 길(지금 있는 사건만 — 지어내지 않는다): ① 가문 독립(governance/leaderAgendas.ts declare — 새 나라와 옛 나라, 설정 칸 dip_independence_affinity),
//   ② 명분 없는 선포(의결 선전포고 governance/port.ts, NPC 판단 SimHooks.warDeclared — 선포한 나라와 다른 모든 나라, dip_no_cause_affinity. 명분 = 제재 또는 해방 —
//   떨어져 나간 반란 세력, society.declareWar와 같은 셈), ③ 참전 요청 거절(diplomacy/service.ts — 거절한 나라와 요청한 나라, dip_join_refuse_affinity).
//   오르는 길은 아직 없다(조약 이행으로 오르게 하자는 기획자 제안 D-255 — 정해지지 않음 [임시 2662]). → 아래 바뀜(npc-diplo)이 대신한다.
// - 쓰는 곳: NPC가 받은 조약 답(clauses.ts npcTreatyAnswer — 호감 띠가 "적대"면 불가침·동맹·보호를 받지 않는다 [임시 2663]), 외교 칸(상대 고르기 줄의 호감·띠).
// - 장부는 원장마다 하나(WeakMap — 위반 장부와 같은 자리). 외교 포트가 붙이며 규칙·나라 목록·거울 세계 세력 ID → 세력 행을 준다. 바꾸면 표 diplomacy_affinity에
//   바로 쓴다(기다리지 않음 — settle로 기다릴 수 있다). 외교 서비스가 켤 때 표를 읽는다(그 전 바뀜은 쓰는 곳이 붙을 때 이어서 쓴다).
// 바뀜(npc-diplo — 질문 2662·2663): 오르는 길(affinityRise.ts — 하루마다 0 쪽으로·지킨 조약 하루 몫·강화 몫·참전 수락 몫)과 NPC 판단(거울 세계 세력 ID로 읽기 getByOwner —
// 고리 SimHooks.relationOf가 새 선포·강화 점수에, 참전 답이 힘 비 문턱에 쓴다 — @terra/sim/npcAi relationScore).
// 정수 연산만 쓴다.
import { RELATION_SCORE_MAX, RELATION_SCORE_MIN } from "@terra/shared/faction";
import { createPeaceWatch, dayOf, daysToStep, keptDays, stepAffinity } from "./affinityRise.ts";

export interface AffinityRules {
  readonly independenceAffinity: number;
  readonly noCauseAffinity: number;
  readonly joinRefuseAffinity: number;
  /** 오르는 길(줄기 npc-diplo — affinityRise.ts). 없으면 0 */
  readonly affinityDriftPerDay?: number | undefined;
  readonly treatyKeptAffinity?: number | undefined;
  readonly peaceAffinity?: number | undefined;
  readonly joinAcceptAffinity?: number | undefined;
}

/** 장부가 쓰는 한 줄(세력 행 쌍, 값) */
export interface AffinityRecord {
  readonly a: number;
  readonly b: number;
  readonly score: number;
  readonly atMs: number;
}

export interface AffinityWorld {
  readonly rules: () => AffinityRules;
  /** 살아 있는 나라들(세력 행) — 무명분 선포가 모두와 내린다 */
  readonly nations: () => readonly number[];
  /** 거울 세계 세력 ID → 나라 세력 행(NPC 판단 고리가 쓴다). 없으면 undefined */
  readonly rowOfOwner: (owner: number) => number | undefined;
}

export interface AffinityBook {
  /** 두 나라의 호감(없으면 0) */
  get(a: number, b: number): number;
  /** 두 거울 세계 세력(소유 주체 ID)의 호감 — 나라를 모르면 0(NPC 판단 고리) */
  getByOwner(aOwner: number, bOwner: number): number;
  /** 호감을 delta만큼 바꾼다(범위로 자른다, 같은 나라·0이면 아무것도 하지 않음) */
  add(a: number, b: number, delta: number, atMs: number): void;
  /** 가문 독립: 새 나라와 옛 나라의 호감을 dip_independence_affinity만큼 내린다 */
  independence(child: number, parent: number, atMs: number): void;
  /** 선포: 명분이 없으면 선포한 나라와 다른 모든 나라의 호감을 dip_no_cause_affinity만큼 내린다 */
  declared(attacker: number, caused: boolean, atMs: number): void;
  /** NPC 판단 선포(거울 세계 세력 ID) — declared와 같다 */
  declaredByOwner(attackerOwner: number, caused: boolean, atMs: number): void;
  /** 참전 요청 거절: 거절한 나라와 요청한 나라의 호감을 dip_join_refuse_affinity만큼 내린다 */
  joinRefused(joiner: number, requester: number, atMs: number): void;
  /** 참전 요청 수락: 들어간 나라와 요청한 나라의 호감을 dip_join_accept_affinity만큼 올린다(줄기 npc-diplo) */
  joinAccepted(joiner: number, requester: number, atMs: number): void;
  /**
   * 외교 틱마다 지금 전쟁 쌍(세력 행)을 알린다: 지난 틱에 전쟁이었고 지금은 아닌 두 나라가 둘 다 살아 있으면 강화 몫(dip_peace_affinity). 켠 뒤 첫 번은 기준만(줄기 npc-diplo)
   */
  observeWars(pairs: Iterable<readonly [number, number]>, atMs: number): void;
  /**
   * 하루 걸음(외교 틱마다 부른다 — 날이 바뀌었을 때만 걷는다): kept = 지킨 불가침·동맹·보호 조약이 있는 쌍(pairKey) → 그 조약을 맺은 시각(여럿이면 가장 이른 것)
   */
  daily(nowMs: number, kept: ReadonlyMap<string, number>): void;
  /** 켤 때 읽은 줄(atMs = 표 updated_at_ms — 마지막 하루 걸음 날을 정한다) */
  restore(a: number, b: number, score: number, atMs?: number): void;
  /** 쓰는 곳을 붙인다(붙기 전 바뀜을 이어서 쓴다) */
  persistWith(save: (record: AffinityRecord) => Promise<void>): void;
  settle(): Promise<void>;
  loaded(): boolean;
  markLoaded(): void;
  /** 세계 값(규칙·나라 목록)을 붙이거나 바꾼다 */
  bind(world: AffinityWorld): void;
}

/** 쌍 열쇠(작은 행:큰 행) — 하루 걸음 kept 표가 쓴다 */
export const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
const pairOf = (key: string): readonly [number, number] => {
  const [a = "0", b = "0"] = key.split(":");
  return [Number(a), Number(b)];
};
const clamp = (score: number): number =>
  Math.max(RELATION_SCORE_MIN, Math.min(RELATION_SCORE_MAX, Math.trunc(score)));
const amount = (value: number): number => Math.max(0, Math.trunc(value));

/** 쓰는 곳이 붙기 전 바뀜을 얼마나 들고 있나 */
const UNSAVED_KEEP = 2_000;

export function createAffinityBook(world?: AffinityWorld): AffinityBook {
  let bound = world;
  const scores = new Map<string, number>();
  let ready = false;
  /** 마지막 하루 걸음 날(켤 때 읽은 줄의 가장 최근 시각에서, 없으면 첫 걸음이 오늘로 정한다) */
  let lastDay: number | undefined;
  let restoredAt: number | undefined;
  const peaceWatch = createPeaceWatch();
  let unsaved: AffinityRecord[] = [];
  let save: ((record: AffinityRecord) => Promise<void>) | undefined;
  const writing = new Set<Promise<void>>();
  const write = (record: AffinityRecord): void => {
    if (!save) {
      unsaved.push(record);
      if (unsaved.length > UNSAVED_KEEP) unsaved.shift();
      return;
    }
    const job = save(record).finally(() => writing.delete(job));
    writing.add(job);
  };
  const get = (a: number, b: number): number => scores.get(pairKey(a, b)) ?? 0;
  const add = (a: number, b: number, delta: number, atMs: number): void => {
    if (a === b || Math.trunc(delta) === 0) return;
    const before = get(a, b);
    const score = clamp(before + Math.trunc(delta));
    if (score === before) return;
    scores.set(pairKey(a, b), score);
    write({ a: Math.min(a, b), b: Math.max(a, b), score, atMs });
  };
  const declared = (attacker: number, caused: boolean, atMs: number): void => {
    if (caused || !bound) return;
    const drop = amount(bound.rules().noCauseAffinity);
    if (drop === 0) return;
    for (const other of bound.nations()) if (other !== attacker) add(attacker, other, -drop, atMs);
  };
  const rowOf = (owner: number): number | undefined => bound?.rowOfOwner(owner);
  return {
    get,
    getByOwner(aOwner, bOwner) {
      const a = rowOf(aOwner);
      const b = rowOf(bOwner);
      return a === undefined || b === undefined ? 0 : get(a, b);
    },
    add,
    independence(child, parent, atMs) {
      if (bound) add(child, parent, -amount(bound.rules().independenceAffinity), atMs);
    },
    declared,
    declaredByOwner(attackerOwner, caused, atMs) {
      const row = bound?.rowOfOwner(attackerOwner);
      if (row !== undefined) declared(row, caused, atMs);
    },
    joinRefused(joiner, requester, atMs) {
      if (bound) add(joiner, requester, -amount(bound.rules().joinRefuseAffinity), atMs);
    },
    joinAccepted(joiner, requester, atMs) {
      if (bound) add(joiner, requester, amount(bound.rules().joinAcceptAffinity ?? 0), atMs);
    },
    observeWars(pairs, atMs) {
      const ended = peaceWatch.observe(pairs);
      if (!bound || ended.length === 0) return;
      const gain = amount(bound.rules().peaceAffinity ?? 0);
      const alive = new Set(bound.nations());
      for (const [a, b] of ended) if (alive.has(a) && alive.has(b)) add(a, b, gain, atMs);
    },
    daily(nowMs, kept) {
      const today = dayOf(nowMs);
      if (lastDay === undefined) {
        lastDay = today;
        return;
      }
      const steps = daysToStep(lastDay, today);
      if (steps === 0 || !bound) return;
      lastDay = today;
      const rules = bound.rules();
      const step = {
        affinityDriftPerDay: rules.affinityDriftPerDay ?? 0,
        treatyKeptAffinity: rules.treatyKeptAffinity ?? 0,
      };
      const keys = new Set([...scores].filter(([, score]) => score !== 0).map(([key]) => key));
      for (const key of kept.keys()) keys.add(key);
      for (const key of [...keys].toSorted()) {
        const [a, b] = pairOf(key);
        const since = kept.get(key);
        const keptN = since === undefined ? 0 : keptDays(steps, since, nowMs);
        const before = get(a, b);
        add(a, b, stepAffinity(before, steps, keptN, step) - before, nowMs);
      }
    },
    restore(a, b, score, atMs) {
      if (a !== b) scores.set(pairKey(a, b), clamp(score));
      if (atMs !== undefined && (restoredAt === undefined || atMs > restoredAt)) restoredAt = atMs;
    },
    persistWith(next) {
      save = next;
      const waiting = unsaved;
      unsaved = [];
      for (const record of waiting) write(record);
    },
    async settle() {
      await Promise.all(writing);
    },
    loaded: () => ready,
    markLoaded() {
      ready = true;
      if (restoredAt !== undefined && lastDay === undefined) lastDay = dayOf(restoredAt);
    },
    bind(next) {
      bound = next;
    },
  };
}

const books = new WeakMap<object, AffinityBook>();

/** 원장에 붙은 호감 장부(없으면 undefined — 외교가 아직 붙지 않았다) */
export const affinityBookOf = (ledger: object): AffinityBook | undefined => books.get(ledger);

/** 원장에 호감 장부를 붙인다(이미 있으면 세계 값만 다시 붙인다) */
export function attachAffinityBook(ledger: object, world: AffinityWorld): AffinityBook {
  const known = books.get(ledger);
  if (known) {
    known.bind(world);
    return known;
  }
  const book = createAffinityBook(world);
  books.set(ledger, book);
  return book;
}
