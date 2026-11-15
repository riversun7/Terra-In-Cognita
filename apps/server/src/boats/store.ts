// 배 저장(src/db/boatSchema.ts) — docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)", docs/adr/2026-11-15-shipyard-harbor.md(배 체계 개편).
// - boat_jobs: 조선소 작업(만들기·수리). 옛 줄(kind 없음)은 만들기다.
// - boat_states: 배마다 종류·내구도·집 정박장·정박료·교역 부두 머묾.
// - boat_facilities: 배 시설 주인 설정(받기 범위·요금·조선소 모듈).
// 쓰기는 월드 쓰기 대기열(재료 빼기와 같은 묶음), 읽기는 배 서비스를 만들 때(부팅 복구 뒤) 한 번.
import {
  DEFAULT_HARBOR_ACCESS,
  HARBOR_ACCESS,
  type HarborAccess,
  HULL_FULL,
  SHIPYARD_MODULES,
  type ShipyardModule,
} from "@terra/shared/harbor";
import type { JobMaterial } from "../facilities/state.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 조선소 작업 한 줄 */
export interface BoatJob {
  readonly id: number;
  readonly ownerId: number;
  /** 조선소(2차맵 건물 ID) */
  readonly buildingId: number;
  /** 뺀 재료(기록용 — 돌려주지 않는다, 기획 D-545 1405 "돌려주지 않음". 그래서 뺀 자리는 적지 않는다) */
  readonly materials: readonly JobMaterial[];
  readonly startedAtMs: number;
  readonly doneAtMs: number;
  /** build = 만들기, repair = 수리(D-547 1494). 옛 줄은 build */
  readonly kind: "build" | "repair";
  /** 만드는 배 종류(옛 줄은 null — 처음 종류로 뜬다) */
  readonly typeId: string | null;
  /** 수리하는 배(만들기는 null) */
  readonly boatId: number | null;
}

/** 배 하나의 상태 */
export interface BoatState {
  readonly boatId: number;
  typeId: string;
  /** hullAtMs 때의 내구도(ppm) */
  hullPpm: number;
  hullAtMs: number;
  /** 집 정박장(없으면 null) */
  homeId: number | null;
  /** 남의 정박장 정박료를 낸 시각(내 정박장·집 없음은 null) */
  feePaidToMs: number | null;
  /** 못 낸 날 수 */
  arrears: number;
  /** 머무는 교역 부두(없으면 null)와 산 시간 끝·초과 요금을 낸 시각 */
  tradeId: number | null;
  tradeUntilMs: number | null;
  tradeChargedToMs: number | null;
}

/** 배 시설 주인 설정 */
export interface BoatFacility {
  readonly buildingId: number;
  access: HarborAccess;
  fee: number;
  module: ShipyardModule | null;
}

/** jsonb 재료 목록(모양이 틀린 줄은 버린다). B3 줄에 있던 뺀 자리(location)는 읽지 않는다 */
export function materialsOf(value: unknown): JobMaterial[] {
  const raw: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(raw)) return [];
  const out: JobMaterial[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item: unknown = Reflect.get(entry, "item");
    const qty: unknown = Reflect.get(entry, "qty");
    if (typeof item === "string" && typeof qty === "number" && Number.isSafeInteger(qty))
      out.push({ item, qty });
  }
  return out;
}

const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const accessOf = (value: unknown): HarborAccess =>
  HARBOR_ACCESS.find((access) => access === value) ?? DEFAULT_HARBOR_ACCESS;

const moduleOf = (value: unknown): ShipyardModule | null =>
  SHIPYARD_MODULES.find((module) => module === value) ?? null;

/** 그 행성의 조선소 작업(ID 차례) */
export async function loadBoatJobs(pool: QueryPool, planetId: string): Promise<BoatJob[]> {
  const found = await pool.query(
    `select id, owner_id, building_id, materials, started_at_ms, done_at_ms, kind, type_id, boat_id
     from boat_jobs where planet_id = $1 order by id`,
    [planetId],
  );
  return found.rows.map((row) => ({
    id: Number(row.id),
    ownerId: Number(row.owner_id),
    buildingId: Number(row.building_id),
    materials: materialsOf(row.materials),
    startedAtMs: Number(row.started_at_ms),
    doneAtMs: Number(row.done_at_ms),
    kind: row.kind === "repair" ? "repair" : "build",
    typeId: typeof row.type_id === "string" ? row.type_id : null,
    boatId: numOrNull(row.boat_id),
  }));
}

