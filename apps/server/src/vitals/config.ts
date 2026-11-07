// 생명 수치 월드 설정 만들기(app.ts가 부른다) — 기획 D-512. 몸 자료는 유닛·사이보그 화면과 같은 셈(roster/body.ts)의 2차 스탯이다:
// 최대 = HP·아머 HP·쉴드 HP 행, 분당 회복 = 쉴드 재생 행(D-458). HP·아머 회복 행은 기획에 없어 0이다(질문 343·344).
// 부를 때마다 지금 카탈로그(가중치 표·설정 칸 실효 값)로 셈한다.
import type { RosterStats } from "@terra/shared/roster";
import { baselineBody } from "../roster/body.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import { realCyborgBody } from "../roster/cyborgBody.ts";
import type { VitalsBody } from "./state.ts";
import type { VitalsConfig } from "./world.ts";

/** 화면 2차 스탯 → 몸 자료 */
export function vitalsBodyOf(stats: RosterStats): VitalsBody {
  const value = (id: string): number => stats.secondary.find((row) => row.id === id)?.value ?? 0;
  return {
    max: {
      hp: Math.max(1, Math.floor(value("hp"))),
      armor: Math.max(0, Math.floor(value("armor_hp"))),
      shield: Math.max(0, Math.floor(value("shield_hp"))),
    },
    regen: { hp: 0, armor: 0, shield: Math.max(0, Math.floor(value("shield_regen"))) },
  };
}

export function vitalsConfigOf(roster: RosterCatalog | undefined): VitalsConfig | undefined {
  if (!roster) return undefined;
  return {
    cyborgBody: (record) => vitalsBodyOf(realCyborgBody(roster, record, false).stats),
    defaultBody: () => vitalsBodyOf(baselineBody(roster).stats),
  };
}
