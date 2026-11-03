// 보유 물건 월드 설정 만들기(app.ts가 부른다) — docs/adr/2026-11-03-item-holdings.md 4절.
// 실효 콘텐츠(팩 + 그 세계의 덮어쓰기, 아이템 편집기가 바꾸면 바로 든다), 설정 칸 실효 값(닳기·효과량 상한·오차·수리),
// 사이보그 본체의 1차 스탯(유닛 화면과 같은 셈: 성장 + 장비)을 부를 때마다 읽는다.
import { combatCoefficientsFrom } from "@terra/sim";
import type { ContentEditState } from "../contentEdit/state.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import { realCyborgBody } from "../roster/cyborgBody.ts";
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
    cyborgPrimaries: roster
      ? (record) => {
          const { primaries } = realCyborgBody(roster, record, false).stats;
          return {
            str: primaries.str.base + primaries.str.bonus,
            dex: primaries.dex.base + primaries.dex.bonus,
            agi: primaries.agi.base + primaries.agi.bonus,
            vit: primaries.vit.base + primaries.vit.bonus,
            int: primaries.int.base + primaries.int.bonus,
            wis: primaries.wis.base + primaries.wis.bonus,
          };
        }
      : undefined,
  };
}