/** 그 행성의 배 상태(배 ID 차례) */
export async function loadBoatStates(pool: QueryPool, planetId: string): Promise<BoatState[]> {
  const found = await pool.query(
    `select boat_id, type_id, hull_ppm, hull_at_ms, home_id, fee_paid_to_ms, arrears, trade_id, trade_until_ms,
       trade_charged_to_ms from boat_states where planet_id = $1 order by boat_id`,
    [planetId],
  );
  return found.rows.map((row) => ({
    boatId: Number(row.boat_id),
    typeId: String(row.type_id),
    hullPpm: Math.max(0, Math.min(HULL_FULL, Number(row.hull_ppm))),
    hullAtMs: Number(row.hull_at_ms),
    homeId: numOrNull(row.home_id),
    feePaidToMs: numOrNull(row.fee_paid_to_ms),
    arrears: Number(row.arrears),
    tradeId: numOrNull(row.trade_id),
    tradeUntilMs: numOrNull(row.trade_until_ms),
    tradeChargedToMs: numOrNull(row.trade_charged_to_ms),
  }));
}

/** 그 행성의 배 시설 설정 */
export async function loadBoatFacilities(pool: QueryPool, planetId: string): Promise<BoatFacility[]> {
  const found = await pool.query(
    `select building_id, access, fee, module from boat_facilities where planet_id = $1 order by building_id`,
    [planetId],
  );
  return found.rows.map((row) => ({
    buildingId: Number(row.building_id),
    access: accessOf(row.access),
    fee: Math.max(0, Number(row.fee)),
    module: moduleOf(row.module),
  }));
}

/** 유닛 줄이 없는 배의 상태 줄을 지운다(부팅 때 — 띄우지 않은 2차맵의 배는 유닛 줄이 있어 남는다). 지운 수 */
export async function pruneBoatStates(pool: QueryPool, planetId: string): Promise<number> {
  const found = await pool.query(
    `delete from boat_states s where s.planet_id = $1
       and not exists (select 1 from world_units u where u.id = s.boat_id) returning boat_id`,
    [planetId],
  );
  return found.rows.length;
}

/** 쓰기 대기열 고리(없으면 메모리에만) */
export function boatJobWriter(writer: Pick<WorldWriter, "upsert" | "remove"> | undefined, planetId: string) {
  return {
    save(job: BoatJob): void {
      writer?.upsert("boatJobs", {
        id: job.id,
        owner_id: job.ownerId,
        building_id: job.buildingId,
        planet_id: planetId,
        // pg가 배열을 Postgres 배열로 바꾸지 않게 JSON 글자로 넣는다(건물 작업 재료와 같다)
        materials: JSON.stringify(job.materials),
        started_at_ms: job.startedAtMs,
        done_at_ms: job.doneAtMs,
        kind: job.kind,
        type_id: job.typeId,
        boat_id: job.boatId,
      });
    },
    remove(id: number): void {
      writer?.remove("boatJobs", { id });
    },
    saveState(state: BoatState): void {
      writer?.upsert("boatStates", {
        boat_id: state.boatId,
        planet_id: planetId,
        type_id: state.typeId,
        hull_ppm: state.hullPpm,
        hull_at_ms: state.hullAtMs,
        home_id: state.homeId,
        fee_paid_to_ms: state.feePaidToMs,
        arrears: state.arrears,
        trade_id: state.tradeId,
        trade_until_ms: state.tradeUntilMs,
        trade_charged_to_ms: state.tradeChargedToMs,
      });
    },
    removeState(boatId: number): void {
      writer?.remove("boatStates", { boat_id: boatId });
    },
    saveFacility(row: BoatFacility): void {
      writer?.upsert("boatFacilities", {
        building_id: row.buildingId,
        planet_id: planetId,
        access: row.access,
        fee: row.fee,
        module: row.module,
      });
    },
  };
}

export type BoatStore = ReturnType<typeof boatJobWriter>;
