// NPC 도시 일꾼의 직무 상태(일·쉼, 피로) — 사용자 결정 2026-11-27("NPC 휴먼에게도 플레이어 유닛과 같은 진짜 피로·직무 상태를" → "네, 똑같이"),
// docs/adr/2026-11-27-npc-worker-jobs.md. 설정 칸 npc_worker_job_mode(logistics.npcJobMode) = 1일 때만 쓴다.
// - 상태는 플레이어 유닛과 같은 자리(2차맵 유닛의 직무 상태 — job·phase·fatigue, world_units에 저장)에 둔다. 그래서 피로 구간의 스탯 감소
//   (holdings fatiguePmOf)·운영 조회·작업 중 부상이 같은 값을 읽는다.
// - 쌓임: 시설이 묶음 하나를 낼 때마다 그 시설에서 지금 일하는 일꾼 하나(차례로)에게 직무 묶음 피로(설정 칸 gather_obj_job_fatigue) × 시설 피로
//   배율(레벨 1 = campFatiguePm, 레벨마다 stationFatigueStepPm씩 줄고 하한 stationFloorPm — 플레이어 채집소와 같은 식)을 더한다.
// - 쉼: 피로가 그 유닛 생활 규칙의 쉬러 가는 피로(life/store.ts — 성향 기본값)에 닿으면 쉼 단계. 쉼터(쉼터 계획의 숙소·집·노숙)의 회복 배율로
//   피로가 내려가(피로 회복 걸음 ÷ 회복 배율마다 1) 다시 일하는 피로에 닿으면 일 단계로 돌아온다.
// - 생산: 쉬는 일꾼은 생산에서 빠진다(도시 경제가 workingAt으로 시설 생산 속도를 맞춘다 — npc/economy.ts).
// - 소유 주체 정산(world/settlement.ts)은 이 유닛들의 직무 상태를 건드리지 않는다(external 고리 — 일 주기마다 1점씩 쌓는 엔진을 타지 않는다).
// - 일꾼 ↔ 휴먼 = @terra/sim cityWorkerUnits(임금·보이는 일터와 같은 나눔). 일꾼에서 빠진 휴먼은 직무를 끈다(피로는 그대로 — 직무 없는 유닛의
//   쉼으로 정산이 내린다).
// - 메모리: 쉼을 센 시각·‰ 나머지·받을 차례. 다시 켜면 쉬던 일꾼은 그 시각부터 다시 센다.
import {
  JOB_GATHER,
  JOB_NONE,
  PHASE_REST,
  PHASE_WORK,
  type RestPlace,
  type SocietyCoefficients,
  restRecoveryPm,
} from "@terra/sim";
import type { UnitJob } from "../world/secondMapRows.ts";

/** 장부가 읽고 쓰는 2차맵 몫 */
export interface WorkerJobMap {
  unitInfo(unitId: number): { readonly job: UnitJob } | undefined;
  setJob(unitId: number, job: UnitJob): boolean;
}

export interface WorkerJobsDeps {
  readonly maps: ReadonlyMap<number, WorkerJobMap>;
  readonly rules: () => SocietyCoefficients;
  /** 그 유닛의 생활 규칙(쉬러 가는 피로·다시 일하는 피로). 없으면 피로 상한에서 쉬고 0에서 다시 일한다 */
  readonly lifeOf?:
    | ((unitId: number) => { readonly restAt: number; readonly resumeAt: number } | undefined)
    | undefined;
}

/** 일꾼 하나(도시 경제가 맞출 때 넘긴다): 시설·쉼터 */
export interface WorkerSeat {
  readonly unitId: number;
  readonly facilityId: number;
  /** 쉼터(쉼터 계획). 없으면 집 */
  readonly place?: RestPlace | undefined;
}

