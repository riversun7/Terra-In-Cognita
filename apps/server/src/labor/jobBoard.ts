// 구인 게시판(서버) — 남의 유닛을 임금형으로 고용. docs/adr/2026-11-03-labor-contracts.md "바뀜 (기획 338~342·구인 게시판)"
// 규칙(게시·받기·자리)은 @terra/sim economy/laborJobs.ts 한 벌이고, 여기는 소유·존재 확인, 저장, 화면 자료다(service.ts가 묶는다).
// - 시설마다 열린 게시 하나(옛 production_building_config 한 줄과 같은 자리). 다시 내면 앞 게시는 withdrawn(맺은 계약은 그대로).
// - 받기: 고용주(시설 주인)와 받는 쪽을 지금까지 정산한 뒤(상호작용 전 정산) 임금형 계약을 맺는다 → 보증금(고용주 지갑) 거래·계약·
//   게시 줄이 같은 동기 처리 = 같은 커밋. 시설이 사라졌거나 주인이 바뀐 게시는 받을 때 gone으로 닫는다(화면 목록에서는 뺀다).
// - 도시: [임시] 시설 기준 칸에서 가장 가까운 도시(같은 2차맵, 부팅 때 읽은 도시 목록). 도시 노동 시장 단가(D-432)가 아직 없어
//   도시마다 단가가 같고(rules.ts), 도시는 게시판 거르기에만 쓴다.
// - 받기는 유닛이 그 시설과 같은 2차맵에 있어야 한다(wrong_map, docs/adr/2026-11-07-play-flow.md "WP8" 522 ①).
import type { LaborResultCode } from "@terra/protocol";
import { LABOR_JOBS_LIMIT, type LaborJobView, type LaborJobsResponse } from "@terra/shared/labor";
import {
  type LaborAccounts,
  type LaborContract,
  type LaborJob,
  type LaborJobFailure,
  acceptLaborJob,
  closeLaborJob,
  laborJobWage,
  postLaborJob,
  requiredDeposit,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { CityRow } from "../world/cities.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import type { WageRules } from "./rules.ts";
import { jobRow } from "./store.ts";

export type JobCommandResult =
  | { ok: true; contractId?: number; jobId?: number }
  | { ok: false; code: LaborResultCode };

export interface LaborPostInput {
  readonly buildingId: number;
  readonly adjustPm: number;
  readonly slots: number;
  readonly termHours?: number | undefined;
}

export interface JobBoardFilter {
  readonly cityId?: number | undefined;
  readonly buildingId?: number | undefined;
}

export interface JobBoard {
  post(me: number, input: LaborPostInput, at: number): JobCommandResult;
  withdraw(me: number, jobId: number, at: number): JobCommandResult;
  accept(me: number, jobId: number, unitId: number, at: number): JobCommandResult;
  /** 내가 낸 열린 게시 */
  mine(me: number | undefined): LaborJobView[];
  /** 남이 낸 열린 일자리(거르기, 임금 높은 차례, 상한 LABOR_JOBS_LIMIT) */
  board(me: number | undefined, filter: JobBoardFilter): Omit<LaborJobsResponse, "status" | "generatedAt">;
  readonly jobs: ReadonlyMap<number, LaborJob>;
}

/** 시설 하나의 주인·가까운 도시·2차맵 */
interface BuildingSpot {
  readonly ownerId: number | null;
  readonly cityId: number | null;
  readonly mapKey: number;
}

const fail = (code: LaborResultCode): JobCommandResult => ({ ok: false, code });

const FAILURE: Readonly<Record<LaborJobFailure, LaborResultCode>> = {
  invalid_terms: "invalid_terms",
  job_not_open: "job_not_open",
  employer_insufficient_funds: "employer_insufficient_funds",
};

/** 같은 2차맵에서 칸 거리 제곱이 가장 작은 도시(같으면 작은 ID). 없으면 null */
function nearestCity(
  cities: readonly CityRow[],
  planetId: string,
  mapKey: number,
  x: number,
  y: number,
): number | null {
  let best: CityRow | undefined;
  let bestDistance = 0;
  for (const city of cities) {
    if (city.planetId !== planetId || city.mapKey !== mapKey) continue;
    const distance = (city.cellX - x) * (city.cellX - x) + (city.cellY - y) * (city.cellY - y);
    if (!best || distance < bestDistance || (distance === bestDistance && city.id < best.id)) {
      best = city;
      bestDistance = distance;
    }
  }
  return best ? best.id : null;
}

/** 게시 하나의 화면 자료(기준 유닛 임금·보증금) */
function jobView(
  job: LaborJob,
  rules: WageRules,
  spot: BuildingSpot | undefined,
  me: number | undefined,
): LaborJobView {
  const wage = laborJobWage(job, rules.efficiency, rules.rateMilli, rules.society, rules.labor);
  return {
    id: job.id,
    buildingId: job.buildingId,
    mapKey: spot?.mapKey ?? null,
    cityId: spot?.cityId ?? null,
    job: job.job,
    adjustPm: job.adjustPm,
    wage: String(wage),
    deposit: String(requiredDeposit(wage, rules.labor)),
    slots: job.slots,
    filled: job.filled,
    termHours: job.termHours,
    postedAt: job.postedAtMs,
    own: job.ownerId === me,
  };
}

/** 받을 수 있는 게시(열림, 시설이 있고 주인이 그대로)면 그 시설 자리 */
function liveSpot(job: LaborJob, where: ReadonlyMap<number, BuildingSpot>): BuildingSpot | undefined {
  const spot = where.get(job.buildingId);
  return job.state === "open" && spot !== undefined && spot.ownerId === job.ownerId ? spot : undefined;
}

export function createJobBoard(options: {
  loaded: { readonly jobs: readonly LaborJob[]; readonly maxJobId: number };
  maps: ReadonlyMap<number, SecondMap>;
  cities: readonly CityRow[];
  settlement: Settlement;
  ledger: Ledger;
  writer: WorldWriter;
  accounts: LaborAccounts;
  rules: () => WageRules;
  unitOwnerOf: (unitId: number) => number | undefined;
  buildingOwnerOf: (buildingId: number) => number | null | undefined;
  unitBusy: (unitId: number) => boolean;
  /** 유닛이 그 시설과 같은 2차맵에 있나(522 ①) */
  onSiteMap: (unitId: number, buildingId: number) => boolean;
  /** 새 계약 ID(쓰기 전에 보기만 한다) */
  nextContractId: () => number;
  /** 맺은 계약을 서비스에 넣고 저장한다 */
  addContract: (contract: LaborContract) => void;
  /**
   * 보증금을 내기 전: 고용주 사업장 금고가 모자라면 적자로 미리 넣는다(D-555 1504, business/core.ts advance). 없으면 금고에 있는 만큼만(모자라면
   * employer_insufficient_funds)
   */
  advance?:
    | ((buildingId: number, ownerId: number, asset: string, needed: bigint, atMs: number) => void)
    | undefined;
}): JobBoard {
  const { settlement, ledger, writer, accounts } = options;
  const jobs = new Map<number, LaborJob>(options.loaded.jobs.map((job) => [job.id, job]));
  let lastJobId = options.loaded.maxJobId;
  const save = (job: LaborJob): void => writer.upsert("laborPostings", jobRow(job));
  const close = (job: LaborJob, at: number, state: "withdrawn" | "gone"): void => {
    if (closeLaborJob(job, at, state)) save(job);
    jobs.delete(job.id);
  };

  /** 지금 시설마다 주인·가까운 도시(화면 자료 한 번에 한 번) */
  const spots = (): Map<number, BuildingSpot> => {
    const out = new Map<number, BuildingSpot>();
    for (const map of options.maps.values())
      map.forEachBuilding((building) =>
        out.set(building.id, {
          ownerId: building.ownerId,
          cityId: nearestCity(options.cities, map.planetId, map.mapKey, building.x, building.y),
          mapKey: map.mapKey,
        }),
      );
    return out;
  };

  return {
    jobs,
    post(me, input, at) {
      const owner = options.buildingOwnerOf(input.buildingId);
      if (owner === undefined) return fail("unknown_building");
      if (owner !== me) return fail("forbidden");
      const rules = options.rules();
      const made = postLaborJob(
        {
          id: lastJobId + 1,
          buildingId: input.buildingId,
          ownerId: me,
          // 직무는 시설이 정한다: 서버 시설은 아직 시험 채집 하나
          job: "gather",
          asset: ASSET_CREDIT,
          adjustPm: input.adjustPm,
          slots: input.slots,
          termHours: input.termHours ?? null,
          atMs: at,
        },
        rules.society,
      );
      if (!made.ok) return fail(FAILURE[made.code]);
      // 시설마다 열린 게시 하나: 앞 게시는 거둔다(맺은 계약은 그대로)
      for (const job of jobs.values()) if (job.buildingId === input.buildingId) close(job, at, "withdrawn");
      lastJobId += 1;
      jobs.set(made.job.id, made.job);
      save(made.job);
      return { ok: true, jobId: made.job.id };
    },
    withdraw(me, jobId, at) {
      const job = jobs.get(jobId);
      if (!job) return fail("job_not_open");
      if (job.ownerId !== me) return fail("forbidden");
      close(job, at, "withdrawn");
      return { ok: true };
    },
    accept(me, jobId, unitId, at) {
      const job = jobs.get(jobId);
      if (!job) return fail("job_not_open");
      if (options.buildingOwnerOf(job.buildingId) !== job.ownerId) {
        close(job, at, "gone");
        return fail("job_not_open");
      }
      const unitOwner = options.unitOwnerOf(unitId);
      if (unitOwner === undefined) return fail("unknown_unit");
      if (unitOwner !== me) return fail("forbidden");
      if (job.ownerId === me) return fail("invalid_terms");
      // 그 시설과 같은 2차맵의 유닛만 받는다(522 ①)
      if (!options.onSiteMap(unitId, job.buildingId)) return fail("wrong_map");
      if (options.unitBusy(unitId)) return fail("unit_busy");
      // 보증금이 나가는 고용주와 계약이 시작하는 일꾼 쪽을 지금까지 정산한 뒤 맺는다
      settlement.settleOwner(job.ownerId, at);
      settlement.settleOwner(me, at);
      const rules = options.rules();
      // 보증금은 고용주 사업장 금고에서(D-555 1504) — 모자라면 적자로 미리 넣는다
      if (job.state === "open" && job.filled < job.slots && me !== job.ownerId)
        options.advance?.(
          job.buildingId,
          job.ownerId,
          job.asset,
          requiredDeposit(
            laborJobWage(job, rules.efficiency, rules.rateMilli, rules.society, rules.labor),
            rules.labor,
          ),
          at,
        );
      const result = acceptLaborJob(
        job,
        {
          contractId: options.nextContractId(),
          workerOwnerId: me,
          unitId,
          efficiency: rules.efficiency,
          rateMilli: rules.rateMilli,
          atMs: at,
        },
        ledger,
        accounts,
        rules.labor,
        rules.society,
      );
      if (!result.ok) return fail(FAILURE[result.code]);
      options.addContract(result.contract);
      save(job);
      if (job.state !== "open") jobs.delete(job.id);
      return { ok: true, contractId: result.contract.id };
    },
    mine(me) {
      if (me === undefined) return [];
      const rules = options.rules();
      const where = spots();
      return [...jobs.values()]
        .filter((job) => job.ownerId === me && job.state === "open")
        .toSorted((a, b) => a.id - b.id)
        .map((job) => jobView(job, rules, where.get(job.buildingId), me));
    },
    board(me, filter) {
      const rules = options.rules();
      const where = spots();
      const open: { job: LaborJob; spot: BuildingSpot }[] = [];
      const perCity = new Map<number, number>();
      for (const job of jobs.values()) {
        if (job.ownerId === me) continue;
        const spot = liveSpot(job, where);
        if (!spot) continue;
        if (spot.cityId !== null) perCity.set(spot.cityId, (perCity.get(spot.cityId) ?? 0) + 1);
        if (filter.cityId !== undefined && spot.cityId !== filter.cityId) continue;
        if (filter.buildingId !== undefined && job.buildingId !== filter.buildingId) continue;
        open.push({ job, spot });
      }
      // 같은 효율이면 조정이 큰 쪽이 임금이 높다(D-479 "더 높은 임금을 주는 작업장으로"). 같으면 먼저 낸 게시
      const sorted = open.toSorted((a, b) => b.job.adjustPm - a.job.adjustPm || a.job.id - b.job.id);
      return {
        jobs: sorted.slice(0, LABOR_JOBS_LIMIT).map(({ job, spot }) => jobView(job, rules, spot, me)),
        total: sorted.length,
        cities: [...perCity.entries()]
          .toSorted((a, b) => a[0] - b[0])
          .map(([id, count]) => ({ id, jobs: count })),
      };
    },
  };
}
