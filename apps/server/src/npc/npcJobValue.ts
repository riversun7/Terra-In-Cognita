// NPC 시설 일자리의 임금 기준 값 — npc/npcJobs.ts 머리 주석. 기준 유닛(임금 식의 효율점수 = 1차 스탯 여섯이 모두 그 값, labor/rules.ts)이 그 시설에서
// 한 시간에 캐는 물건의 기대 금액을 사이보그 판 채집 예상과 같은 셈(roster/gatherSheet.ts → gatherValue.ts: 티어 확률 × 그 티어 아이템 시세 × 수확량 ÷
// 필요 진행 시간)으로 낸다. 시세 = 그 도시 거래소 마지막 체결가, 없으면 팩 시작 시세. 컨디션은 0으로 센다(낮게 잡는 쪽).
import type { PrimaryStat } from "@terra/shared/roster";
import type { SocietyCoefficients } from "@terra/sim";
import { wageRulesOf } from "../labor/rules.ts";
import { type GatherSheetSource, gatherSheetOf } from "../roster/gatherSheet.ts";

/** 금액 배율: 시세를 이만큼 곱해 세고 그대로 돌려준다(시간당 값이 1~2 단위라 내림 오차가 크다 — 밀리 단위) */
export const NPC_JOB_VALUE_SCALE = 1000;

/**
 * 시설 하나의 시간당 기대 금액 × NPC_JOB_VALUE_SCALE(그 도시 화폐 최소 단위의 밀리). 채집 시설이 아니거나 값을 셀 수 없으면 undefined
 */
export type NpcJobValue = (
  site: { readonly facility: string; readonly level: number; readonly plots?: number | undefined },
  lastPrice: (item: string) => bigint | undefined,
) => bigint | undefined;

export function npcJobValueOf(
  source: () => Omit<GatherSheetSource, "place">,
  society: () => SocietyCoefficients,
): NpcJobValue {
  // 시작 시세를 배율만큼 키운 아이템 목록(팩 목록이 바뀔 때만 다시 만든다)
  let scaledFrom: GatherSheetSource["items"];
  let scaled: GatherSheetSource["items"];
  const scale = BigInt(NPC_JOB_VALUE_SCALE);
  return (site, lastPrice) => {
    const rules = society();
    const base = source();
    if (base.items !== scaledFrom) {
      scaledFrom = base.items;
      scaled = base.items?.map((item) => ({ ...item, startPrice: item.startPrice * NPC_JOB_VALUE_SCALE }));
    }
    const stat = wageRulesOf(rules).efficiency;
    const stats: Record<PrimaryStat, number> = {
      str: stat,
      vit: stat,
      int: stat,
      wis: stat,
      dex: stat,
      agi: stat,
    };
    const rows = gatherSheetOf(
      {
        ...base,
        items: scaled,
        place: () => ({
          workplace: { facility: site.facility, level: site.level, plots: site.plots },
          lastPrice: (item) => {
            const last = lastPrice(item);
            return last === undefined ? undefined : last * scale;
          },
        }),
      },
      stats,
      0,
      rules,
      0,
    );
    const value = rows.find((row) => row.facility === site.facility)?.valuePerHour;
    return value === undefined ? undefined : BigInt(value);
  };
}
