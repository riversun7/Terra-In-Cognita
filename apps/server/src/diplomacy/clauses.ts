// 조약 조항 규칙(순수 함수) — 사용자 결정 D-588(질문 2497 가·나 — D-292 조항 카드), 질문 2498(동맹·보호 효과 — 기술 기본값), D-444 167, D-291,
// docs/adr/2026-11-21-diplomacy-treaties.md. 서버 외교 서비스(service.ts)와 시험이 쓴다. 판정에 난수를 쓰지 않는다.
// - 조항 고르기(normalizeClauses): 보내는 나라 기준 칸(보호하는 쪽 us | them)을 저장 모양(보호하는 나라 행)으로 바꾸고 검사한다. 같은 카드 둘 안 됨, 전쟁 중이면
//   휴전·강화(ceasefire)가 꼭 들고 전쟁이 아니면 넣지 않는다(D-292 "전쟁은 강화 조약으로 끝낸다" — 전쟁이 아닌데 끝낼 전쟁이 없다), 공물은 설정 칸 상한 안.
// - NPC 답(npcTreatyAnswer — 받는 쪽이 NPC가 이끄는 나라, D-588 "받는 쪽이 NPC면 NPC 규칙") [임시 2553]: 휴전·강화 = 기존 NPC 강화 규칙식(peaceScore > 0, D-292 195),
//   불가침·동맹 = 차분함(1000 − 공격 성향) ≥ 설정 칸 dip_npc_calm_pm, 보호 = NPC가 보호하는 쪽이면 힘이 상대 이상, 보호받는 쪽이면 힘이 상대보다 작고 차분함 ≥ 문턱.
//   모든 조항이 맞아야 받는다. NPC는 맞제안하지 않는다.
// - NPC 참전 답(npcJoinsWar) [임시 2556]: 힘(휴먼 수 — NPC 판단의 strength)이 적 이상이면 참가한다.
// - 바뀜(gov-fix-4 — D-591 2531·D-255 "관계 점수는 NPC의 판단에 쓴다"): 받는 NPC 나라와 보낸 나라의 호감(affinity.ts) 띠가 "적대"면 차분함이 넉넉해도 불가침·동맹·보호(차분함을
//   보는 조항)를 받지 않는다 [임시 2663]. 휴전·강화는 그대로 강화 규칙식만 본다.
import { relationBand } from "@terra/shared/faction";
import { TREATY_CLAUSE_KINDS, type TreatyClause, type TreatyClauseKind } from "@terra/shared/treaty";

/** 보내는 나라 기준 조항 칸(프로토콜 dip_propose·dip_counter) */
export interface ClauseInput {
  readonly kind: TreatyClauseKind;
  readonly protector?: "us" | "them" | undefined;
  readonly tributePm?: number | undefined;
}

/** 불가침이 따라오는 조항(조약 기간 동안 두 나라가 불가침 — 동맹·보호도, 질문 2498 기술 기본값) */
export const TRUCE_CLAUSES: ReadonlySet<TreatyClauseKind> = new Set([
  "non_aggression",
  "alliance",
  "protection",
]);

const order = (kind: TreatyClauseKind): number => TREATY_CLAUSE_KINDS.indexOf(kind);

/**
 * 보내는 나라(from) → 받는 나라(to) 조항을 저장 모양으로. atWar = 두 나라가 지금 전쟁 중. 맞지 않으면 undefined.
 * 카드 차례(TREATY_CLAUSE_KINDS)로 늘어놓는다
 */
