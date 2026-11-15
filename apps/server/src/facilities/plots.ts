// 건물 채집소 면적 모듈 붙이기(facility_plot, 프로토콜 41) — 기획 D-567("허브약초원 농장 목장은 건물 채집소로 하자. 모둘을 추가하여 건물의
// 목장이나 밭 등의 면적을 넓힌다"), D-564 1681("같은 모듈 여러 개는 효과가 모두 겹침"), docs/adr/2026-11-15-gather-object-tiers.md
// "바뀜 (2026-11-15, D-566·D-567)".
// - 대상: 내 건물 채집소(팩 gather mode "select" — 농장·목장·약초원). 다 지은 것(레벨 1 이상)만.
// - 자리 = 레벨 × 설정 칸 plot_module_slots_per_level(@terra/shared/gatherMath plotSlots). 가득이면 plot_full.
// - 재료 = 그 시설 레벨 1 짓기 재료(레벨 0 재료 규칙 그대로 — 목재·석재 T0~T1을 받는다), 꺼내는 자리는 레벨 올리기와 같다(그 사업장 창고 → 그 도시
//   창고·창고 시설·그 2차맵 내 유닛 화물). 바로 붙는다(작업 시간 없음 [임시], 질문 1765). 운영자 모드는 재료 없이.
// - 효과는 산출 셈(labor/gatherWork.ts → @terra/sim workerEffects plots)이 읽는다: 수확 × (1000 + 모듈 수 × plot_module_area_pm) ÷ 1000.
// 판정(소유·자리·재료)은 여기서 하고 저장은 시설 줄(world_facilities.plots)이다 — 재료 빼기 거래와 같은 쓰기 묶음.
import { type BuildingGatherRules, plotSlots } from "@terra/shared/gatherMath";
import type { FacilityResultCode } from "@terra/protocol";
import type { FacilityRecord, JobMaterial } from "./state.ts";

/** 판정에 보는 시설 정의 칸(팩 gather mode) */
export interface PlotFacility {
  readonly gather?: { readonly mode?: string | undefined } | undefined;
}

export interface PlotDeps<D extends PlotFacility = PlotFacility> {
  readonly now: () => number;
  readonly ownerFor: (userId: string, at: number) => number | undefined;
  readonly myFacility: (
    me: number,
    buildingId: number,
  ) => { record: FacilityRecord; def: D } | FacilityResultCode;
  /** 그 레벨 짓기 재료(받는 아이템을 붙인 것) */
  readonly levelMaterials: (def: D, level: number) => JobMaterial[];
  /** 재료를 뺀다(모자라면 false) */
  readonly spend: (me: number, materials: readonly JobMaterial[], at: number, buildingId: number) => boolean;
  readonly save: (record: FacilityRecord) => void;
  readonly rules: () => BuildingGatherRules;
}

export type PlotResult = { readonly ok: true } | { readonly ok: false; readonly code: FacilityResultCode };

/** 건물 채집소인가(선택 방식 채집 시설) */
export const isPlotFacility = (def: PlotFacility | undefined): boolean => def?.gather?.mode === "select";

/** 면적 모듈 하나를 붙인다(머리 주석). operator = 운영자 모드(재료 없이) */
export function addPlot<D extends PlotFacility>(
  deps: PlotDeps<D>,
  userId: string,
  buildingId: number,
  operator: boolean,
): PlotResult {
  const at = deps.now();
  const me = deps.ownerFor(userId, at);
  if (me === undefined) return { ok: false, code: "busy" };
  const found = deps.myFacility(me, buildingId);
  if (typeof found === "string") return { ok: false, code: found };
  const { record, def } = found;
  if (!isPlotFacility(def)) return { ok: false, code: "not_facility" };
  if (record.level < 1) return { ok: false, code: "under_construction" };
  const plots = Math.max(0, Math.trunc(record.plots ?? 0));
  if (plots >= plotSlots(record.level, deps.rules())) return { ok: false, code: "plot_full" };
  const materials = operator ? [] : deps.levelMaterials(def, 1);
  if (!deps.spend(me, materials, at, buildingId)) return { ok: false, code: "insufficient_materials" };
  record.plots = plots + 1;
  deps.save(record);
  return { ok: true };
}
