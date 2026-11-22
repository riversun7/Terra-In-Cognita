// 주거 건물 층 올리기 공사 — 사용자 결정 D-591 1(질문 2535 나: "층을 올려 거주 수 증가" — 층은 건물 레벨과 따로 두고 층 올리기 공사로 늘린다).
// docs/adr/2026-11-15-business-ledger.md "바뀜 (residence-3, D-591)".
// - 대상: 내 주거 건물(팩 생활 단계 시설 — 지금 숙소 lodging 하나). 다 지은 것(레벨 1 이상)만. 처음 지은 건물은 1층(world_facilities.floors 기본값).
// - 사는 곳 정원 = 층 수 × 설정 칸 residence_capacity_per_floor(residenceCapacity — residence/attach.ts가 읽는다). 레벨은 정원에 들지 않는다.
// - 공사는 면적 모듈 붙이기(plots.ts)와 같은 길이다: 소유·작업 겹침·일꾼 확인 → 재료 빼기(레벨 올리기와 같은 자리 — 그 사업장 창고 → 그 도시 창고·창고 시설·
//   그 2차맵 내 유닛 화물) → 작업 줄(facility_jobs kind floor) → 끝나면 층 + 1(service.ts finish → addModule). 작업이 걸려 있으면 다른 작업은 job_running.
// - 재료·시간(기획이 정하지 않음 — [임시] 기술 기본값, 질문 2671): 그 건물 지금 레벨의 짓기 재료·짓는 시간(레벨 올리기와 같은 표) × 지금 층 수 × 설정 칸
//   residence_floor_cost_pm·residence_floor_time_pm ÷ 1000(재료는 줄마다 올림 — 높이 올릴수록 비싸다). 일꾼이 있으면 짓기처럼 시간이 준다.
// - 최고 층 = 설정 칸 residence_floor_max(넘으면 floor_full). 운영자 모드는 재료·시간 없이(면적 모듈과 같다).
// - 층을 내리는 길은 없다(철거 규칙 없음 — 질문 2671). NPC는 층을 올리지 않는다(기술 기본값 [임시]).
import type { FacilityResultCode } from "@terra/protocol";
import type { PlotDeps, PlotFacility, PlotResult } from "./plots.ts";
import type { FacilityRecord, JobMaterial } from "./state.ts";

/** 생활 단계 시설(숙소·집 — 팩 facilities stage "living") */
export const LIVING_STAGE = "living";

/** 설정 칸이 없을 때(옛 팩) — [임시] 기술 기본값 */
export const DEFAULT_RESIDENCE_CAPACITY_PER_FLOOR = 4;
export const DEFAULT_FLOOR_MAX = 5;
const DEFAULT_FLOOR_PM = 1000;

/** 층 규칙(설정 칸 — @terra/sim BusinessCoefficients의 같은 이름 칸) */
export interface FloorRules {
  readonly residenceCapacityPerFloor?: number | undefined;
  readonly residenceFloorMax?: number | undefined;
  readonly residenceFloorCostPm?: number | undefined;
  readonly residenceFloorTimePm?: number | undefined;
}

const whole = (value: number | undefined, fallback: number): number =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.trunc(value));

/** 시설 줄의 층 수(없거나 틀리면 1) */
export const floorsOf = (record: Pick<FacilityRecord, "floors">): number =>
  Math.max(1, Math.trunc(Number.isFinite(record.floors) ? (record.floors ?? 1) : 1));

/** 최고 층(1 아래로 내리지 않는다) */
export const floorMax = (rules: FloorRules): number =>
  Math.max(1, whole(rules.residenceFloorMax, DEFAULT_FLOOR_MAX));

/** 사는 곳 정원 = 층 수 × 층마다 유닛 수 */
export const residenceCapacity = (floors: number, rules: FloorRules): number =>
  Math.max(0, Math.trunc(floors)) *
  whole(rules.residenceCapacityPerFloor, DEFAULT_RESIDENCE_CAPACITY_PER_FLOOR);

/** 층 하나 올리는 재료: 지금 레벨 짓기 재료 × 지금 층 수 × 배율 ÷ 1000(줄마다 올림, 0이 된 줄은 뺀다) */
export function floorMaterials(
  levelMaterials: readonly JobMaterial[],
  floors: number,
  rules: FloorRules,
): JobMaterial[] {
  const scale = Math.max(1, Math.trunc(floors)) * whole(rules.residenceFloorCostPm, DEFAULT_FLOOR_PM);
  return levelMaterials
    .map((stack) => ({ ...stack, qty: Math.ceil((stack.qty * scale) / 1000) }))
    .filter((stack) => stack.qty > 0);
}

/** 층 하나 올리는 시간(일꾼 단축 전, ms): 지금 레벨 짓는 시간 × 지금 층 수 × 배율 ÷ 1000 */
export const floorMs = (levelMs: number, floors: number, rules: FloorRules): number =>
  Math.floor(
    (Math.max(0, levelMs) *
      Math.max(1, Math.trunc(floors)) *
      whole(rules.residenceFloorTimePm, DEFAULT_FLOOR_PM)) /
      1000,
  );

/** 판정에 보는 시설 정의 칸 */
export interface FloorFacility extends PlotFacility {
  readonly stage?: string | undefined;
}

/** 층을 하나 더 올릴 수 있나(주거 건물·다 지음·최고 층 아래). 된다면 null. 작업이 걸려 있는지는 부르는 쪽이 본다 */
export function floorOpen(
  record: FacilityRecord,
  def: FloorFacility | undefined,
  rules: FloorRules,
): FacilityResultCode | null {
  if (def?.stage !== LIVING_STAGE) return "not_facility";
  if (record.level < 1) return "under_construction";
  if (floorsOf(record) >= floorMax(rules)) return "floor_full";
  return null;
}

/** 끝난 면적 모듈·층 작업을 시설 줄에 적는다(service.ts finish — 저장은 부르는 쪽) */
export function addModule(record: FacilityRecord, kind: "plot" | "floor"): void {
  if (kind === "plot") record.plots = Math.max(0, Math.trunc(record.plots ?? 0)) + 1;
  else record.floors = floorsOf(record) + 1;
}

/** 층 하나 올리는 공사를 건다(머리 주석). operator = 운영자 모드(재료·시간 없이) */
export function addFloor<D extends FloorFacility>(
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
  const rules = deps.floorRules?.() ?? {};
  const closed = floorOpen(record, def, rules);
  if (closed) return { ok: false, code: closed };
  if (deps.jobRunning(buildingId)) return { ok: false, code: "job_running" };
  const unitProblem = deps.checkUnits(me, unitIds);
  if (unitProblem) return { ok: false, code: unitProblem };
  const floors = floorsOf(record);
  const materials = operator ? [] : floorMaterials(deps.levelMaterials(def, record.level), floors, rules);
  if (!deps.spend(me, materials, at, buildingId, "facility_floor"))
    return { ok: false, code: "insufficient_materials" };
  const ms = operator
    ? 0
    : deps.withBuilders(floorMs(deps.levelMs(def, record.level), floors, rules), unitIds.length);
  deps.startJob({
    kind: "floor",
    ownerId: me,
    buildingId,
    unitIds: [...unitIds],
    materials,
    startedAtMs: at,
    doneAtMs: at + ms,
  });
  return { ok: true, doneAtMs: at + ms };
}
