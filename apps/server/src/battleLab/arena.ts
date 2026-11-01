// 전투장(순수 함수) — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 4절
// 팀 A 대 팀 B(편마다 파티 하나, 최대 6명)를 sim 전투 코어(runBattle)로 판정한다. 워커(balance/duelWorker.ts)가 이 함수를 돈다:
// 일(ArenaJob)에는 사양·지도·계수·시드를 다 담는다(요청 시작 때 값 한 벌, 구조화 복제가 되는 값만).
// - 진형: 서쪽 편(1, 공격 편 edge 3)·동쪽 편(2, 수비 편 edge 1). 전열·중열·후열 = 가운데에서 4·7·10칸, 같은 줄은 위아래로 2칸씩 벌린다.
//   막힌 칸·찬 칸이면 가장 가까운 빈칸(너비 우선, 정해진 차례). 팀 A ID 1~, 팀 B 101~(편과 무관), 파티 ID 1·2.
// - 시간 초과는 대결 도구와 같은 판정(D-467 229): 남은 (HP + 아머 + 쉴드) 몫이 큰 팀, 같으면 이긴 팀 없음(반 승). 실제 규칙은 그대로.
// - 사건·유닛 통계는 판정 관찰자 위의 집계(createBattleTally, 리플레이 기록기와 같은 고리)로 모은다(결과를 바꾸지 않는다).
import {
  LAB_LIMITS,
  type LabBattleEvent,
  type LabRow,
  type LabTeam,
  type LabUnitStats,
  type LabUnitSummary,
  labScorePm,
  labUnitKey,
} from "@terra/shared/battleLab";
import {
  type BattleInit,
  type BattleMapInput,
  type BattleState,
  type CombatCoefficients,
  type CombatUnitSpec,
  type TallyEvent,
  type Battle,
  createBattle,
  createBattleTally,
  mix32,
} from "@terra/sim";

/** 전투장 한 변(배치 칸, 일반 전투 64보다 작게: 파티 둘이 곧 만난다. 32~128 짝수) */
export const ARENA_SIZE = 48;

/** 줄마다 가운데에서 떨어진 칸 수 */
const ROW_DEPTH: Readonly<Record<LabRow, number>> = { front: 4, middle: 7, back: 10 };
/** 같은 줄 안 위아래 자리(차례대로) */
const LANE_OFFSETS = [0, -2, 2, -4, 4, -6, 6, -8, 8];

export interface ArenaUnit {
  readonly spec: CombatUnitSpec;
  readonly row: LabRow;
}

export interface ArenaParty {
  readonly units: readonly ArenaUnit[];
  readonly retreatHpPct: number;
}

/** 워커로 보내는 전투장 일 */
export interface ArenaJob {
  readonly a: ArenaParty;
  readonly b: ArenaParty;
  readonly map: BattleMapInput;
  readonly coefficients: CombatCoefficients;
  readonly limitMs: number;
  readonly seed: number;
}

/** 빈 평지 전투장 */
export function flatArena(size = ARENA_SIZE): BattleMapInput {
  const cells = size * size;
  return {
    size,
    passable: new Uint8Array(cells).fill(1),
    cover: new Uint8Array(cells),
    height: new Int32Array(cells),
    buildings: [],
  };
}

/** 팀 A·B 유닛 ID(편과 무관) */
const idOf = (team: LabTeam, index: number): number => (team === "a" ? 1 : 101) + index;

/** (x, y)에서 가장 가까운 빈칸(통과 + 비어 있음). 너비 우선, 이웃 차례 고정 */
function nearestFree(map: BattleMapInput, taken: Set<number>, x: number, y: number): number {
  const size = map.size;
  const clamp = (value: number) => Math.max(0, Math.min(size - 1, value));
  const start = clamp(y) * size + clamp(x);
  const seen = new Uint8Array(size * size);
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] ?? start;
    if (map.passable[cell] === 1 && !taken.has(cell)) return cell;
    const cx = cell % size;
    const cy = (cell - cx) / size;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = ny * size + nx;
      if (seen[next] === 1) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return start;
}

/** 일 하나 → 전투 시작 자료. swapped면 팀 A가 동쪽(수비 편) */
export function arenaInit(job: ArenaJob, seed: number, swapped: boolean): BattleInit {
  const { map } = job;
  const size = map.size;
  const center = size / 2;
  const taken = new Set<number>();
  const place = (party: ArenaParty, team: LabTeam): CombatUnitSpec[] => {
    const side = (team === "a") !== swapped ? 1 : 2;
    const lanes: Record<LabRow, number> = { front: 0, middle: 0, back: 0 };
    return party.units.map((unit, index) => {
      const lane = lanes[unit.row];
      lanes[unit.row] = lane + 1;
      const depth = ROW_DEPTH[unit.row];
      // 가운데(center − 0.5)를 두고 좌우 대칭
      const x = side === 1 ? center - depth : center + depth - 1;
      const y = center + (LANE_OFFSETS[lane] ?? lane);
      const cell = nearestFree(map, taken, x, y);
      taken.add(cell);
      return {
        ...unit.spec,
        id: idOf(team, index),
        side,
        party: team === "a" ? 1 : 2,
        x: cell % size,
        y: Math.floor(cell / size),
      };
    });
  };
  const units = [...place(job.a, "a"), ...place(job.b, "b")];
  const sideOfA = swapped ? 2 : 1;
  return {
    id: 1,
    kind: "normal",
    seed,
    map,
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: sideOfA, retreatHpPct: job.a.retreatHpPct },
      { id: 2, side: 3 - sideOfA, retreatHpPct: job.b.retreatHpPct },
    ],
    units,
    limitMs: job.limitMs,
  };
}

