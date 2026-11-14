// 낚시터 물 종류 이름 — 기획 D-542(질문 1365 나), @terra/shared/fishWater. 사이보그 판 효율 줄·유닛 추천·생산 편집기 "예상 확률" 탭이 같이 쓴다.
import type { FishWater, FishWaterRangeView } from "@terra/shared/fishWater";
import { m } from "../paraglide/messages.js";

const NAMES: Readonly<Record<FishWater, () => string>> = {
  fresh: m.fish_water_fresh,
  coast: m.fish_water_coast,
  shelf: m.fish_water_shelf,
  deep: m.fish_water_deep,
};

export function fishWaterName(water: FishWater): string {
  return NAMES[water]();
}

/** "민물 T0~T2 · 연안 T0~T4 · …" */
export function fishWaterRangesText(ranges: readonly FishWaterRangeView[]): string {
  return ranges
    .map((range) =>
      m.unit_advice_job_water_range({ water: fishWaterName(range.water), min: range.min, max: range.max }),
    )
    .join(" · ");
}
