// 움직임 AI 고리(WP-4 완성) — docs/adr/2026-11-15-combat-moves.md 6절 · docs/adr/2026-11-20-npc-autonomous-ai.md 4단계.
// - wantsRun: 명시 명령 run 우선 → aiTactics가 있으면 ② 추격·⑦ 퇴각·① 교전·남은 스태미나로 달릴지 결정.
// - moveSkillAllowed: aiTactics가 없으면 늘 참(기존 전투·리플레이 100% 호환), 있으면 돌진·도약·뒷걸음·점멸·은신·감지를
//   ① 교전·③ 엄폐·⑤ 스킬 아끼기·HP·거리 기준으로 기회당 1회 시드 굴림(매 틱 재굴림 금지)으로 판단.
// - chooseCombatTacticFromTraits: 7축 성향 + 사거리 → D-558 8전개 방식 결정적 매핑.
import type { UnitTraits } from "@terra/shared/unitTraits";
import { mix32 } from "../math/hash.ts";
import type { UnitState } from "./battleTypes.ts";
import type { SkillMove } from "./moveParts.ts";
import type { Tactic } from "./tactics.ts";

export interface RunAiContext {
  readonly retreating?: boolean | undefined;
}

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(ax > bx ? ax - bx : bx - ax, ay > by ? ay - by : by - ay);

/** 문자열 짧은 결정적 해시(스킬 ID용) */
function hashId(text: string): number {
  let h = 0x811c_9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x0100_0193);
  }
  return h >>> 0;
}

/**
 * 기회당 1회 결정적 굴림(0~999):
 * 같은 초(1000ms 버킷) 안에서는 같은 결과를 유지해 매 틱 진동을 막는다.
 */
function opportunityRollPm(unitId: number, skillId: string, nowMs: number): number {
  const bucket = Math.floor(Math.max(0, nowMs) / 1000);
  const mixed =
    mix32(Math.imul(unitId, 0x9e37_79b1) ^ hashId(skillId) ^ Math.imul(bucket, 0x85eb_ca6b)) >>> 0;
  return mixed % 1000;
}

/**
 * 이 유닛이 지금 달리고 싶은가(WP-4).
 * 1) 대기 명령(move/attack)에 run === true면 무조건 달린다(기존 시험·직접 입력 호환).
 * 2) aiTactics가 없으면 달리지 않는다(기존 전투 100% 호환).
 * 3) aiTactics가 있으면 퇴각 중(스태미나 ≥ 15%) 또는 추격/교전 성향 + 충분한 스태미나일 때 달린다.
 */
export type RunAiUnit = Pick<UnitState, "command" | "aiTactics" | "staminaMax" | "staminaMilli">;
export type MoveSkillUnit = Pick<
  UnitState,
  "id" | "x" | "y" | "hp" | "maxHp" | "range" | "aiTactics" | "stealthUntilMs" | "detectUntilMs"
>;

export function wantsRun(unit: RunAiUnit, ctx?: RunAiContext): boolean {
  const command = unit.command;
  if ((command?.kind === "move" || command?.kind === "attack") && command.run === true) return true;
  const t = unit.aiTactics;
  if (!t) return false;
  const maxStaMilli = Math.max(1, unit.staminaMax * 1000);
  const staPct = Math.floor((unit.staminaMilli * 100) / maxStaMilli);
  const retreating = ctx?.retreating === true || command?.kind === "retreat";
  if (retreating) return staPct >= 15;
  // 수비·버티기 성향이면 스태미나 보존
  if (t.pursue <= 3 && t.engage <= 3) return false;
  // 공격·추격 성향이 높을수록 낮은 스태미나에서도 달린다(pursue 10 → 35%, pursue 6 → 51%)
  const minStaPct = 35 + Math.max(0, 10 - t.pursue) * 4;
  return (t.pursue >= 6 || t.engage >= 7) && staPct >= minStaPct;
}

/**
 * 이 이동 부품 스킬을 지금 써도 되나(pickSkill이 부른다, WP-4).
 * aiTactics가 없으면 늘 참(기존 전투·리플레이 100% 호환).
 */
