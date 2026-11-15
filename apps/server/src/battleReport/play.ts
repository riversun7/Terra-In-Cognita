// 전투 보고서 한 판(순수 함수, 워커가 돈다) — docs/adr/2026-11-14-battle-report.md "판정·집계"
// 판정은 sim 전투 코어 그대로(createBattle → step). 웨이브는 서버 정원사와 같은 멈춤 규칙(runWaveToEnd: 50틱마다 공성 크리쳐가 남았나)을
// 같은 차례로 따른다(play.test.ts가 runWaveToEnd와 결과가 같은지 본다). 판정 관찰자(BattleTrace)로 셈만 하고 상태·굴림은 바꾸지 않는다.
// - 셈: 기본 공격(명중·빗나감·회피·크리·피해), 스킬(쓰기·대상 결과·피해), 지속 피해(마지막으로 지속 효과 스킬을 맞힌 쪽), 회복, 건물 피해,
//   쓰러뜨림, 공격 단계(피해 흐름, attackStages — 관찰자에 단계 칸이 있을 때만 판정이 적는다).
// - 스태미나 기다림(질문 1378 [임시]): 틱마다 판정 전에 "행동 시각이 됐는데 스태미나가 기본 공격 소모보다 적은" 살아 있는 유닛(시전 중 제외)을
//   본다. 그 틱 수 × 틱 길이 = 기다린 시간, 기다리던 유닛이 그다음 틱 안에 기본 공격하면 "스태미나로 늦어진 공격" 하나.
//   사거리 밖이라 못 치는 동안도 스태미나가 모자라면 센다(판정이 사거리를 먼저 보는지와 상관없이 같은 정의).
import {
  type AttackStages,
  type BattleInit,
  type BattleInput,
  type BattleState,
  type CombatCoefficients,
  type UnitState,
  WAVE_CHECK_TICKS,
  createBattle,
  finishSpentWave,
  specStaminaCostMilli,
  waveSiegeSpent,
} from "@terra/sim";
import {
  type ReportHitTrace,
  type ReportLegionView,
  type ReportMode,
  reportRunEdge,
} from "@terra/shared/battleReport";
import type { RunSink } from "./aggregate.ts";

/** 보고서 줄(파티 유닛 또는 웨이브 무리) */
export interface PlayRow {
  readonly key: string;
  readonly team: "a" | "b";
  readonly label: string;
  readonly members: number;
}

/** 설정 하나를 판마다 돌릴 재료(구조화 복제가 되는 값만 — 워커로 간다) */
export interface PlaySetup {
  readonly mode: ReportMode;
  /** 판 시작 자료(시드만 판마다 바꾼다). swapped = 파티 대 파티의 편 바꾼 판(홀수 판) */
  readonly normal: BattleInit;
  readonly swapped: BattleInit | null;
  readonly coefficients: CombatCoefficients;
  readonly rows: readonly PlayRow[];
  /** 전투 유닛 ID → 줄 번호 */
  readonly rowOf: Readonly<Record<number, number>>;
  /** 시간 초과를 남은 (HP + 아머 + 쉴드) 몫으로 가르나(파티 대 파티, 전투 실험실과 같다). 아니면 판정 결과(공성 = 수비 승) */
  readonly timeoutByShare: boolean;
  /** 성벽·성문 건물 ID, 넥서스 ID(없으면 null)와 처음 내구도 */
  readonly wallIds: readonly number[];
  readonly nexusId: number | null;
  readonly nexusMax: number;
  /** 판정 입력(파티·군단 명령 — 틱 차례, 유닛·파티 ID는 편 바꾼 판에도 같다). 없으면 명령 없음 */
  readonly inputs?: readonly BattleInput[] | undefined;
  /** 편 바꾼 판의 입력(군단 명령의 편 번호가 바뀐다 — 파티 대 파티만). 없으면 inputs */
  readonly swappedInputs?: readonly BattleInput[] | undefined;
  /** 공격 변 random(1465): 변마다 시작 자료(북·동·남·서). 판마다 그 판 시드로 고른다(reportRunEdge). 없으면 normal 하나 */
  readonly edges?: readonly BattleInit[] | undefined;
  /** 편마다 군단 모양(결과에 그대로 적는다) */
  readonly legion?: { readonly a: ReportLegionView; readonly b: ReportLegionView } | undefined;
}