const teamOfId = (id: number): LabTeam => (id >= 101 ? "b" : "a");
const indexOfId = (id: number): number => (id >= 101 ? id - 101 : id - 1);
const keyOfId = (id: number): string => labUnitKey(teamOfId(id), indexOfId(id));

/** 팀의 남은 (HP + 아머 + 쉴드) 몫(‰) */
function remainingPm(state: BattleState, team: LabTeam): number {
  let left = 0;
  let max = 0;
  for (const unit of state.units) {
    if (teamOfId(unit.id) !== team) continue;
    left += Math.max(0, unit.hp) + Math.max(0, unit.armor) + Math.max(0, unit.shield);
    max += unit.maxHp + unit.armorHp + unit.shieldHp;
  }
  return max <= 0 ? 0 : Math.floor((left * 1000) / max);
}

interface Played {
  readonly state: BattleState;
  readonly winner: LabTeam | null;
  readonly reason: "wipe" | "timeout" | "nexus";
  readonly endMs: number;
  readonly remaining: Record<LabTeam, number>;
  readonly tally: ReturnType<ReturnType<typeof createBattleTally>["report"]>;
}

function play(job: ArenaJob, seed: number, swapped: boolean, logMax: number): Played {
  const init = arenaInit(job, seed, swapped);
  let battle: Battle | null = null;
  const tally = createBattleTally(init.units, { logMax, tick: () => battle?.state.tick ?? 0 });
  battle = createBattle(init, job.coefficients, tally.trace);
  const { result, state } = battle.runToEnd([]);
  if (!result) throw new Error("arena battle did not end");
  const remaining = { a: remainingPm(state, "a"), b: remainingPm(state, "b") };
  let winner: LabTeam | null;
  if (result.reason === "timeout")
    winner = remaining.a > remaining.b ? "a" : remaining.b > remaining.a ? "b" : null;
  else {
    const sideOfA = swapped ? 2 : 1;
    winner = result.winner === sideOfA ? "a" : "b";
  }
  return {
    state,
    winner,
    reason: result.reason,
    endMs: result.endTick * job.coefficients.tickMs,
    remaining,
    tally: tally.report(),
  };
}

/** 관찰자 사건 → 화면 사건(유닛 키·ms) */
function eventOf(event: TallyEvent, tickMs: number): LabBattleEvent {
  const ms = event.tick * tickMs;
  switch (event.kind) {
    case "attack":
      return {
        kind: "attack",
        ms,
        unit: keyOfId(event.unit),
        target: keyOfId(event.target),
        outcome: event.outcome,
        crit: event.crit,
        damage: event.damage,
        down: event.down,
      };
    case "skill":
      return {
        kind: "skill",
        ms,
        unit: keyOfId(event.unit),
        skill: event.skill,
        hits: event.hits.map((hit) => ({ target: keyOfId(hit.unit), damage: hit.damage, down: hit.down })),
      };
    default:
      return { kind: "dot", ms, target: keyOfId(event.unit), damage: event.damage, down: event.down };
  }
}

export interface ArenaBattleResult {
  readonly winner: LabTeam | null;
  readonly reason: "wipe" | "timeout" | "nexus";
  readonly endMs: number;
  readonly remainingPm: Record<LabTeam, number>;
  readonly units: LabUnitSummary[];
  readonly events: LabBattleEvent[];
  readonly eventsDropped: number;
}

/** 한 판(팀 A 서쪽). logMax = 사건 기록 줄 상한 */
export function runArenaBattle(job: ArenaJob, logMax: number = LAB_LIMITS.logMax): ArenaBattleResult {
  const played = play(job, job.seed, false, logMax);
  const units = played.state.units.map((unit): LabUnitSummary => {
    const row = played.tally.units.get(unit.id);
    const down = unit.hp <= 0;
    return {
      key: keyOfId(unit.id),
      team: teamOfId(unit.id),
      index: indexOfId(unit.id),
      dealt: row?.dealt ?? 0,
      taken: row?.taken ?? 0,
      healed: row?.healed ?? 0,
      kills: row?.kills ?? 0,
      attacks: row?.attacks ?? 0,
      skills: row?.skills ?? 0,
      hp: Math.max(0, unit.hp),
      maxHp: unit.maxHp,
      status: down ? "down" : unit.status === "retreated" ? "retreated" : "alive",
    };
  });
  units.sort((x, y) => (x.team === y.team ? x.index - y.index : x.team === "a" ? -1 : 1));
  return {
    winner: played.winner,
    reason: played.reason,
    endMs: played.endMs,
    remainingPm: played.remaining,
    units,
    events: played.tally.events.map((event) => eventOf(event, job.coefficients.tickMs)),
    eventsDropped: played.tally.eventsDropped,
  };
}

