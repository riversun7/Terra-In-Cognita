// 실제 유닛 — 로그인한 사용자의 세계 유닛(world_units)과 그 화물(ledger_accounts 위치 = −유닛 ID), 그 사용자가 잡은 포로.
// 읽는 차례는 복귀 요약의 생산 칸(world/summarySources.ts)과 같다: 그 주체를 지금까지 정산하고(직무·피로가 지금 값이 되게)
// 쓰기 대기열이 비기를 기다린 뒤(DB가 메모리를 따라잡은 뒤) 읽는다. 이동 중인지는 메모리의 움직임으로 본다.
// 세계 표는 바꾸지 않는다(읽기만). 저장된 스탯·장비가 아직 없어 화면 스탯은 [임시] 기본값이다(body.ts baselineBody).
import type { RosterCargo, RosterDomain, RosterInjury, RosterJob, UnitType } from "@terra/shared/roster";
import { JOB_GATHER, JOB_HUNT, NATURAL_HEAL_PM, PHASE_REST, arrivalAt, injuryGreenAtMs } from "@terra/sim";
import { injuryNowOf, injuryRules } from "../world/unitCondition.ts";
import {
  UNIT_KIND_CYBORG,
  UNIT_KIND_CYBORG_UNIT,
  UNIT_KIND_HUMAN,
  countsAsOwnedUnit,
} from "../world/unitKinds.ts";
import type { World } from "../world/world.ts";
import type { AiTactics } from "@terra/shared/aiTactics";
import { TACTICS_KINDS, tacticsOfRow } from "../tactics/store.ts";

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
  /** 수호신 상태인 휴먼(D-311·D-589). 아니면 없음 */
  readonly guardian?: boolean | undefined;
  readonly moving: boolean;
  readonly cargo: readonly RosterCargo[];
  /** AI 작전(판단하는 유닛만 칸 — 저장한 적이 없으면 null, D-5039·D-5040) */
  readonly tactics?: AiTactics | null | undefined;
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

/**
 * 세계 유닛 종류 코드 → 화면 종류: 구인으로 고용한 휴먼(4, D-469 — 수호신도 휴먼이다, 상태는 guardian 칸·D-589), 융합한 사이보그 유닛(5, D-470),
 * 그 밖(관리자 시험 유닛 2, NPC 세력만 갖는 봇 0)은 시험 유닛. 시험 일꾼(1)은 없앴다(부팅이 옛 행을 지운다)
 */
export function unitTypeOf(kind: number): UnitType {
  if (kind === UNIT_KIND_HUMAN) return "human";
  if (kind === UNIT_KIND_CYBORG_UNIT) return "cyborg";
  return "test_unit";
}

/** 정산 직무 코드 → 화면 직무 */
export function jobOf(job: number, phase: number): RosterJob | null {
  const state = phase === PHASE_REST ? "rest" : "work";
  if (job === JOB_GATHER) return { kind: "test_gather", phase: state };
  if (job === JOB_HUNT) return { kind: "test_hunt", phase: state };
  return null;
}

/** 부상(D-521, world/unitCondition.ts injuryAt과 같은 규칙): 지금 단계·다음 단계 시각·초록 시각·치료 배율 */
export function injuryOf(
  stage: number,
  untilMs: number | null,
  now: number,
  healPm: number = NATURAL_HEAL_PM,
): RosterInjury {
  if (stage <= 0 || untilMs === null) return { stage: 0, untilMs: null };
  const state = injuryNowOf(
    { injury: stage, injuryUntilMs: untilMs, injuryHealPm: healPm, heldBy: null },
    now,
  );
  if (state.stage <= 0 || state.untilMs === null) return { stage: 0, untilMs: null };
  const clamped = state.stage >= 3 ? 3 : state.stage === 2 ? 2 : 1;
  return {
    stage: clamped,
    untilMs: state.untilMs,
    greenAtMs: injuryGreenAtMs(state, now, injuryRules()),
    ...(state.healPm === NATURAL_HEAL_PM ? {} : { healPm: state.healPm }),
  };
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
          `select u.id, u.owner_id, u.kind, u.map_key, u.planet_id, u.domain, u.job, u.job_phase, u.fatigue, u.injury,
                  u.injury_until_ms, u.injury_heal_pm, u.held_by, u.guardian, t.preset, t.engage, t.pursue, t.cover, t.escort,
                  t.save_skill, t.spread, t.retreat_pct, t.target
             from world_units u left join unit_tactics t on t.unit_id = u.id
            where u.owner_id = $1 or u.held_by = $1 order by u.id`,
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
          injury: injuryOf(
            num(row.injury),
            numOrNull(row.injury_until_ms),
            now,
            num(row.injury_heal_pm ?? 1000),
          ),
          captive: mine && heldBy !== null,
          ...(row.guardian === true ? { guardian: true } : {}),
          moving: moving(mapKey, id, now),
          // 화물은 주인 계정이다: 내가 잡은 포로의 화물은 보이지 않는다
          cargo: mine ? (cargo.get(id) ?? []) : [],
          // AI 작전(D-5039·D-5040): 판단하는 내 유닛만
          ...(mine && TACTICS_KINDS.has(num(row.kind)) && row.guardian !== true
            ? {
                tactics: row.preset === null || row.preset === undefined ? null : (tacticsOfRow(row) ?? null),
              }
            : {}),
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
          if (unit.ownerId === ownerId && countsAsOwnedUnit(unit.kind)) count += 1;
        });
      // 띄우지 않은 2차맵 위 좌표 유닛도 센다(docs/adr/2026-11-15-unloaded-second-maps.md 5절)
      for (const unit of persistence.travel.coordinateUnits(new Set([ownerId])))
        if (countsAsOwnedUnit(unit.kind)) count += 1;
      return count;
    },
  };
}
