// 건물(시설) 상태·작업 — 메모리 모양, 부팅 때 읽기, 쓰기 대기열 줄(docs/adr/2026-11-07-buildings-runtime.md)
// 원본은 world_facilities·facility_jobs(db/facilitySchema.ts). 쓰는 프로세스가 하나라 메모리가 캐시이고 바뀜은 쓰기 대기열로 간다.
import { type LoadedBusiness, loadBusiness } from "../business/store.ts";
import type { QueryPool } from "../world/persist/load.ts";

/** 시설 한 줄(2차맵 건물 하나) */
export interface FacilityRecord {
  readonly buildingId: number;
  readonly facilityId: string;
  /** 다 지은 레벨(처음 짓는 동안 0) */
  level: number;
  /** 상태(ppm, 가득 1,000,000)와 그 값의 시각 */
  conditionPpm: number;
  conditionAtMs: number;
  readonly builtAtMs: number;
  readonly builtBy: string | null;
  /** 건물이 선 도시(재료를 꺼내는 도시 창고, D-516 361). 모르면 null(직전 판 앱이 넣은 줄 — 건물 서비스가 칸에서 다시 정한다) */
  cityId: number | null;
  /**
   * 세계 씨앗이 세운 시설(NPC 시작 도시·마을 기본 시설·성벽, 질문 1131 나 — 기획 D-535). 씨앗 숙소의 Lv1 침대는 인구 상한에 더하지 않는다(시작 도시
   * 상한 = 주거 그대로). 없으면 false(지은 시설)
   */
  seeded?: boolean | undefined;
  /**
   * 붙은 면적 모듈 수(건물 채집소 — 농장·목장·약초원, 기획 D-567 "모듈을 추가하여 건물의 목장이나 밭 등의 면적을 넓힌다"). 없으면 0
   */
  plots?: number | undefined;
  /**
   * 기르는 티어(건물 채집소, 기획 D-569 1761 "최고 티어 아래에서 골라 기름" — 0~최고, @terra/shared/gatherMath chosenGatherTier가 최고 티어로
   * 자른다). 없으면(null·undefined) 기본 = 최고 티어
   */
  gatherTier?: number | null | undefined;
}

