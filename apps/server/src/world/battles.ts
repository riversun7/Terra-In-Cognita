// 전투 인스턴스(서버, 최소) — docs/adr/2026-10-31-combat-core.md "서버", ADR 35 "판정"·"복구"
// - 지금은 모든 전투를 빨리감기로 끝까지 계산하고(보는 사람이 없다: 전투 화면은 L1), 실시간으로 했을 때 끝나는 시각에 결과를 적용한다(D-189).
// - 만들기: 시작 자료(init)를 world_battles에 두고, 끝까지 계산하며 30초마다 스냅숏을 남긴다. 끝 시각에 결과 적용을 예약한다.
// - 입력(참전·명령·퇴각)이 오면: 그 틱 이하의 가장 가까운 스냅숏에서 다시 계산하고, 그 뒤 스냅숏을 바꾸고, 끝 시각을 다시 건다.
// - 다시 켜면: 진행 중인 전투의 끝 시각을 다시 건다(지났으면 곧바로). 결과는 적용할 때 스냅숏 + 입력으로 다시 계산한다.
//   스냅숏은 다시 만들 수 있는 캐시라 전투 행과 같은 트랜잭션에 넣지 않는다(죽으면 처음부터 계산할 뿐이다).
// - 결과 적용은 한 번만 한다: apply(세계 바뀜, battleResults.ts)를 동기로 부르고 같은 쓰기 묶음에 결과 기록
//   (world_battle_results, 전투마다 한 줄)을 넣는다. 커밋된 뒤 status = ended(캐시)를 고친다. 다시 켜면 기록이 있는 전투는
//   다시 적용하지 않고 status만 고친다.
import {
  type Battle,
  type BattleInit,
  type BattleInput,
  type BattleResult,
  SIM_VERSION,
  TEST_COMBAT_COEFFICIENTS,
  type UnitResult,
  createBattle,
  resolveOutcomes,
  restoreBattle,
} from "@terra/sim";
import type { QueryPool } from "./persist/load.ts";
import type { WorldWriter } from "./persist/writer.ts";
import { type Scheduler, createScheduler } from "./scheduler.ts";

export interface BattleOutcome {
  readonly result: BattleResult;
  readonly units: readonly UnitResult[];
}

export interface BattleService {
  /** 부팅 때 한 번: 다음 ID를 읽고 진행 중인 전투의 끝을 다시 건다. 다시 건 수 */
  restore(): Promise<number>;
  /** 전투를 만든다. 전투 ID */
  start(init: BattleInit, options: { war: boolean }): Promise<number>;
  /** 입력(참전·명령·퇴각)을 더하고 다시 계산한다. 틱은 지금 진행 틱 이상이어야 한다 */
  addInput(battleId: number, input: BattleInput): Promise<void>;
  /** 전투 행(없으면 undefined) */
  get(
    battleId: number,
  ): Promise<{ status: string; endsAtMs: number; outcome: BattleOutcome | null } | undefined>;
  stop(): void;
}

const { tickMs } = TEST_COMBAT_COEFFICIENTS;

function b64(array: Uint8Array | Int32Array): string {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString("base64");
}

function bytes(text: unknown): Buffer {
  return Buffer.from(String(text), "base64");
}

/** 시작 자료 ↔ JSON(지도 층은 base64) */
function encodeInit(init: BattleInit): unknown {
  return {
    ...init,
    map: {
      ...init.map,
      passable: b64(init.map.passable),
      cover: b64(init.map.cover),
      height: b64(init.map.height),
    },
  };
}

function decodeInit(value: unknown): BattleInit {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 서버가 쓴 자료를 그대로 읽는다
  const raw = JSON.parse(JSON.stringify(value)) as Record<string, unknown> & { map: Record<string, unknown> };
  const height = bytes(raw.map.height);
  const map = {
    ...raw.map,
    passable: new Uint8Array(bytes(raw.map.passable)),
    cover: new Uint8Array(bytes(raw.map.cover)),
    height: new Int32Array(height.buffer.slice(height.byteOffset, height.byteOffset + height.byteLength)),
  };
  // 저장한 시작 자료는 encodeInit이 쓴 BattleInit 그대로다(지도 층만 바꿨다)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 서버가 쓴 자료를 그대로 읽는다
  return { ...raw, map } as unknown as BattleInit;
}