export interface ArenaMonteResult {
  readonly runs: number;
  readonly teams: Record<LabTeam, { wins: number; timeoutWins: number; scorePm: number }>;
  readonly sides: Record<"normal" | "swapped", { runs: number; aScorePm: number }>;
  readonly timeouts: number;
  readonly timeoutEven: number;
  readonly avgMs: number;
  readonly medianMs: number;
  readonly units: LabUnitStats[];
}

/** 판마다 시드(seed에서 갈라 씀) */
const runSeed = (seed: number, run: number): number => mix32(seed ^ Math.imul(run + 1, 0x9e37_79b1));

/** 몬테카를로 runs판(짝수 판 = 팀 A 서쪽, 홀수 판 = 동쪽) */
export function runArenaMonteCarlo(job: ArenaJob, runs: number): ArenaMonteResult {
  const wins = { a: 0, b: 0 };
  const timeoutWins = { a: 0, b: 0 };
  let timeouts = 0;
  let timeoutEven = 0;
  const side = {
    normal: { runs: 0, wins: 0, timeoutWins: 0, even: 0 },
    swapped: { runs: 0, wins: 0, timeoutWins: 0, even: 0 },
  };
  const times: number[] = [];
  const sums = new Map<number, { dealt: number; taken: number; kills: number; alive: number }>();
  for (let run = 0; run < runs; run++) {
    const swapped = run % 2 === 1;
    const played = play(job, runSeed(job.seed, run), swapped, 0);
    const bucket = swapped ? side.swapped : side.normal;
    bucket.runs += 1;
    times.push(played.endMs);
    if (played.reason === "timeout") {
      timeouts += 1;
      if (played.winner) timeoutWins[played.winner] += 1;
      else {
        timeoutEven += 1;
        bucket.even += 1;
      }
      if (played.winner === "a") bucket.timeoutWins += 1;
    } else if (played.winner) {
      wins[played.winner] += 1;
      if (played.winner === "a") bucket.wins += 1;
    }
    for (const unit of played.state.units) {
      const row = played.tally.units.get(unit.id);
      const sum = sums.get(unit.id) ?? { dealt: 0, taken: 0, kills: 0, alive: 0 };
      sum.dealt += row?.dealt ?? 0;
      sum.taken += row?.taken ?? 0;
      sum.kills += row?.kills ?? 0;
      if (unit.hp > 0) sum.alive += 1;
      sums.set(unit.id, sum);
    }
  }
  const sorted = times.toSorted((x, y) => x - y);
  const mid = sorted.length >> 1;
  const medianMs =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? (sorted[mid] ?? 0)
        : Math.floor(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  const per = (value: number) => (runs === 0 ? 0 : Math.round(value / runs));
  const units = [...sums.entries()]
    .toSorted(([x], [y]) => x - y)
    .map(
      ([id, sum]): LabUnitStats => ({
        key: keyOfId(id),
        team: teamOfId(id),
        index: indexOfId(id),
        dealtAvg: per(sum.dealt),
        takenAvg: per(sum.taken),
        killsAvg: runs === 0 ? 0 : Math.round((sum.kills * 100) / runs) / 100,
        survivalPm: runs === 0 ? 0 : Math.round((sum.alive * 1000) / runs),
      }),
    );
  return {
    runs,
    teams: {
      a: {
        wins: wins.a,
        timeoutWins: timeoutWins.a,
        scorePm: labScorePm(wins.a, timeoutWins.a, timeoutEven, runs),
      },
      b: {
        wins: wins.b,
        timeoutWins: timeoutWins.b,
        scorePm: labScorePm(wins.b, timeoutWins.b, timeoutEven, runs),
      },
    },
    sides: {
      normal: {
        runs: side.normal.runs,
        aScorePm: labScorePm(side.normal.wins, side.normal.timeoutWins, side.normal.even, side.normal.runs),
      },
      swapped: {
        runs: side.swapped.runs,
        aScorePm: labScorePm(
          side.swapped.wins,
          side.swapped.timeoutWins,
          side.swapped.even,
          side.swapped.runs,
        ),
      },
    },
    timeouts,
    timeoutEven,
    avgMs: runs === 0 ? 0 : Math.floor(times.reduce((sum, value) => sum + value, 0) / runs),
    medianMs,
    units,
  };
}