/** 판 하나의 끝 */
export interface PlayEnd {
  readonly winner: "a" | "b" | null;
  readonly end: "wipe" | "nexus" | "timeout" | "spent";
  readonly endMs: number;
  /** 넥서스 남은 몫(‰, 넥서스가 없으면 0) */
  readonly nexusLeftPm: number;
  /** 공격 변 random이면 이 판의 변(아니면 null) */
  readonly edge: 0 | 1 | 2 | 3 | null;
  /** 판정이 거절한 입력 수(파티·군단 명령) */
  readonly rejected: number;
}

/** 쓰러졌나(지속 피해 관찰자는 쓰러짐 표시 전에 불린다, observe.ts와 같다) */
const isDown = (unit: UnitState): boolean => unit.status === "down" || unit.hp <= 0;

/** 편의 남은 (HP + 아머 + 쉴드) 몫(‰) — 전투 실험실 arena.ts remainingPm과 같은 셈 */
function remainingPm(state: BattleState, team: "a" | "b", setup: PlaySetup): number {
  let left = 0;
  let max = 0;
  for (const unit of state.units) {
    if (setup.rows[setup.rowOf[unit.id] ?? -1]?.team !== team) continue;
    left += Math.max(0, unit.hp) + Math.max(0, unit.armor) + Math.max(0, unit.shield);
    max += unit.maxHp + unit.armorHp + unit.shieldHp;
  }
  return max <= 0 ? 0 : Math.floor((left * 1000) / max);
}

/** 단계 기록 → 한 대 풀이 줄 */
export function hitTraceOf(
  stages: AttackStages,
  ms: number,
  attacker: string,
  target: string,
): ReportHitTrace {
  return { ms, attacker, target, ...stages };
}

/**
 * 판 하나. run = 판 번호(짝수 = 처음 편, 홀수 = 바꾼 편 — 파티 대 파티만), seed = 이 판 시드. sink가 셈을 받는다.
 * 같은 (설정, 판 번호, 시드)면 같은 결과다
 */