/** 작업 종류. plot = 면적 모듈 붙이기(기획 D-569 1765 — 끝나면 모듈 + 1) */
export const JOB_KINDS = ["build", "upgrade", "repair", "beacon_repair", "equipment", "plot"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/** 재료 한 줄(아이템 ID·묶음 수량) */
export interface JobMaterial {
  readonly item: string;
  readonly qty: number;
  /**
   * 이 줄의 재료로 받는 아이템(첫째 = item, 기획 D-562 1563·1564 — 레벨 0 재료는 같은 원자재 종류 T0~T1). 없으면 item만. 저장하지 않는다(작업
   * 줄 jsonb는 item·qty만 — materialsOf)
   */
  readonly accepts?: readonly string[] | undefined;
}

/** 시간이 걸리는 작업 하나(끝나면 지운다) */
export interface JobRecord {
  readonly id: number;
  readonly kind: JobKind;
  readonly ownerId: number;
  readonly buildingId: number | null;
  readonly beaconId: number | null;
  readonly holdingId: number | null;
  readonly targetLevel: number | null;
  readonly restorePpm: number | null;
  readonly unitIds: readonly number[];
  readonly materials: readonly JobMaterial[];
  readonly startedAtMs: number;
  doneAtMs: number;
}

export interface LoadedFacilities {
  readonly facilities: readonly FacilityRecord[];
  readonly jobs: readonly JobRecord[];
  readonly maxJobId: number;
  /** 사업장 상태·판매 값(docs/adr/2026-11-15-business-ledger.md). 없으면 빈 것 */
  readonly business?: LoadedBusiness | undefined;
}

export const EMPTY_FACILITIES: LoadedFacilities = { facilities: [], jobs: [], maxJobId: 0 };

const isKind = (value: unknown): value is JobKind =>
  typeof value === "string" && (JOB_KINDS as readonly string[]).includes(value);

/** jsonb 재료 목록을 읽는다(모양이 틀린 줄은 버린다) */
function materialsOf(value: unknown): JobMaterial[] {
  if (!Array.isArray(value)) return [];
  const out: JobMaterial[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const item: unknown = Reflect.get(entry, "item");
    const qty: unknown = Reflect.get(entry, "qty");
    if (typeof item === "string" && typeof qty === "number" && Number.isSafeInteger(qty))
      out.push({ item, qty });
  }
  return out;
}

const numOrNull = (value: unknown): number | null => (value === null ? null : Number(value));

export async function loadFacilities(pool: QueryPool): Promise<LoadedFacilities> {
  const facilities = await pool.query(
    `select building_id, facility_id, level, condition_ppm, condition_at_ms, built_at_ms, built_by, city_id, seeded, plots,
            gather_tier
     from world_facilities order by building_id`,
  );
  const jobs = await pool.query(
    `select id, kind, owner_id, building_id, beacon_id, holding_id, target_level, restore_ppm, unit_ids, materials,
            started_at_ms, done_at_ms
     from facility_jobs order by id`,
  );
  const maxJob = await pool.query(`select coalesce(max(id), 0) as id from facility_jobs`);
  const business = await loadBusiness(pool);
  return {
    business,
    facilities: facilities.rows.map((row) => ({
      buildingId: Number(row.building_id),
      facilityId: String(row.facility_id),
      level: Number(row.level),
      conditionPpm: Number(row.condition_ppm),
      conditionAtMs: Number(row.condition_at_ms),
      builtAtMs: Number(row.built_at_ms),
      builtBy: typeof row.built_by === "string" ? row.built_by : null,
      cityId: numOrNull(row.city_id),
      ...(row.seeded === true ? { seeded: true } : {}),
      ...(Number(row.plots ?? 0) > 0 ? { plots: Number(row.plots) } : {}),
      ...(row.gather_tier === null || row.gather_tier === undefined
        ? {}
        : { gatherTier: Number(row.gather_tier) }),
    })),
    jobs: jobs.rows.flatMap((row) => {
      const kind: unknown = row.kind;
      if (!isKind(kind)) return [];
      const units: unknown = row.unit_ids;
      return [
        {
          id: Number(row.id),
          kind,
          ownerId: Number(row.owner_id),
          buildingId: numOrNull(row.building_id),
          beaconId: numOrNull(row.beacon_id),
          holdingId: numOrNull(row.holding_id),
          targetLevel: numOrNull(row.target_level),
          restorePpm: numOrNull(row.restore_ppm),
          unitIds: Array.isArray(units) ? units.map(Number) : [],
          materials: materialsOf(row.materials),
          startedAtMs: Number(row.started_at_ms),
          doneAtMs: Number(row.done_at_ms),
        },
      ];
    }),
    maxJobId: Number(maxJob.rows[0]?.id ?? 0),
  };
}

export const facilityRow = (record: FacilityRecord) => ({
  building_id: record.buildingId,
  facility_id: record.facilityId,
  level: record.level,
  condition_ppm: record.conditionPpm,
  condition_at_ms: record.conditionAtMs,
  built_at_ms: record.builtAtMs,
  built_by: record.builtBy,
  city_id: record.cityId,
  seeded: record.seeded === true,
  plots: Math.max(0, Math.trunc(record.plots ?? 0)),
  gather_tier:
    record.gatherTier === null || record.gatherTier === undefined ? null : Math.trunc(record.gatherTier),
});

export const jobRow = (job: JobRecord) => ({
  id: job.id,
  kind: job.kind,
  owner_id: job.ownerId,
  building_id: job.buildingId,
  beacon_id: job.beaconId,
  holding_id: job.holdingId,
  target_level: job.targetLevel,
  restore_ppm: job.restorePpm,
  unit_ids: [...job.unitIds],
  // pg가 배열을 Postgres 배열로 바꾸지 않게 JSON 글자로 넣는다(보유 물건 stats와 같다)
  materials: JSON.stringify(job.materials.map((stack) => ({ item: stack.item, qty: stack.qty }))),
  started_at_ms: job.startedAtMs,
  done_at_ms: job.doneAtMs,
});
