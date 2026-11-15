// 리플레이 해석 — 시각 t(ms) → 유닛 모습·효과·떠오르는 숫자·기록 줄. docs/adr/2026-11-01-battle-replay.md 7절.
// DOM·three 없이 순수 함수다(시험 replayTimeline.test.ts). 모두 t만의 함수라 되감기·배속·건너뛰기가 같다.
// 시각 규칙: 틱 T의 사건은 시각 (T + 1) × 틱에 보인다(판정이 그 틱을 끝낸 뒤 = 다음 틱 처음 상태, @terra/protocol replayStateAt).
// 걸음은 새 칸에 그 시각에 닿게, 그 전 걸음 간격 동안 앞 칸에서 옮겨 간다. 투사체는 맞는 시각에 닿게 앞서 날아온다.
// 그림 모양은 스킬 ID가 아니라 리플레이 스킬 표의 모양(shape)이다(새 스킬은 자료만으로 그림이 정해진다).
// 움직임 사건(형식 2, docs/adr/2026-11-15-combat-moves.md 5절)은 자리표시 그림이다: 돌진·도약·뒷걸음·밀치기·끌어오기는 한 틱에 미끄러지고
// 점멸은 앞 칸에서 사라져 새 칸에 바로 나타난다(번쩍임 둘). 은신 중 유닛은 UnitFrame.stealth. 절차적 움직임은 뒤 작업(WP-2).
import {
  type BattleReplay,
  type Facing,
  type ReplayEvent,
  type ReplayUnitState,
  admitJoined,
  applyReplayEvent,
  cloneState,
  stateFromKeyframe,
} from "@terra/protocol/battleReplay";

import type {
  FloatingNumber,
  FxTone,
  NumberKind,
  ReplaySummary,
  SideSummary,
  TimelineFx,
  UnitFrame,
  UnitSummary,
} from "./replayTypes.ts";

export type {
  FloatingNumber,
  FxTone,
  NumberKind,
  ReplaySummary,
  SideSummary,
  TimelineFx,
  UnitFrame,
  UnitSummary,
} from "./replayTypes.ts";

/** 기록 판에 보이는 사건 종류 */
const LOGGED = new Set<ReplayEvent["k"]>([
  "attack",
  "skill",
  "skillHit",
  "heal",
  "down",
  "retreat",
  "interrupt",
  "fizzle",
  "effectOn",
  "end",
]);
/** 상태 되짚기 기준점 간격(틱): 찾기 비용 = 이 안의 사건 수 */
const CHECKPOINT_TICKS = 50;
/** 떠오르는 숫자 수명(ms) */
export const NUMBER_MS = 1200;
/** 효과 길이(ms) */
const FX_MS = { ring: 700, glow: 900, beam: 450, flash: 260 } as const;
/** 투사체 비행: 칸마다 ms, 아래·위 한계 */
const FLIGHT = { perCell: 70, min: 180, max: 700 } as const;
/** 그림을 찾는 창(ms): 앞으로는 투사체 비행, 뒤로는 가장 긴 효과·숫자 */
const LOOK_AHEAD_MS = FLIGHT.max;
const LOOK_BEHIND_MS = Math.max(NUMBER_MS, FX_MS.glow);

interface Track {
  /** 새 칸에 닿는 시각(ms) */
  readonly arrive: number[];
  readonly x: number[];
  readonly y: number[];
  readonly facing: Facing[];
  /** 그 칸으로 옮기는 데 걸리는 시간(ms). null = 걸음(걷기 간격으로 보간), 0 = 점멸(바로) */
  readonly span: (number | null)[];
}

/** 이벤트 배열에서 t × 틱 + 틱(보이는 시각)이 at 이상인 첫 번호 */
function firstShownAtOrAfter(events: readonly ReplayEvent[], tickMs: number, at: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const event = events[mid];
    if (event && (event.t + 1) * tickMs < at) low = mid + 1;
    else high = mid;
  }
  return low;
}