export function playRun(setup: PlaySetup, run: number, seed: number, sink: RunSink): PlayEnd {
  const edge = setup.edges ? reportRunEdge(seed) : null;
  const swappedRun = edge === null && run % 2 === 1 && setup.swapped !== null;
  const base =
    edge !== null
      ? (setup.edges?.[edge] ?? setup.normal)
      : swappedRun && setup.swapped
        ? setup.swapped
        : setup.normal;
  const runInputs = (swappedRun ? setup.swappedInputs : undefined) ?? setup.inputs ?? [];
  const init: BattleInit = { ...base, seed };
  const c = setup.coefficients;
  const tickMs = c.tickMs;
  const rowIndex = (id: number): number => setup.rowOf[id] ?? -1;
  const teamOf = (id: number): "a" | "b" | null => setup.rows[rowIndex(id)]?.team ?? null;
  const enemies = (a: number, b: number): boolean => {
    const ta = teamOf(a);
    const tb = teamOf(b);
    return ta !== null && tb !== null && ta !== tb;
  };
  const sideOfA = init.units.find((unit) => teamOf(unit.id) === "a")?.side ?? 1;
  const walls = new Set(setup.wallIds);
  /** 대상 → 지속 피해 효과가 있는 스킬을 마지막으로 맞힌 유닛 */
  const dotSource = new Map<number, number>();
  /** 지난 틱 판정 전에 스태미나를 기다리던 유닛 */
  const starved = new Set<number>();
  let state: BattleState | null = null;
  const nowMs = (): number => (state?.tick ?? 0) * tickMs;

  /** 피해 하나: 받은 쪽 셈, 적이면 준 쪽 셈·쓰러뜨림 */
  const harm = (source: number | null, target: UnitState, physical: number, elemental: number): void => {
    sink.taken(rowIndex(target.id), physical, elemental);
    if (source === null || !enemies(source, target.id)) return;
    sink.dealt(rowIndex(source), physical, elemental);
    if (isDown(target)) sink.kill(rowIndex(source));
  };

  const battle = createBattle(init, c, {
    attack(attacker, target, hit) {
      const row = rowIndex(attacker.id);
      sink.attack(row, hit.outcome, hit.crit, hit.physical + hit.elemental);
      if (starved.has(attacker.id)) {
        starved.delete(attacker.id);
        sink.staminaLimited(row);
      }
      harm(attacker.id, target, hit.physical, hit.elemental);
    },
    building(attacker, buildingId, damage) {
      const kind = buildingId === setup.nexusId ? "nexus" : walls.has(buildingId) ? "wall" : "other";
      sink.building(rowIndex(attacker.id), kind, damage);
    },
    skill(unit) {
      sink.skillCast(rowIndex(unit.id));
    },
    skillHit(unit, skill, target, hit, physical, elemental) {
      sink.skillHit(rowIndex(unit.id), hit.outcome);
      if (hit.outcome !== "hit") return;
      harm(unit.id, target, physical, elemental);
      if (skill.effects.some((part) => part.def.kind === "dot")) dotSource.set(target.id, unit.id);
    },
    heal(source, target, gain) {
      const amount = gain.hp + gain.shield;
      if (amount <= 0) return;
      sink.heal(source ? rowIndex(source.id) : -1, rowIndex(target.id), amount);
    },
    dot(target, _effect, amount) {
      const source = dotSource.get(target.id) ?? null;
      sink.dot(
        source !== null && enemies(source, target.id) ? rowIndex(source) : -1,
        rowIndex(target.id),
        amount,
      );
      if (source !== null && enemies(source, target.id) && isDown(target)) sink.kill(rowIndex(source));
    },
    collision(source, target, amount) {
      // 밀치기 부딪힘 피해(D-564 1587): 밀어낸 유닛이 준 지속형 피해로 센다(방어 없이 체력에서)
      const from = enemies(source.id, target.id) ? rowIndex(source.id) : -1;
      sink.dot(from, rowIndex(target.id), amount);
      if (from >= 0 && isDown(target)) sink.kill(from);
    },
    attackStages(attacker, target, stages) {
      if (!enemies(attacker.id, target.id)) return;
      sink.stages(rowIndex(attacker.id), rowIndex(target.id), stages, nowMs());
    },
  });
  state = battle.state;
  const alive = new Map<number, boolean>(state.units.map((unit) => [unit.id, unit.status === "alive"]));
  const wave = setup.mode === "wave";
  /** 틱 → 그 틱의 판정 입력(군단 명령) */
  const byTick = new Map<number, BattleInput[]>();
  for (const input of runInputs) {
    const list = byTick.get(input.tick);
    if (list) list.push(input);
    else byTick.set(input.tick, [input]);
  }
  while (!state.result) {
    const now = state.tick * tickMs;
    for (const unit of state.units) {
      if (unit.status !== "alive") continue;
      const row = rowIndex(unit.id);
      sink.alive(row, tickMs);
      const waiting =
        unit.cast === null &&
        now >= unit.nextActionMs &&
        unit.staminaMilli < specStaminaCostMilli(unit, unit.staminaCost, c);
      if (waiting) {
        starved.add(unit.id);
        sink.staminaWait(row, tickMs);
      } else starved.delete(unit.id);
    }
    battle.step(byTick.get(state.tick) ?? []);
    for (const unit of state.units) {
      if (alive.get(unit.id) !== true || unit.status === "alive") continue;
      alive.set(unit.id, false);
      const row = rowIndex(unit.id);
      if (unit.status === "retreated" && unit.hp > 0) sink.retreat(row);
      else sink.death(row, state.tick * tickMs);
    }
    // 웨이브: 서버 정원사와 같은 멈춤(runWaveToEnd — 50틱마다 공성 크리쳐가 남았나)
    if (wave && !state.result && state.tick % WAVE_CHECK_TICKS === 0 && waveSiegeSpent(state))
      finishSpentWave(state);
  }
  const result = state.result;
  if (!result) throw new Error("report battle did not end");
  const endMs = result.endTick * tickMs;
  const nexus = setup.nexusId === null ? undefined : state.buildings.find((b) => b.id === setup.nexusId);
  const nexusLeftPm =
    nexus && setup.nexusMax > 0 ? Math.floor((Math.max(0, nexus.durability) * 1000) / setup.nexusMax) : 0;
  let winner: "a" | "b" | null;
  let end: PlayEnd["end"];
  if (result.reason === "timeout") {
    if (wave && result.endTick < state.limitTicks) {
      end = "spent";
      winner = result.winner === sideOfA ? "a" : "b";
    } else {
      end = "timeout";
      if (setup.timeoutByShare) {
        const a = remainingPm(state, "a", setup);
        const b = remainingPm(state, "b", setup);
        winner = a > b ? "a" : b > a ? "b" : null;
      } else winner = result.winner === sideOfA ? "a" : "b";
    }
  } else {
    end = result.reason;
    winner = result.winner === sideOfA ? "a" : "b";
  }
  return { winner, end, endMs, nexusLeftPm, edge, rejected: state.rejected };
}