export function moveSkillAllowed(
  unit: MoveSkillUnit,
  skill: { readonly id: string; readonly move?: SkillMove | undefined },
  enemy: Pick<UnitState, "x" | "y">,
  nowMs: number,
): boolean {
  const t = unit.aiTactics;
  const move = skill.move;
  if (!t || !move) return true;

  const dist = chebyshev(unit.x, unit.y, enemy.x, enemy.y);
  const hpPct = unit.maxHp > 0 ? Math.floor((unit.hp * 100) / unit.maxHp) : 100;
  const roll = opportunityRollPm(unit.id, skill.id, nowMs);

  switch (move.kind) {
    case "dash":
    case "leap": {
      // 사거리 안이면 매우 호전적일 때(engage >= 8)만 돌진
      if (dist <= unit.range && t.engage < 8) return false;
      const savePenalty = hpPct > 50 ? t.saveSkill * 40 : 0;
      const chancePm = Math.max(0, Math.min(1000, t.engage * 100 - savePenalty));
      return roll < chancePm;
    }
    case "blink": {
      if (move.dir === "toward") {
        if (dist <= unit.range && t.engage < 8) return false;
        const savePenalty = hpPct > 50 ? t.saveSkill * 40 : 0;
        const chancePm = Math.max(0, Math.min(1000, t.engage * 100 - savePenalty));
        return roll < chancePm;
      }
      // away(회피 점멸): 근접 위협 또는 HP 위험
      const closeDanger = unit.range >= 2 && dist <= 2;
      const lowHp = hpPct <= Math.max(40, t.retreatPct + 20);
      if (!closeDanger && !lowHp) return false;
      const chancePm = Math.min(1000, t.cover * 60 + (10 - t.engage) * 40);
      return roll < chancePm;
    }
    case "backstep": {
      const closeDanger = unit.range >= 2 && dist <= 2;
      const lowHp = hpPct <= Math.max(40, t.retreatPct + 20);
      if (!closeDanger && !lowHp) return false;
      const chancePm = Math.min(1000, t.cover * 60 + (10 - t.engage) * 40);
      return roll < chancePm;
    }
    case "stealth": {
      // 이미 은신 중이면 중복 사용 금지
      if ((unit.stealthUntilMs ?? 0) > nowMs) return false;
      const chancePm = Math.min(1000, t.cover * 100);
      return roll < chancePm;
    }
    case "detect": {
      if ((unit.detectUntilMs ?? 0) > nowMs) return false;
      const chancePm = Math.max(100, (10 - t.saveSkill) * 100);
      return roll < chancePm;
    }
    default:
      return true;
  }
}

/**
 * 7축 성향 + 사거리 → D-558 8전개 방식(assault·defend·center·flank·infiltrate·focus·harass·delay) 결정적 매핑.
 */
export function chooseCombatTacticFromTraits(traits: UnitTraits, range = 1): Tactic {
  if (traits.belligerence >= 700 && traits.boldness >= 650) return "assault";
  if (traits.belligerence <= 300 && traits.discipline >= 600) return "defend";
  if (traits.boldness <= 300 && traits.belligerence <= 450) return "delay";
  if (range >= 2 && traits.discipline >= 650 && traits.openness >= 550) return "harass";
  if (traits.autonomy >= 700 && traits.boldness >= 600 && range <= 2) return "infiltrate";
  if (traits.openness >= 650 && traits.boldness >= 550) return "flank";
  if (traits.communalism >= 650 && traits.discipline >= 600) return "focus";
  return "center";
}

/**
 * 맞으면 은신이 깨지나: 깨지지 않는다(기획 D-564 1583 "맞아도 은신 유지"). 공격·들킴으로만 깨진다 — 찾는 쪽은 감지·범위 공격을 쓴다
 * (범위 스킬은 보이지 않아도 맞는다 D-227). 규칙 값이라 AI가 바꾸지 않는다
 */
export const STEALTH_BREAKS_ON_DAMAGE = false;
