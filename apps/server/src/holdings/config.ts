// 보유 물건 월드 설정 만들기(app.ts가 부른다) — docs/adr/2026-11-03-item-holdings.md 4절.
// 실효 콘텐츠(팩 + 그 세계의 덮어쓰기, 아이템 편집기가 바꾸면 바로 든다), 설정 칸 실효 값(닳기·효과량 상한·오차·수리·보존 배율),
// 가중치 표 실효 값(수리 장인 실력의 제작 직무 행, 밸런스 화면 덮어쓰기),
// 쓰는 유닛의 1차 스탯(사이보그 화면·유닛 상세와 같은 셈: 성장 + 입은 장비 + 1차 스탯 버프, roster/unitBody.ts)을 부를 때마다 읽는다.
import { combatCoefficientsFrom } from "@terra/sim";
import type { ContentEditState } from "../contentEdit/state.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import { BASELINE_BASE, effectiveView, primariesOfStats } from "../roster/unitBody.ts";
import type { TuningState } from "../tuning/state.ts";
import { holdingRulesFrom } from "./rules.ts";
import type { HoldingsConfig } from "./world.ts";

export function holdingsConfigOf(options: {
  readonly content: ContentEditState | undefined;
  readonly tuning: TuningState | undefined;
  readonly roster: RosterCatalog | undefined;
}): HoldingsConfig | undefined {
  const { content, tuning, roster } = options;
  if (!content) return undefined;
  return {
    content: () => content.effective(),
    rules: tuning
      ? () =>
          holdingRulesFrom(
            tuning.values(),
            combatCoefficientsFrom(tuning.values(), undefined, tuning.combatFormulas()).appropriateCapPm,
            tuning.society(),
          )
      : undefined,
    statTable: tuning ? () => tuning.statTable() : undefined,
    cyborgPrimaries: roster
      ? (record, gear) => primariesOfStats(effectiveView(roster, { kind: "cyborg", record }, gear).stats)
      : undefined,
    defaultPrimaries: roster
      ? (gear, base) => primariesOfStats(effectiveView(roster, base ?? BASELINE_BASE, gear).stats)
      : undefined,
  };
}
