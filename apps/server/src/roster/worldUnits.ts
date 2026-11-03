// 실제 유닛 — 로그인한 사용자의 세계 유닛(world_units)과 그 화물(ledger_accounts 위치 = −유닛 ID), 그 사용자가 잡은 포로.
// 읽는 차례는 복귀 요약의 생산 칸(world/summarySources.ts)과 같다: 그 주체를 지금까지 정산하고(직무·피로가 지금 값이 되게)
// 쓰기 대기열이 비기를 기다린 뒤(DB가 메모리를 따라잡은 뒤) 읽는다. 이동 중인지는 메모리의 움직임으로 본다.
// 세계 표는 바꾸지 않는다(읽기만). 저장된 스탯·장비가 아직 없어 화면 스탯은 [임시] 기본값이다(body.ts baselineBody).
import type { RosterCargo, RosterDomain, RosterInjury, RosterJob, UnitType } from "@terra/shared/roster";
import { JOB_GATHER, JOB_HUNT, PHASE_REST, arrivalAt } from "@terra/sim";
import { UNIT_KIND_CYBORG, UNIT_KIND_HUMAN, UNIT_KIND_WORKER } from "../world/unitKinds.ts";
import type { World } from "../world/world.ts";

/** 실제 유닛 한 줄(화면 모양으로 바꾸기 전) */
export interface WorldRosterRow {
  readonly id: number;
  readonly type: UnitType;
  readonly planetId: string;
  readonly mapKey: number;
  readonly domain: RosterDomain;
  readonly job: RosterJob | null;
  readonly fatigue: number;
  readonly injury: RosterInjury;
  /** 다른 주체에게 잡혔는가 */
  readonly captive: boolean;
  readonly moving: boolean;
  readonly cargo: readonly RosterCargo[];
}

export interface WorldRoster {
  /** 내 유닛(잡힌 것 포함) */
  readonly units: readonly WorldRosterRow[];
  /** 내가 잡은 다른 주체의 유닛 */
  readonly prisoners: readonly WorldRosterRow[];
}

/** 실제 유닛 출처. 세계·DB가 없으면 늘 빈 목록 */
export interface WorldRosterSource {
  read(userId: string, now: number): Promise<WorldRoster>;
  /** 유닛 수만(사이보그 화면) */
  count(userId: string, now: number): Promise<number>;
}

export const EMPTY_WORLD_ROSTER: WorldRosterSource = {
  read: () => Promise.resolve({ units: [], prisoners: [] }),
  count: () => Promise.resolve(0),
};

const DOMAINS: readonly RosterDomain[] = ["space", "sky", "land", "sea"];

/** 세계 유닛 종류 코드 → 화면 종류: 시험 일꾼(1), 구인으로 고용한 휴먼(4, D-469), 그 밖(관리자 시험 유닛 2, NPC 세력만 갖는 봇 0)은 시험 유닛 */
export function unitTypeOf(kind: number): UnitType {
  if (kind === UNIT_KIND_HUMAN) return "human";
  return kind === UNIT_KIND_WORKER ? "test_worker" : "test_unit";
}

/** 정산 직무 코드 → 화면 직무 */
export function jobOf(job: number, phase: number): RosterJob | null {
  const state = phase === PHASE_REST ? "rest" : "work";
  if (job === JOB_GATHER) return { kind: "test_gather", phase: state };
  if (job === JOB_HUNT) return { kind: "test_hunt", phase: state };
  return null;
}

/** 부상(나을 시각이 지났으면 없음, world/unitCondition.ts injuryAt과 같은 규칙) */
export function injuryOf(stage: number, untilMs: number | null, now: number): RosterInjury {
  if (stage <= 0 || untilMs === null || now >= untilMs) return { stage: 0, untilMs: null };
  const clamped = stage >= 3 ? 3 : stage === 2 ? 2 : 1;
  return { stage: clamped, untilMs };
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export function createWorldRosterSource(world: World): WorldRosterSource {
  /** 주체를 지금까지 정산하고 DB가 따라잡을 때까지 기다린다. 주체가 없으면 undefined */
  const settled = async (userId: string, now: number) => {
    const persistence = world.persistence;
    if (!persistence || world.status().state !== "ready") return undefined;
    const ownerId = persistence.settlement.findOwnerOfUser(userId);
    if (ownerId === undefined) return undefined;
    persistence.settlement.settleOwner(ownerId, now);
    await persistence.writer.durable();
    return { ownerId, pool: persistence.pool };
  };

  const moving = (mapKey: number, unitId: number, now: number): boolean => {
    const motion = world.maps.get(mapKey)?.unitInfo(unitId)?.motion;
    return motion !== undefined && now < arrivalAt(motion);
  };

  return {
    async read(userId, now) {
      const found = await settled(userId, now);
      if (!found) return { units: [], prisoners: [] };
      const { ownerId, pool } = found;
      const [unitRows, cargoRows] = await Promise.all([
        pool.query(
          `select id, owner_id, kind, map_key, planet_id, domain, job, job_phase, fatigue, injury, injury_until_ms, held_by
             from world_units where owner_id = $1 or held_by = $1 order by id`,
          [ownerId],
        ),
        pool.query(
          `select location, asset, balance from ledger_accounts
            where owner_id = $1 and location < 0 and balance > 0 order by location desc, asset`,
          [ownerId],
        ),
      ]);
      const cargo = new Map<number, RosterCargo[]>();
      for (const row of cargoRows.rows) {
        const unitId = -num(row.location);
        const list = cargo.get(unitId) ?? [];
        list.push({ asset: String(row.asset), amount: String(row.balance) });
        cargo.set(unitId, list);
      }
      const units: WorldRosterRow[] = [];
      const prisoners: WorldRosterRow[] = [];
      for (const row of unitRows.rows) {
        const id = num(row.id);
        const mapKey = num(row.map_key);
        const heldBy = numOrNull(row.held_by);
        const mine = num(row.owner_id) === ownerId;
        // 사이보그 본체는 보유 유닛이 아니다(사이보그 화면, D-445 178)
        if (mine && num(row.kind) === UNIT_KIND_CYBORG) continue;
        const entry: WorldRosterRow = {
          id,
          type: unitTypeOf(num(row.kind)),
          planetId: String(row.planet_id),
          mapKey,
          domain: DOMAINS.find((domain) => domain === row.domain) ?? "land",
          job: jobOf(num(row.job), num(row.job_phase)),
          fatigue: num(row.fatigue),
          injury: injuryOf(num(row.injury), numOrNull(row.injury_until_ms), now),
          captive: mine && heldBy !== null,
          moving: moving(mapKey, id, now),
          // 화물은 주인 계정이다: 내가 잡은 포로의 화물은 보이지 않는다
          cargo: mine ? (cargo.get(id) ?? []) : [],
        };
        if (mine) units.push(entry);
        else prisoners.push(entry);
      }
      return { units, prisoners };
    },
    async count(userId) {
      const persistence = world.persistence;
      if (!persistence || world.status().state !== "ready") return 0;
      const ownerId = persistence.settlement.findOwnerOfUser(userId);
      if (ownerId === undefined) return 0;
      let count = 0;
      for (const map of world.maps.values())
        map.forEachUnit((unit) => {
          if (unit.ownerId === ownerId && unit.kind !== UNIT_KIND_CYBORG) count += 1;
        });
      return count;
    },
  };
}
