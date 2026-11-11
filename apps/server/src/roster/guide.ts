// 유닛 추천 표(tRPC units.guide) — 사용자 요청 2026-11-11(1차 생산 직군·전투 클래스 추천), 기획 D-529, docs/adr/2026-11-11-production-six.md.
// 실효 팩(팩 + 세계 덮어쓰기: 생산 편집기에서 고친 스탯 짝·클래스 이름이 바로 든다)에서 1차 생산 여섯 가지와 전투 클래스 표를 만든다.
// 추천 셈은 화면이 @terra/shared/unitGuide 함수로 한다(스탯은 화면이 이미 가진 값). 표시만 하고 판정에 쓰지 않는다.
import type { CombatClassEntry, FacilityEntry } from "@terra/content";
import {
  type CombatClassRule,
  type CombatClassView,
  OLD_COMBAT_CLASS_RULE,
  type ProductionTypeView,
  type UnitGuideResponse,
  productionGroupOf,
} from "@terra/shared/unitGuide";
import { PRIMARY_STATS } from "@terra/shared/roster";

export interface UnitGuideSource {
  readonly facilities: readonly FacilityEntry[];
  readonly combatClasses: readonly CombatClassEntry[];
  /** 분류 문턱(설정 칸 실효 값). 없으면 옛 값 600·800 */
  readonly rule?: CombatClassRule | undefined;
}

/** 채집 칸이 있는 시설 = 1차 생산 종류(팩 차례) */
export function productionTypesOf(facilities: readonly FacilityEntry[]): ProductionTypeView[] {
  return facilities.flatMap((facility) => {
    const gather = facility.gather;
    if (!gather || facility.stage !== "gather") return [];
    return [
      {
        facility: facility.id,
        name: { ko: facility.name.ko, en: facility.name.en },
        primary: gather.primary,
        secondary: gather.secondary,
        mode: gather.mode ?? "roll",
        group: productionGroupOf(gather),
      },
    ];
  });
}

/** 전투 클래스 표(조합 스탯은 화면 스탯 차례) */
export function combatClassesOf(entries: readonly CombatClassEntry[]): CombatClassView[] {
  return entries.map((entry) => ({
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    stats: PRIMARY_STATS.filter((stat) => entry.stats.includes(stat)),
    ...(entry.group === undefined ? {} : { group: entry.group }),
    ...(entry.role === undefined ? {} : { role: { ko: entry.role.ko, en: entry.role.en } }),
    desc: { ko: entry.desc.ko, en: entry.desc.en },
  }));
}

/** 추천 표 응답. 출처가 없으면(팩 없는 시험 서버) 빈 표 */
export function unitGuideOf(source: UnitGuideSource | undefined, now: number): UnitGuideResponse {
  return {
    production: source ? productionTypesOf(source.facilities) : [],
    classes: source ? combatClassesOf(source.combatClasses) : [],
    classRule: source?.rule ?? OLD_COMBAT_CLASS_RULE,
    generatedAt: now,
  };
}