export interface WorkerJobs {
  /** 설정 칸이 켜져 있나(logistics.npcJobMode === 1) */
  enabled(): boolean;
  /** 이 장부가 직무 상태를 맡은 유닛인가(소유 주체 정산이 건드리지 않는다) */
  has(unitId: number): boolean;
  /** 지금 일하는 단계인가. 맡지 않은 유닛은 undefined */
  workingOf(unitId: number): boolean | undefined;
  /**
   * 한 도시의 일꾼을 맞춘다(cityWorkerUnits 차례 그대로): 새 일꾼은 직무를 켜고(피로가 쉬러 가는 값 이상이면 쉼부터), 빠진 휴먼은 직무를 끈다.
   * 바뀐(켜거나 끈) 수
   */
  sync(cityId: number, seats: readonly WorkerSeat[], nowMs: number): number;
  /**
   * 묶음 하나: 그 시설 일꾼(workers — 유닛 ID, 차례) 가운데 지금 일하는 일꾼 하나에게 차례로 피로를 더한다. 받은 유닛 ID(일하는 일꾼이
   * 없으면 undefined)
   */
  lot(
    facility: { readonly id: number; readonly level: number },
    workers: readonly number[],
    nowMs: number,
  ): number | undefined;
  /** 쉬는 일꾼의 회복을 지금까지 민다. 다시 일하게 된 일꾼의 시설 ID들 */
  tick(nowMs: number): ReadonlySet<number>;
  /** 그 유닛들 가운데 지금 일하는 수(시설 생산 속도) */
  workingAt(workers: readonly number[]): number;
  /** 맡은 일꾼 수(지표) */
  readonly size: number;
}

interface Entry {
  cityId: number;
  facilityId: number;
  place: RestPlace | undefined;
  /** 쉼을 센 시각(쉼 단계일 때만) */
  restSinceMs: number | null;
  /** 묶음 피로의 ‰ 나머지(1000 = 1점) */
  carryPm: number;
  /** 그 유닛이 있는 2차맵(마지막으로 찾은 곳) */
  map: WorkerJobMap | undefined;
}

/** 시설 레벨의 피로 배율(‰ — 플레이어 채집소 gather/rules.ts stationBuffs와 같은 식) */
export function facilityFatiguePm(c: SocietyCoefficients["gatherObjects"], level: number): number {
  const steps = Math.max(0, Math.floor(level) - 1);
  const floor = Math.min(1000, Math.max(1, c.stationFloorPm));
  const base = Math.max(0, c.campFatiguePm);
  return Math.max(Math.min(base, floor), base - steps * Math.max(0, c.stationFatigueStepPm));
}

/** 쉼터의 회복 걸음(ms — 이만큼마다 피로 1). 플레이어 유닛과 같은 식(@terra/sim rulesWithRecovery) */
export function restStepMsOf(place: RestPlace | undefined, c: SocietyCoefficients): number {
  const recovery = Math.max(1, restRecoveryPm(place ?? { kind: "home" }, c));
  return Math.max(1, Math.floor((c.fatigueRecoverStepMs * 1000) / recovery));
}