export function normalizeClauses(
  input: readonly ClauseInput[],
  from: number,
  to: number,
  atWar: boolean,
  tributeMaxPm: number,
): TreatyClause[] | undefined {
  if (input.length === 0) return undefined;
  const seen = new Set<TreatyClauseKind>();
  const out: TreatyClause[] = [];
  for (const clause of input) {
    if (seen.has(clause.kind)) return undefined;
    seen.add(clause.kind);
    if (clause.kind === "protection") {
      const tribute = clause.tributePm ?? 0;
      if (clause.protector === undefined) return undefined;
      if (!Number.isSafeInteger(tribute) || tribute < 0 || tribute > tributeMaxPm) return undefined;
      out.push({
        kind: "protection",
        protectorNationId: clause.protector === "us" ? from : to,
        tributePm: tribute,
      });
    } else {
      if (clause.protector !== undefined || clause.tributePm !== undefined) return undefined;
      out.push({ kind: clause.kind });
    }
  }
  if (seen.has("ceasefire") !== atWar) return undefined;
  return out.toSorted((a, b) => order(a.kind) - order(b.kind));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 저장 칸(jsonb) → 조항 목록(모르는 카드·틀린 칸은 뺀다) */
export function clausesOf(value: unknown): TreatyClause[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): TreatyClause[] => {
    if (!isRecord(entry)) return [];
    const kind = TREATY_CLAUSE_KINDS.find((candidate) => candidate === entry.kind);
    if (!kind) return [];
    if (kind !== "protection") return [{ kind }];
    const protector = entry.protectorNationId;
    const tribute = entry.tributePm;
    if (typeof protector !== "number" || !Number.isSafeInteger(protector)) return [];
    return [
      {
        kind,
        protectorNationId: protector,
        tributePm: typeof tribute === "number" && Number.isSafeInteger(tribute) ? tribute : 0,
      },
    ];
  });
}

/** 조항 카드 종류만 */
export const kindsOf = (clauses: readonly TreatyClause[]): TreatyClauseKind[] =>
  clauses.map((clause) => clause.kind);

/** 보호 조항(있으면) */
export const protectionOf = (clauses: readonly TreatyClause[]): TreatyClause | undefined =>
  clauses.find((clause) => clause.kind === "protection");

/** 같은 조항인가(맞제안이 바꾼 것이 없는지 — 판은 그래도 오른다) */
export const sameClauses = (a: readonly TreatyClause[], b: readonly TreatyClause[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export interface NpcTreatyInput {
  readonly clauses: readonly TreatyClause[];
  /** 답하는 NPC 나라(세력 행) */
  readonly self: number;
  readonly atWar: boolean;
  /** 기존 NPC 강화 규칙식 결과(휴전·강화가 들었을 때만 본다 — > 0이면 받는다) */
  readonly peaceScore: number;
  /** 공격 성향(0~1000 — 나라 성향, 팩 국가 프리셋 성향이 얹힌 값) */
  readonly aggression: number;
  /** 힘(휴먼 수 — NPC 판단 strength) */
  readonly myStrength: number;
  readonly otherStrength: number;
  /** 설정 칸 dip_npc_calm_pm */
  readonly calmPm: number;
  /** 두 나라의 호감(−100~100 — affinity.ts, 줄기 gov-fix-4). 없으면 0 */
  readonly affinity?: number | undefined;
}

/** NPC가 이끄는 나라가 받은 조약을 받는가 [임시 2553] */
export function npcTreatyAnswer(input: NpcTreatyInput): boolean {
  const calm = 1000 - Math.min(1000, Math.max(0, Math.trunc(input.aggression)));
  // 호감 띠가 "적대"면 불가침·동맹·보호를 받지 않는다(D-255 "NPC의 판단에 쓴다" — 휴전·강화는 그대로 강화 규칙식) [임시 2663]
  const calmEnough = calm >= input.calmPm && relationBand(input.affinity ?? 0) !== "hostile";
  for (const clause of input.clauses) {
    switch (clause.kind) {
      case "ceasefire":
        if (!input.atWar || input.peaceScore <= 0) return false;
        break;
      case "non_aggression":
      case "alliance":
        if (!calmEnough) return false;
        break;
      case "protection":
        if (clause.protectorNationId === input.self) {
          if (input.myStrength < input.otherStrength) return false;
        } else if (input.myStrength >= input.otherStrength || !calmEnough) return false;
        break;
      default: {
        const unhandled: never = clause.kind;
        return unhandled;
      }
    }
  }
  return true;
}

/** NPC가 이끄는 나라가 참전 요청을 받는가 [임시 2556]: 힘이 적 이상이면 */
export const npcJoinsWar = (myStrength: number, enemyStrength: number): boolean =>
  myStrength >= enemyStrength;

/** 공물 한 번(보호받는 쪽 국고 × ‰ ÷ 1000, 내림) */
export const tributeAmount = (treasury: bigint, tributePm: number): bigint =>
  treasury <= 0n || tributePm <= 0 ? 0n : (treasury * BigInt(Math.trunc(tributePm))) / 1000n;