export interface ReplayTimeline {
  readonly replay: BattleReplay;
  readonly durationMs: number;
  /** 편 ID → 색 번호(편 표 차례) */
  team(side: number): number;
  unitsAt(timeMs: number): UnitFrame[];
  fxAt(timeMs: number): TimelineFx[];
  numbersAt(timeMs: number): FloatingNumber[];
  /** 그 시각까지 보인 기록 줄(사건 번호, 새 것이 뒤). limit개까지 */
  logAt(timeMs: number, limit: number): number[];
  /** 기록 줄 수(그 시각까지) */
  logCountAt(timeMs: number): number;
  /** 편 side에게 그 시각 유닛이 보이나(자기 편은 늘 보인다) */
  visibleTo(side: number, unit: number, timeMs: number): boolean;
  summary(): ReplaySummary;
}

export function createReplayTimeline(replay: BattleReplay): ReplayTimeline {
  const { events, units, tickMs } = replay;
  const durationMs = replay.result.endTick * tickMs;
  const sideOrder = replay.sides.map((side) => side.id);
  const team = (side: number): number => Math.max(0, sideOrder.indexOf(side));
  const first = replay.keyframes[0];
  if (!first) throw new RangeError("battle replay has no keyframe");

  // 걸음 길: 유닛마다 (닿는 시각, 칸)
  const tracks: Track[] = units.map((unit, index) => {
    const start = first.units[index];
    return {
      arrive: [Number.NEGATIVE_INFINITY],
      x: [start?.x ?? unit.x],
      y: [start?.y ?? unit.y],
      facing: [start?.facing ?? unit.facing],
      span: [null],
    };
  });
  for (const event of events) {
    if (event.k !== "move" && event.k !== "motion") continue;
    const track = tracks[event.u];
    if (!track) continue;
    track.arrive.push((event.t + 1) * tickMs);
    track.x.push(event.x);
    track.y.push(event.y);
    track.facing.push(event.facing);
    track.span.push(event.k === "move" ? null : event.kind === "blink" ? 0 : tickMs);
  }

  // 상태 기준점: CHECKPOINT_TICKS마다 {틱, 상태, 그 틱의 첫 사건 번호}
  const checkpoints: { tick: number; state: ReplayUnitState[]; event: number }[] = [];
  {
    const state = stateFromKeyframe(first);
    let cursor = 0;
    for (let tick = first.tick; tick <= replay.result.endTick + CHECKPOINT_TICKS; tick += CHECKPOINT_TICKS) {
      while (cursor < events.length && (events[cursor]?.t ?? 0) < tick) {
        const event = events[cursor];
        if (event) applyReplayEvent(state, event);
        cursor += 1;
      }
      admitJoined(replay, state, tick);
      checkpoints.push({ tick, state: cloneState(state), event: cursor });
    }
  }
  let cache: { tick: number; state: ReplayUnitState[]; event: number } | null = null;

  /** 틱 tick 처음 상태(가까운 기준점 또는 바로 앞 계산에서 이어서) */
  const stateAtTick = (tick: number): ReplayUnitState[] => {
    const clamped = Math.max(first.tick, Math.min(tick, replay.result.endTick + 1));
    if (cache && cache.tick === clamped) return cache.state;
    // 앞 계산이 바로 뒤면 그대로 이어 쓴다(복사하지 않는다: 앞 시각 상태는 버린다). 아니면 가까운 기준점을 복사한다
    let base = cache && cache.tick <= clamped && clamped - cache.tick <= CHECKPOINT_TICKS ? cache : null;
    if (!base) {
      const index = Math.min(checkpoints.length - 1, Math.floor((clamped - first.tick) / CHECKPOINT_TICKS));
      const point = checkpoints[Math.max(0, index)];
      if (!point) throw new RangeError("no checkpoint");
      base = { tick: point.tick, state: cloneState(point.state), event: point.event };
    }
    let cursor = base.event;
    while (cursor < events.length && (events[cursor]?.t ?? 0) < clamped) {
      const event = events[cursor];
      if (event) applyReplayEvent(base.state, event);
      cursor += 1;
    }
    admitJoined(replay, base.state, clamped);
    cache = { tick: clamped, state: base.state, event: cursor };
    return base.state;
  };

  /** 그 시각 유닛 자리(칸 가운데)·걸음 중 방향 */
  const placeAt = (index: number, timeMs: number): { x: number; y: number; facing: Facing | null } => {
    const track = tracks[index];
    const unit = units[index];
    if (!track || !unit) return { x: 0.5, y: 0.5, facing: null };
    // 닿는 시각이 timeMs보다 큰 첫 걸음
    let low = 1;
    let high = track.arrive.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((track.arrive[mid] ?? 0) <= timeMs) low = mid + 1;
      else high = mid;
    }
    const before = low - 1;
    const px = track.x[before] ?? unit.x;
    const py = track.y[before] ?? unit.y;
    if (low >= track.arrive.length) return { x: px + 0.5, y: py + 0.5, facing: null };
    const arrive = track.arrive[low] ?? 0;
    const previous = track.arrive[before] ?? Number.NEGATIVE_INFINITY;
    const duration =
      track.span[low] ?? Math.max(tickMs, Math.min(unit.moveIntervalMs, arrive - previous));
    const left = arrive - timeMs;
    if (left >= duration) return { x: px + 0.5, y: py + 0.5, facing: null };
    const alpha = 1 - left / duration;
    const nx = track.x[low] ?? px;
    const ny = track.y[low] ?? py;
    return {
      x: px + (nx - px) * alpha + 0.5,
      y: py + (ny - py) * alpha + 0.5,
      facing: track.facing[low] ?? null,
    };
  };

  const skillTone = (skill: number): FxTone => {
    const row = replay.skills[skill];
    if (!row) return { kind: "physical" };
    if (row.shape === "heal") return { kind: "heal" };
    if (row.shape === "buff") return { kind: "buff" };
    if (row.shape === "debuff" && row.damage === "none") return { kind: "debuff" };
    if (row.damage === "elemental" || row.element >= 0) return { kind: "element", element: row.element };
    return { kind: "physical" };
  };
  const basicTone = (unit: number): FxTone =>
    units[unit]?.attack === "elemental" ? { kind: "element", element: -1 } : { kind: "physical" };

  // 기록 판 사건 번호(차례대로)
  const logged: number[] = [];
  events.forEach((event, index) => {
    if (!LOGGED.has(event.k)) return;
    if (event.k === "effectOn" && replay.effects[event.effect]?.kind === "buff") return;
    if (event.k === "heal" && event.u < 0) return;
    logged.push(index);
  });
  const shownCount = (list: readonly number[], timeMs: number): number => {
    let low = 0;
    let high = list.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      const event = events[list[mid] ?? 0];
      if (event && (event.t + 1) * tickMs <= timeMs) low = mid + 1;
      else high = mid;
    }
    return low;
  };

  // 시야: 편마다 유닛마다 (보이는 시각, 켜짐) 목록
  const vision = new Map<number, { at: number[]; on: boolean[] }[]>();
  for (const event of events) {
    if (event.k !== "vision") continue;
    let list = vision.get(event.side);
    if (!list) {
      list = units.map(() => ({ at: [], on: [] }));
      vision.set(event.side, list);
    }
    const row = list[event.u];
    if (!row) continue;
    row.at.push((event.t + 1) * tickMs);
    row.on.push(event.on);
  }

  const unitsAt = (timeMs: number): UnitFrame[] => {
    const state = stateAtTick(Math.floor(timeMs / tickMs));
    return units.map((unit, index) => {
      const now = state[index];
      const place = placeAt(index, timeMs);
      const cast = now?.cast;
      const span = cast ? Math.max(1, cast.endTick - cast.startTick) * tickMs : 1;
      return {
        index,
        x: place.x,
        y: place.y,
        facing: place.facing ?? now?.facing ?? unit.facing,
        status: now?.status ?? "absent",
        stealth: now?.stealth === true,
        hp: now?.hp ?? unit.maxHp,
        armor: now?.armor ?? unit.armorHp,
        shield: now?.shield ?? unit.shieldHp,
        mp: now?.mp ?? unit.mpMax,
        stamina: now?.stamina ?? unit.staminaMax,
        effects: now ? [...now.effects].map(([effect, value]) => ({ effect, stacks: value.stacks })) : [],
        cast:
          cast && now?.status === "alive"
            ? {
                skill: cast.skill,
                progress: Math.min(1, Math.max(0, (timeMs - (cast.startTick + 1) * tickMs) / span)),
              }
            : null,
      };
    });
  };

  return {
    replay,
    durationMs,
    team,

    unitsAt,

    fxAt(timeMs) {
      const out: TimelineFx[] = [];
      const from = firstShownAtOrAfter(events, tickMs, timeMs - LOOK_BEHIND_MS);
      for (let i = from; i < events.length; i++) {
        const event = events[i];
        if (!event) continue;
        const shown = (event.t + 1) * tickMs;
        if (shown > timeMs + LOOK_AHEAD_MS) break;
        const age = (ms: number): number => (timeMs - shown) / ms;
        const live = (ms: number): boolean => timeMs >= shown && timeMs < shown + ms;
        switch (event.k) {
          case "projectile": {
            const a = placeAt(event.u, shown);
            const b = placeAt(event.target, shown);
            const cells = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
            const flight = Math.min(FLIGHT.max, Math.max(FLIGHT.min, cells * FLIGHT.perCell));
            if (timeMs >= shown - flight && timeMs < shown)
              out.push({
                kind: "projectile",
                fromX: a.x,
                fromY: a.y,
                toX: b.x,
                toY: b.y,
                progress: 1 - (shown - timeMs) / flight,
                tone: event.skill >= 0 ? skillTone(event.skill) : basicTone(event.u),
              });
            break;
          }
          case "attack": {
            if (event.outcome !== "hit" || !live(FX_MS.flash)) break;
            const at = placeAt(event.target, shown);
            out.push({
              kind: "flash",
              x: at.x,
              y: at.y,
              progress: age(FX_MS.flash),
              tone: basicTone(event.u),
            });
            break;
          }
          case "skill": {
            const row = replay.skills[event.skill];
            if (!row) break;
            const tone = skillTone(event.skill);
            if (row.shape === "area" && live(FX_MS.ring))
              out.push({
                kind: "ring",
                x: event.x + 0.5,
                y: event.y + 0.5,
                radiusCells: row.radius,
                progress: age(FX_MS.ring),
                tone,
              });
            if (row.shape === "debuff" && live(FX_MS.ring)) {
              // 약화: 목표(반지름 > 0이면 그 둘레)에 보라 고리
              out.push({
                kind: "ring",
                x: event.x + 0.5,
                y: event.y + 0.5,
                radiusCells: row.radius,
                progress: age(FX_MS.ring),
                tone: { kind: "debuff" },
              });
            }
            if ((row.shape === "buff" || row.shape === "heal") && row.radius > 0 && live(FX_MS.ring)) {
              const at = placeAt(event.u, shown);
              out.push({
                kind: "ring",
                x: at.x,
                y: at.y,
                radiusCells: row.radius,
                progress: age(FX_MS.ring),
                tone,
              });
            }
            if (row.shape === "chain" && live(FX_MS.beam)) {
              // 시전자 → 맞은 차례대로 잇는다(같은 틱·같은 시전자·같은 스킬의 skillHit)
              let last = placeAt(event.u, shown);
              for (let j = i + 1; j < events.length; j++) {
                const hit = events[j];
                if (!hit || hit.t !== event.t) break;
                if (hit.k !== "skillHit" || hit.u !== event.u || hit.skill !== event.skill) continue;
                const next = placeAt(hit.target, shown);
                out.push({
                  kind: "beam",
                  fromX: last.x,
                  fromY: last.y,
                  toX: next.x,
                  toY: next.y,
                  progress: age(FX_MS.beam),
                  tone,
                });
                last = next;
              }
            }
            break;
          }
          case "skillHit": {
            if (event.outcome !== "hit" || !live(FX_MS.flash)) break;
            const at = placeAt(event.target, shown);
            out.push({
              kind: "flash",
              x: at.x,
              y: at.y,
              progress: age(FX_MS.flash),
              tone: skillTone(event.skill),
            });
            break;
          }
          case "heal": {
            if (!live(FX_MS.glow)) break;
            const at = placeAt(event.target, shown);
            out.push({ kind: "glow", x: at.x, y: at.y, progress: age(FX_MS.glow), tone: { kind: "heal" } });
            break;
          }
          case "effectOn": {
            const kind = replay.effects[event.effect]?.kind;
            if (!live(FX_MS.glow)) break;
            const at = placeAt(event.target, shown);
            if (kind === "buff")
              out.push({ kind: "glow", x: at.x, y: at.y, progress: age(FX_MS.glow), tone: { kind: "buff" } });
            else if (kind === "debuff" || kind === "status")
              out.push({
                kind: "flash",
                x: at.x,
                y: at.y,
                progress: age(FX_MS.glow),
                tone: { kind: "debuff" },
              });
            break;
          }
          case "motion": {
            // 자리표시: 점멸은 앞·새 칸에 번쩍임, 돌진·도약·뒷걸음은 지나간 줄, 밀치기·끌어오기는 새 칸에 약화 번쩍임
            if (!live(FX_MS.beam)) break;
            const progress = age(FX_MS.beam);
            if (event.kind === "blink") {
              for (const [x, y] of [
                [event.fromX, event.fromY],
                [event.x, event.y],
              ] as const)
                out.push({ kind: "glow", x: x + 0.5, y: y + 0.5, progress, tone: { kind: "buff" } });
            } else if (event.kind === "knockback" || event.kind === "pull")
              out.push({ kind: "flash", x: event.x + 0.5, y: event.y + 0.5, progress, tone: { kind: "debuff" } });
            else
              out.push({
                kind: "beam",
                fromX: event.fromX + 0.5,
                fromY: event.fromY + 0.5,
                toX: event.x + 0.5,
                toY: event.y + 0.5,
                progress,
                tone: basicTone(event.u),
              });
            break;
          }
          case "stealth": {
            if (!live(FX_MS.glow)) break;
            const at = placeAt(event.u, shown);
            out.push({
              kind: event.on ? "glow" : "flash",
              x: at.x,
              y: at.y,
              progress: age(FX_MS.glow),
              tone: { kind: event.on ? "buff" : "debuff" },
            });
            break;
          }
          case "dot": {
            if (!live(FX_MS.flash)) break;
            const at = placeAt(event.target, shown);
            out.push({
              kind: "flash",
              x: at.x,
              y: at.y,
              progress: age(FX_MS.flash),
              tone: { kind: "debuff" },
            });
            break;
          }
          default:
            break;
        }
      }
      // 시전 중: 시전자 발밑에 차오르는 고리
      for (const frame of unitsAt(timeMs)) {
        if (!frame.cast) continue;
        out.push({
          kind: "ring",
          x: frame.x,
          y: frame.y,
          radiusCells: 0,
          progress: 1 - frame.cast.progress,
          tone: skillTone(frame.cast.skill),
        });
      }
      return out;
    },

    numbersAt(timeMs) {
      const out: FloatingNumber[] = [];
      const from = firstShownAtOrAfter(events, tickMs, timeMs - NUMBER_MS);
      for (let i = from; i < events.length; i++) {
        const event = events[i];
        if (!event) continue;
        const shown = (event.t + 1) * tickMs;
        if (shown > timeMs) break;
        const age = (timeMs - shown) / NUMBER_MS;
        if (age >= 1) continue;
        const push = (unit: number, slot: number, kind: NumberKind, value: number, crit: boolean): void => {
          const at = placeAt(unit, shown);
          out.push({ key: i * 2 + slot, unit, x: at.x, y: at.y, kind, value, crit, age });
        };
        if (event.k === "attack" || event.k === "skillHit") {
          if (event.outcome === "miss") push(event.target, 0, "miss", 0, false);
          else if (event.outcome === "evade") push(event.target, 0, "evade", 0, false);
          else {
            if (event.physical > 0 || event.elemental <= 0)
              push(event.target, 0, event.crit ? "crit" : "damage", event.physical, event.crit);
            if (event.elemental > 0) push(event.target, 1, "elemental", event.elemental, event.crit);
          }
        } else if (event.k === "heal") {
          if (event.amount > 0) push(event.target, 0, "heal", event.amount, false);
          if (event.shieldGain > 0) push(event.target, 1, "shield", event.shieldGain, false);
        } else if (event.k === "dot" && event.amount > 0) push(event.target, 0, "dot", event.amount, false);
      }
      return out;
    },

    logAt(timeMs, limit) {
      const count = shownCount(logged, timeMs);
      return logged.slice(Math.max(0, count - limit), count);
    },

    logCountAt(timeMs) {
      return shownCount(logged, timeMs);
    },

    visibleTo(side, unit, timeMs) {
      const row = units[unit];
      if (!row || row.side === side) return true;
      const list = vision.get(side)?.[unit];
      if (!list) return false;
      let on = false;
      for (let i = 0; i < list.at.length && (list.at[i] ?? 0) <= timeMs; i++) on = list.on[i] ?? false;
      return on;
    },

    summary() {
      const dealt = units.map(() => 0);
      const taken = units.map(() => 0);
      const healed = units.map(() => 0);
      const kills = units.map(() => 0);
      for (const event of events) {
        if ((event.k === "attack" || event.k === "skillHit") && event.outcome === "hit") {
          const amount = event.physical + event.elemental;
          dealt[event.u] = (dealt[event.u] ?? 0) + amount;
          taken[event.target] = (taken[event.target] ?? 0) + amount;
          if (event.hp <= 0) kills[event.u] = (kills[event.u] ?? 0) + 1;
        } else if (event.k === "heal" && event.u >= 0)
          healed[event.u] = (healed[event.u] ?? 0) + event.amount;
        else if (event.k === "dot") taken[event.target] = (taken[event.target] ?? 0) + event.amount;
      }
      const end = stateAtTick(replay.result.endTick + 1).map((unit) => unit.status);
      const unitRows: UnitSummary[] = units.map((_, index) => ({
        index,
        dealt: dealt[index] ?? 0,
        taken: taken[index] ?? 0,
        healed: healed[index] ?? 0,
        kills: kills[index] ?? 0,
        status: end[index] ?? "absent",
      }));
      const sides: SideSummary[] = replay.sides.map((side) => {
        const rows = unitRows.filter((row) => units[row.index]?.side === side.id);
        return {
          side: side.id,
          units: rows.length,
          alive: rows.filter((row) => row.status === "alive").length,
          down: rows.filter((row) => row.status === "down").length,
          retreated: rows.filter((row) => row.status === "retreated").length,
          dealt: rows.reduce((sum, row) => sum + row.dealt, 0),
          healed: rows.reduce((sum, row) => sum + row.healed, 0),
        };
      });
      return {
        winner: replay.result.winner,
        reason: replay.result.reason,
        durationMs,
        sides,
        units: unitRows,
      };
    },
  };
}
