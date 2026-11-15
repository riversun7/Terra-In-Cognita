// 건물 채집소 면적 모듈·기르는 티어 — 기획 D-567("허브약초원 농장 목장은 건물 채집소로 하자. 모둘을 추가하여 건물의 목장이나 밭 등의 면적을
// 넓힌다"), D-564 1681("같은 모듈 여러 개는 효과가 모두 겹침"), D-569 1761("최고 티어 아래에서 골라 기름")·1765("모듈은 짓는 시간·재료", "모듈
// 떼기 가능"), docs/adr/2026-11-15-gather-object-tiers.md "바뀜 (2026-11-15, D-566·D-567)"·"바뀜 (D-569)".
// - 대상: 내 건물 채집소(팩 gather mode "select" — 농장·목장·약초원). 다 지은 것(레벨 1 이상)만.
// - 붙이기(facility_plot): 자리 = 레벨 × 설정 칸 plot_module_slots_per_level(@terra/shared/gatherMath plotSlots), 가득이면 plot_full. 재료 = 그
//   시설 레벨 1 짓기 재료(레벨 0 재료 규칙 그대로 — 목재·석재 T0~T1을 받는다), 꺼내는 자리는 레벨 올리기와 같다(그 사업장 창고 → 그 도시 창고·
//   창고 시설·그 2차맵 내 유닛 화물). 45부터 짓기처럼 작업(plot)이 걸린다: 시간 = 그 시설 레벨 1 짓는 시간 × 일꾼 단축(withBuilders), 일꾼은 내
//   유닛(없어도 된다). 끝나면 모듈 + 1(service.ts finish). 작업이 걸려 있는 동안 시설은 지금 모듈 수로 일하고, 다른 작업(레벨 올리기·수리)은 못
//   건다(job_running). 운영자 모드는 재료·시간 없이(D-564 1663).
// - 떼기(facility_plot_remove): 붙은 모듈 하나를 바로 뗀다. 재료는 돌려주지 않는다 [임시, 질문 1861 — 건물 철거 규칙이 없어 짓기에 쓴 재료는 다
//   쓴 것으로 친다(facilitySchema.ts 머리 주석 "작업에 쓴 재료는 돌려주지 않는다")]. 작업이 걸려 있으면 job_running.
// - 기르는 티어(facility_gather_tier): 0~최고 티어(2 × 레벨 − 1) 또는 null(기본 = 최고 티어, 레벨을 올리면 따라 오른다). 최고 위면 tier_locked.
//   산출 셈(labor/gatherWork.ts → @terra/sim workerEffects tier)이 읽는다.
// - NPC(npc/cityBuild.ts → 건물 서비스 npcJob kind plot, D-569 1768)도 같은 자리 규칙(plotOpen)과 같은 작업 줄을 쓴다.
// 판정(소유·자리·재료)은 여기서 하고 저장은 시설 줄(world_facilities.plots·gather_tier)·작업 줄(facility_jobs kind plot)이다 — 재료 빼기 거래와
// 같은 쓰기 묶음.
import { type BuildingGatherRules, buildingGatherTier, plotSlots } from "@terra/shared/gatherMath";
import type { FacilityResultCode } from "@terra/protocol";
import type { FacilityRecord, JobMaterial } from "./state.ts";

/** 건물 서비스의 면적 모듈·기르는 티어 명령(FacilityService가 잇는다). 결과는 커밋 뒤에 답한다 */
export interface PlotCommands {
  /** 면적 모듈 붙이기(짓기처럼 작업). operator = 운영자 모드(재료·시간 없이) */
  plot(
    userId: string,
    buildingId: number,
    unitIds: readonly number[],
    operator?: { readonly pace: number },
  ): Promise<PlotResult>;
  /** 면적 모듈 하나 떼기 */
  plotRemove(userId: string, buildingId: number): Promise<PlotResult>;
  /** 기를 티어 고르기(null = 기본) */
  gatherTier(userId: string, buildingId: number, tier: number | null): Promise<PlotResult>;
}

/** 모듈 작업 줄의 고정 칸(종류 plot, 대상 = 건물) */
export const PLOT_JOB = {
  kind: "plot",
  beaconId: null,
  holdingId: null,
  targetLevel: null,
  restorePpm: null,
} as const;

/** 판정에 보는 시설 정의 칸(팩 gather mode) */
export interface PlotFacility {
  readonly gather?: { readonly mode?: string | undefined } | undefined;
}

/** 모듈 붙이기 작업 하나(건물 서비스가 작업 줄로 만든다) */
export interface PlotJobInput {
  readonly ownerId: number;
  readonly buildingId: number;
  readonly unitIds: readonly number[];
  readonly materials: readonly JobMaterial[];
  readonly startedAtMs: number;
  readonly doneAtMs: number;
}