export function createWorkerJobs(deps: WorkerJobsDeps): WorkerJobs {
  const entries = new Map<number, Entry>();
  /** 시설마다 받을 차례 */
  const turns = new Map<number, number>();

  const find = (unitId: number, entry: Entry | undefined): WorkerJobMap | undefined => {
    if (entry?.map?.unitInfo(unitId)) return entry.map;
    for (const map of deps.maps.values()) {
      if (map.unitInfo(unitId)) {
        if (entry) entry.map = map;
        return map;
      }
    }
    if (entry) entry.map = undefined;
    return undefined;
  };
  const thresholds = (unitId: number): { restAt: number; resumeAt: number } => {
    const max = Math.max(1, Math.trunc(deps.rules().fatigueMax));
    const life = deps.lifeOf?.(unitId);
    const restAt = Math.min(max, Math.max(1, Math.trunc(life?.restAt ?? max)));
    const resumeAt = Math.min(restAt - 1, Math.max(0, Math.trunc(life?.resumeAt ?? 0)));
    return { restAt, resumeAt };
  };
  const jobOf = (unitId: number, entry: Entry): { map: WorkerJobMap; job: UnitJob } | undefined => {
    const map = find(unitId, entry);
    const info = map?.unitInfo(unitId);
    return map && info ? { map, job: info.job } : undefined;
  };

  return {
    enabled: () => deps.rules().logistics.npcJobMode === 1,
    has: (unitId) => entries.has(unitId),
    workingOf(unitId) {
      const entry = entries.get(unitId);
      if (!entry) return undefined;
      const at = jobOf(unitId, entry);
      return at ? at.job.job !== JOB_NONE && at.job.phase === PHASE_WORK : false;
    },
    sync(cityId, seats, nowMs) {
      let changed = 0;
      const seen = new Set<number>();
      for (const seat of seats) {
        seen.add(seat.unitId);
        const old = entries.get(seat.unitId);
        if (old) {
          old.cityId = cityId;
          old.facilityId = seat.facilityId;
          old.place = seat.place;
          continue;
        }
        const entry: Entry = {
          cityId,
          facilityId: seat.facilityId,
          place: seat.place,
          restSinceMs: null,
          carryPm: 0,
          map: undefined,
        };
        const at = jobOf(seat.unitId, entry);
        // 2차맵에 없는 휴먼(2차맵 사이 이동 중)은 돌아온 뒤에 맡는다
        if (!at) continue;
        const { restAt } = thresholds(seat.unitId);
        // 저장된 직무 상태가 있으면(다시 켠 뒤) 그 단계를 잇고, 없으면 피로로 정한다
        const resting = at.job.job !== JOB_NONE ? at.job.phase === PHASE_REST : at.job.fatigue >= restAt;
        entry.restSinceMs = resting ? nowMs : null;
        entries.set(seat.unitId, entry);
        const next: UnitJob = {
          job: JOB_GATHER,
          phase: resting ? PHASE_REST : PHASE_WORK,
          progressMs: 0,
          fatigue: at.job.fatigue,
        };
        if (at.job.job !== next.job || at.job.phase !== next.phase) at.map.setJob(seat.unitId, next);
        changed += 1;
      }
      // 이 도시 일꾼에서 빠진 휴먼: 직무를 끈다(피로는 그대로)
      for (const [unitId, entry] of entries) {
        if (entry.cityId !== cityId || seen.has(unitId)) continue;
        const at = jobOf(unitId, entry);
        if (at && at.job.job !== JOB_NONE)
          at.map.setJob(unitId, { job: JOB_NONE, phase: PHASE_WORK, progressMs: 0, fatigue: at.job.fatigue });
        entries.delete(unitId);
        changed += 1;
      }
      return changed;
    },
    lot(facility, workers, nowMs) {
      const c = deps.rules();
      const able: { unitId: number; entry: Entry; map: WorkerJobMap; job: UnitJob }[] = [];
      for (const unitId of workers) {
        const entry = entries.get(unitId);
        const at = entry ? jobOf(unitId, entry) : undefined;
        if (entry && at && at.job.job !== JOB_NONE && at.job.phase === PHASE_WORK)
          able.push({ unitId, entry, ...at });
      }
      if (able.length === 0) return undefined;
      const turn = turns.get(facility.id) ?? 0;
      turns.set(facility.id, turn + 1);
      const got = able[turn % able.length];
      if (!got) return undefined;
      const max = Math.max(1, Math.trunc(c.fatigueMax));
      const perLot = Math.max(0, Math.trunc(c.gatherObjects.jobFatiguePerLot));
      got.entry.carryPm += perLot * facilityFatiguePm(c.gatherObjects, facility.level);
      const whole = Math.trunc(got.entry.carryPm / 1000);
      got.entry.carryPm -= whole * 1000;
      const fatigue = Math.min(max, got.job.fatigue + whole);
      const { restAt } = thresholds(got.unitId);
      const resting = fatigue >= restAt;
      if (resting) got.entry.restSinceMs = nowMs;
      if (whole !== 0 || resting)
        got.map.setJob(got.unitId, {
          job: JOB_GATHER,
          phase: resting ? PHASE_REST : PHASE_WORK,
          progressMs: 0,
          fatigue,
        });
      return got.unitId;
    },
    tick(nowMs) {
      const c = deps.rules();
      const resumed = new Set<number>();
      for (const [unitId, entry] of entries) {
        if (entry.restSinceMs === null) continue;
        const at = jobOf(unitId, entry);
        if (!at) continue;
        if (at.job.job === JOB_NONE || at.job.phase !== PHASE_REST) {
          entry.restSinceMs = null;
          continue;
        }
        const stepMs = restStepMsOf(entry.place, c);
        const steps = Math.floor((nowMs - entry.restSinceMs) / stepMs);
        const { resumeAt } = thresholds(unitId);
        if (steps <= 0 && at.job.fatigue > resumeAt) continue;
        const fatigue = Math.max(resumeAt, at.job.fatigue - Math.max(0, steps));
        const back = fatigue <= resumeAt;
        entry.restSinceMs = back ? null : entry.restSinceMs + steps * stepMs;
        at.map.setJob(unitId, {
          job: JOB_GATHER,
          phase: back ? PHASE_WORK : PHASE_REST,
          progressMs: 0,
          fatigue,
        });
        if (back) resumed.add(entry.facilityId);
      }
      return resumed;
    },
    workingAt(workers) {
      let count = 0;
      for (const unitId of workers) {
        const entry = entries.get(unitId);
        const at = entry ? jobOf(unitId, entry) : undefined;
        if (at && at.job.job !== JOB_NONE && at.job.phase === PHASE_WORK) count += 1;
      }
      return count;
    },
    get size() {
      return entries.size;
    },
  };
}
