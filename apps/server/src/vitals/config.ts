// 생명 수치 월드 설정 만들기(app.ts가 부른다) — 기획 D-512·D-514. 몸 자료는 유닛·사이보그 화면과 같은 셈(roster/unitBody.ts — 입은 장비·
// 1차 스탯 버프·부상 불이익 포함, docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07 …)")의 2차 스탯이다:
// 최대 = HP·아머 HP·쉴드 HP 행, 분당 회복 = HP 회복 행(D-514)·최대 아머 × 설정 칸 n54_armor_regen ‰(D-514)·쉴드 재생 행(D-458).
// 부상 단계별 HP 회복 속도(n54_injury_regen_1~3)는 세력·사회 계수표 vitals 칸이다.
// 부를 때마다 지금 카탈로그(가중치 표·설정 칸 실효 값)로 셈한다.
import type { RosterStats } from "@terra/shared/roster";
import { TEST_SOCIETY_COEFFICIENTS, armorRegenOf, type CombatCoefficients } from "@terra/sim";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { TuningState } from "../tuning/state.ts";
import { BASELINE_BASE, effectiveView } from "../roster/unitBody.ts";
import type { VitalsBody } from "./state.ts";
import type { VitalsConfig } from "./world.ts";

/** 화면 2차 스탯 → 몸 자료(아머 회복 = 최대 아머 × 계수표 armorRegenPm, 전투 사양 specFromStats와 같다) */
export function vitalsBodyOf(
  stats: RosterStats,
  coefficients?: Pick<CombatCoefficients, "armorRegenPm">,
): VitalsBody {
  const value = (id: string): number => stats.secondary.find((row) => row.id === id)?.value ?? 0;
  const armor = Math.max(0, Math.floor(value("armor_hp")));
  return {
    max: {
      hp: Math.max(1, Math.floor(value("hp"))),
      armor,
      shield: Math.max(0, Math.floor(value("shield_hp"))),
    },
    regen: {
      hp: Math.max(0, Math.floor(value("hp_regen"))),
      armor: coefficients ? armorRegenOf(armor, coefficients) : 0,
      shield: Math.max(0, Math.floor(value("shield_regen"))),
    },
  };
}

export function vitalsConfigOf(
  roster: RosterCatalog | undefined,
  tuning?: TuningState | undefined,
): VitalsConfig | undefined {
  if (!roster) return undefined;
  return {
    cyborgBody: (record, gear) =>
      vitalsBodyOf(effectiveView(roster, { kind: "cyborg", record }, gear).stats, roster.coefficients),
    defaultBody: (gear) =>
      vitalsBodyOf(effectiveView(roster, BASELINE_BASE, gear).stats, roster.coefficients),
    rules: () => (tuning ? tuning.society().vitals : TEST_SOCIETY_COEFFICIENTS.vitals),
  };
}