export interface PlotDeps<D extends PlotFacility = PlotFacility> {
  readonly now: () => number;
  readonly ownerFor: (userId: string, at: number) => number | undefined;
  readonly myFacility: (
    me: number,
    buildingId: number,
  ) => { record: FacilityRecord; def: D } | FacilityResultCode;
  /** 그 레벨 짓기 재료(받는 아이템을 붙인 것)·짓는 시간(일꾼 단축 전, ms) */
  readonly levelMaterials: (def: D, level: number) => JobMaterial[];
  readonly levelMs: (def: D, level: number) => number;
  /** 일꾼 수만큼 줄인 시간(@terra/shared/facilityRuntime withBuilders) */
  readonly withBuilders: (ms: number, builders: number) => number;
  /** 일꾼 확인(내 유닛·겹치지 않음·다른 작업 아님). 문제없으면 null */
  readonly checkUnits: (me: number, unitIds: readonly number[]) => FacilityResultCode | null;
  /** 그 건물에 작업(장비 수리 빼고)이 걸려 있나 */
  readonly jobRunning: (buildingId: number) => boolean;
  /** 재료를 뺀다(모자라면 false) */
  readonly spend: (me: number, materials: readonly JobMaterial[], at: number, buildingId: number) => boolean;
  /** 모듈 붙이기 작업을 건다(시간 0이면 바로 끝낸다) */
  readonly startJob: (job: PlotJobInput) => void;
  readonly save: (record: FacilityRecord) => void;
  readonly rules: () => BuildingGatherRules;
}

export type PlotResult =
  | { readonly ok: true; readonly doneAtMs?: number }
  | { readonly ok: false; readonly code: FacilityResultCode };

/** 건물 채집소인가(선택 방식 채집 시설) */
export const isPlotFacility = (def: PlotFacility | undefined): boolean => def?.gather?.mode === "select";

/**
 * 모듈을 하나 더 붙일 수 있나(플레이어·NPC 같은 규칙): 건물 채집소·다 지음·자리 남음. 된다면 null, 아니면 결과 코드. 작업이 걸려 있는지는 부르는
 * 쪽이 본다
 */
export function plotOpen(
  record: FacilityRecord,
  def: PlotFacility | undefined,
  rules: BuildingGatherRules,
): FacilityResultCode | null {
  if (!isPlotFacility(def)) return "not_facility";
  if (record.level < 1) return "under_construction";
  if (Math.max(0, Math.trunc(record.plots ?? 0)) >= plotSlots(record.level, rules)) return "plot_full";
  return null;
}

/** 면적 모듈 하나를 붙이는 작업을 건다(머리 주석). operator = 운영자 모드(재료·시간 없이) */
export function addPlot<D extends PlotFacility>(
  deps: PlotDeps<D>,
  userId: string,
  buildingId: number,
  unitIds: readonly number[],
  operator: boolean,
): PlotResult {
  const at = deps.now();
  const me = deps.ownerFor(userId, at);
  if (me === undefined) return { ok: false, code: "busy" };
  const found = deps.myFacility(me, buildingId);
  if (typeof found === "string") return { ok: false, code: found };
  const { record, def } = found;
  const closed = plotOpen(record, def, deps.rules());
  if (closed) return { ok: false, code: closed };
  if (deps.jobRunning(buildingId)) return { ok: false, code: "job_running" };
  const unitProblem = deps.checkUnits(me, unitIds);
  if (unitProblem) return { ok: false, code: unitProblem };
  const materials = operator ? [] : deps.levelMaterials(def, 1);
  if (!deps.spend(me, materials, at, buildingId)) return { ok: false, code: "insufficient_materials" };
  const ms = operator ? 0 : deps.withBuilders(deps.levelMs(def, 1), unitIds.length);
  deps.startJob({
    ownerId: me,
    buildingId,
    unitIds: [...unitIds],
    materials,
    startedAtMs: at,
    doneAtMs: at + ms,
  });
  return { ok: true, doneAtMs: at + ms };
}

/** 면적 모듈 하나를 바로 뗀다(머리 주석 — 재료는 돌려주지 않는다) */
export function removePlot<D extends PlotFacility>(
  deps: PlotDeps<D>,
  userId: string,
  buildingId: number,
): PlotResult {
  const at = deps.now();
  const me = deps.ownerFor(userId, at);
  if (me === undefined) return { ok: false, code: "busy" };
  const found = deps.myFacility(me, buildingId);
  if (typeof found === "string") return { ok: false, code: found };
  const { record, def } = found;
  if (!isPlotFacility(def)) return { ok: false, code: "not_facility" };
  const plots = Math.max(0, Math.trunc(record.plots ?? 0));
  if (plots <= 0) return { ok: false, code: "no_plot" };
  if (deps.jobRunning(buildingId)) return { ok: false, code: "job_running" };
  record.plots = plots - 1;
  deps.save(record);
  return { ok: true };
}

/** 기르는 티어를 고른다(null = 기본 최고 티어). 최고 티어 위면 tier_locked */
export function chooseTier<D extends PlotFacility>(
  deps: PlotDeps<D>,
  userId: string,
  buildingId: number,
  tier: number | null,
): PlotResult {
  const at = deps.now();
  const me = deps.ownerFor(userId, at);
  if (me === undefined) return { ok: false, code: "busy" };
  const found = deps.myFacility(me, buildingId);
  if (typeof found === "string") return { ok: false, code: found };
  const { record, def } = found;
  if (!isPlotFacility(def)) return { ok: false, code: "not_facility" };
  if (record.level < 1) return { ok: false, code: "under_construction" };
  if (tier !== null && (tier < 0 || tier > buildingGatherTier(record.level)))
    return { ok: false, code: "tier_locked" };
  record.gatherTier = tier;
  deps.save(record);
  return { ok: true };
}
