// 다시보기 문구 — 리플레이 자료(이름·역할·스킬·효과)와 사건을 화면 글자로. 문구는 메시지 키(ko·en)다.
// 유닛 이름은 자료(사용자·팩 이름)라 그대로 쓰고, 없으면 #ID. 스킬·효과는 리플레이 표의 이름(ko·en), 없으면 ID.
import type { BattleReplay, ReplayEndReason } from "@terra/protocol/battleReplay";
import { m } from "../paraglide/messages.js";

export type Locale = "ko" | "en";

const SIDE_LETTERS = "ABCDEFGH";

export function unitLabel(replay: BattleReplay, index: number): string {
  const unit = replay.units[index];
  if (!unit) return "?";
  return unit.name === "" ? `#${unit.id}` : unit.name;
}

/** 역할·종류 코드 → 이름(모르는 코드는 그대로) */
export function roleName(kind: string): string {
  switch (kind) {
    case "warrior":
      return m.battle_role_warrior();
    case "guardian":
      return m.battle_role_guardian();
    case "mage":
      return m.battle_role_mage();
    case "priest":
      return m.battle_role_priest();
    case "cyborg":
      return m.battle_role_cyborg();
    case "unit":
      return m.battle_role_unit();
    default:
      return kind;
  }
}

export function skillName(replay: BattleReplay, index: number, locale: Locale): string {
  const skill = replay.skills[index];
  if (!skill) return "?";
  return skill.name ? skill.name[locale] : skill.id;
}

export function effectName(replay: BattleReplay, index: number, locale: Locale): string {
  const effect = replay.effects[index];
  if (!effect) return "?";
  return effect.name ? effect.name[locale] : effect.id;
}

/** 편 글자(편 표 차례 A·B…) */
export function sideLetter(replay: BattleReplay, side: number): string {
  const index = replay.sides.findIndex((entry) => entry.id === side);
  return SIDE_LETTERS[index] ?? String(side);
}

export function sideName(replay: BattleReplay, side: number): string {
  return m.battle_side({ letter: sideLetter(replay, side) });
}

export function reasonText(reason: ReplayEndReason): string {
  switch (reason) {
    case "wipe":
      return m.battle_reason_wipe();
    case "timeout":
      return m.battle_reason_timeout();
    case "nexus":
      return m.battle_reason_nexus();
    default: {
      const unknown: never = reason;
      return String(unknown);
    }
  }
}

/** 기록 판 한 줄(사건 번호). 기록하지 않는 사건이면 null */
export function logLine(replay: BattleReplay, index: number, locale: Locale): string | null {
  const event = replay.events[index];
  if (!event) return null;
  const name = (unit: number) => unitLabel(replay, unit);
  switch (event.k) {
    case "attack":
    case "skillHit": {
      const source = name(event.u);
      const target = name(event.target);
      if (event.outcome === "miss") return m.battle_log_miss({ source, target });
      if (event.outcome === "evade") return m.battle_log_evade({ source, target });
      const amount = event.physical + event.elemental;
      if (event.k === "skillHit")
        return m.battle_log_skill_hit({
          source,
          target,
          amount,
          skill: skillName(replay, event.skill, locale),
        });
      return event.crit
        ? m.battle_log_crit({ source, target, amount })
        : m.battle_log_hit({ source, target, amount });
    }
    case "skill":
      return m.battle_log_skill({ source: name(event.u), skill: skillName(replay, event.skill, locale) });
    case "heal":
      // 쉴드만 채운 회복(빛 보호막 등)은 쉴드 줄
      if (event.amount <= 0 && event.shieldGain > 0)
        return m.battle_log_shield({
          source: name(event.u),
          target: name(event.target),
          amount: event.shieldGain,
        });
      return m.battle_log_heal({ source: name(event.u), target: name(event.target), amount: event.amount });
    case "down":
      return m.battle_log_down({ unit: name(event.u) });
    case "retreat":
      return m.battle_log_retreat({ unit: name(event.u) });
    case "interrupt":
      return m.battle_log_interrupt({ unit: name(event.u), skill: skillName(replay, event.skill, locale) });
    case "fizzle":
      return m.battle_log_fizzle({ unit: name(event.u), skill: skillName(replay, event.skill, locale) });
    case "effectOn":
      return m.battle_log_effect({
        target: name(event.target),
        effect: effectName(replay, event.effect, locale),
      });
    case "end":
      return m.battle_log_end({ side: sideName(replay, event.winner), reason: reasonText(event.reason) });
    default:
      return null;
  }
}