export function createBattleService(options: {
  pool: QueryPool;
  writer: WorldWriter;
  now: () => number;
  /** 세계에 결과를 적용한다(동기, 쓰기 대기열에만 쓴다). atMs = 실시간으로 끝나는 시각 */
  apply: (battleId: number, init: BattleInit, outcome: BattleOutcome, atMs: number) => void;
  onError: (error: unknown) => void;
}): BattleService {
  const { pool } = options;
  let nextId = 1;
  const scheduled = new Map<number, number>();
  /** 이 서버가 적용한 전투(커밋 전에도 두 번 하지 않게) */
  const applied = new Set<number>();
  const scheduler: Scheduler<{ kind: string; subject: number }> = createScheduler({
    now: options.now,
    handle: (event) => {
      void finish(event.payload.subject).catch(options.onError);
    },
    onError: options.onError,
  });

  const load = async (battleId: number) => {
    const found = await pool.query(
      `select status, war, started_at_ms, ends_at_ms, init, inputs, result from world_battles where id = $1`,
      [battleId],
    );
    const row = found.rows[0];
    if (!row) return undefined;
    const inputs: unknown = row.inputs;
    return {
      status: String(row.status),
      war: row.war === true,
      startedAtMs: Number(row.started_at_ms),
      endsAtMs: Number(row.ends_at_ms),
      init: decodeInit(row.init),
      // 저장한 입력·결과는 이 서비스가 쓴 모양 그대로다
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 서버가 쓴 자료를 그대로 읽는다
      inputs: (Array.isArray(inputs) ? inputs : []) as BattleInput[],
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 서버가 쓴 자료를 그대로 읽는다
      result: row.result as BattleOutcome | null,
    };
  };

  /** 가장 가까운 스냅숏(틱 ≤ upTo)에서 다시 켜 끝까지 계산하고, 그 뒤 스냅숏을 새로 쓴다 */
  const compute = async (
    battleId: number,
    init: BattleInit,
    inputs: readonly BattleInput[],
    upTo: number,
  ) => {
    const snap = await pool.query(
      `select tick, state from world_battle_snapshots where battle_id = $1 and tick <= $2 order by tick desc limit 1`,
      [battleId, upTo],
    );
    const row = snap.rows[0];
    const battle: Battle = row ? restoreBattle(init, String(row.state)) : createBattle(init);
    const from = battle.state.tick;
    await pool.query(`delete from world_battle_snapshots where battle_id = $1 and tick > $2`, [
      battleId,
      from,
    ]);
    const snapshots: { tick: number; state: string }[] = [];
    const run = battle.runToEnd(
      inputs.filter((input) => input.tick >= from),
      Number.POSITIVE_INFINITY,
      (state, tick) => {
        if (tick > from) snapshots.push({ tick, state });
      },
    );
    for (const entry of snapshots)
      await pool.query(`insert into world_battle_snapshots (battle_id, tick, state) values ($1, $2, $3)`, [
        battleId,
        entry.tick,
        entry.state,
      ]);
    if (!run.result) throw new Error(`battle ${battleId} did not end`);
    return { result: run.result, state: run.state };
  };

  const schedule = (battleId: number, atMs: number): void => {
    const previous = scheduled.get(battleId);
    if (previous !== undefined) scheduler.cancel(previous);
    scheduled.set(battleId, scheduler.schedule(atMs, { kind: "battle_end", subject: battleId }));
  };

  /** status 캐시를 결과 기록에 맞춘다 */
  const markEnded = (battleId: number) =>
    pool.query(
      `update world_battles b set status = 'ended', result = r.result
       from world_battle_results r where b.id = $1 and r.battle_id = b.id and b.status = 'running'`,
      [battleId],
    );

  async function finish(battleId: number): Promise<void> {
    scheduled.delete(battleId);
    if (applied.has(battleId)) return;
    const battle = await load(battleId);
    if (!battle || battle.status !== "running") return;
    const done = await pool.query(`select 1 from world_battle_results where battle_id = $1`, [battleId]);
    if (done.rows.length > 0) {
      await markEnded(battleId);
      return;
    }
    const { result, state } = await compute(battleId, battle.init, battle.inputs, 0x7fff_ffff);
    if (applied.has(battleId)) return;
    const outcome: BattleOutcome = { result, units: resolveOutcomes(state, { war: battle.war }) };
    // 여기부터 기다림 없이: 세계 바뀜과 결과 기록이 같은 쓰기 묶음에 들어간다
    applied.add(battleId);
    options.apply(battleId, battle.init, outcome, battle.endsAtMs);
    options.writer.append("battleResults", {
      battle_id: battleId,
      applied_at_ms: battle.endsAtMs,
      result: JSON.stringify(outcome),
    });
    await options.writer.durable();
    await markEnded(battleId);
  }

  return {
    async restore() {
      const max = await pool.query(`select coalesce(max(id), 0) as id from world_battles`);
      nextId = Number(max.rows[0]?.id ?? 0) + 1;
      const running = await pool.query(
        `select b.id, b.ends_at_ms, (r.battle_id is not null) as applied from world_battles b
         left join world_battle_results r on r.battle_id = b.id where b.status = 'running' order by b.id`,
      );
      let count = 0;
      for (const row of running.rows) {
        // 결과 기록은 커밋됐는데 status를 고치기 전에 죽었다 → 다시 적용하지 않는다
        if (row.applied === true) await markEnded(Number(row.id));
        else {
          schedule(Number(row.id), Number(row.ends_at_ms));
          count += 1;
        }
      }
      return count;
    },
    async start(init, { war }) {
      const battleId = nextId++;
      const startedAtMs = options.now();
      await pool.query(
        `insert into world_battles (id, kind, status, seed, sim_version, war, started_at_ms, ends_at_ms, init)
         values ($1, $2, 'running', $3, $4, $5, $6, $6, $7)`,
        [
          battleId,
          init.kind,
          init.seed >>> 0,
          SIM_VERSION,
          war,
          startedAtMs,
          JSON.stringify(encodeInit(init)),
        ],
      );
      const { result } = await compute(battleId, init, [], 0);
      const endsAtMs = startedAtMs + result.endTick * tickMs;
      await pool.query(`update world_battles set ends_at_ms = $2 where id = $1`, [battleId, endsAtMs]);
      schedule(battleId, endsAtMs);
      return battleId;
    },
    async addInput(battleId, input) {
      const battle = await load(battleId);
      if (!battle || battle.status !== "running") throw new Error(`battle ${battleId} is not running`);
      const currentTick = Math.floor((options.now() - battle.startedAtMs) / tickMs);
      if (input.tick < currentTick)
        throw new RangeError(`input tick ${input.tick} is in the past (${currentTick})`);
      const inputs = [...battle.inputs, input];
      await pool.query(`update world_battles set inputs = $2 where id = $1`, [
        battleId,
        JSON.stringify(inputs),
      ]);
      const { result } = await compute(battleId, battle.init, inputs, input.tick);
      const endsAtMs = battle.startedAtMs + result.endTick * tickMs;
      await pool.query(`update world_battles set ends_at_ms = $2 where id = $1`, [battleId, endsAtMs]);
      schedule(battleId, endsAtMs);
    },
    async get(battleId) {
      const battle = await load(battleId);
      if (!battle) return undefined;
      return { status: battle.status, endsAtMs: battle.endsAtMs, outcome: battle.result };
    },
    stop() {
      scheduler.stop();
    },
  };
}
