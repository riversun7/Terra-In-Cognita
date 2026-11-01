// 리플레이 상태 되짚기 — 키프레임 + 사건 → 그 틱 처음의 유닛 상태. docs/adr/2026-11-01-battle-replay.md 2·7절.
// 기기 보기 화면(apps/game/src/battle/replayTimeline.ts)과 sim 기록기 시험이 같이 쓴다(형식의 뜻을 한 곳에서 정한다).
// 규칙: "틱 T 상태" = 키프레임 T(그 틱의 사건 전)와 같다 = t < T인 사건을 모두 적용한 상태. 참전 유닛은 들어온 틱 < T이면 산다.
import type { BattleReplay, Facing, ReplayEvent, ReplayKeyframe, ReplayUnitStatus } from "./battleReplay.ts";

export interface ReplayUnitState {
  status: ReplayUnitStatus;
  x: number;
  y: number;
  facing: Facing;
  hp: number;
  armor: number;
  shield: number;
  mp: number;
  stamina: number;
  /** 효과 표 번호 → {겹침, 끝나는 틱(−1 = 내내)} */
  effects: Map<number, { stacks: number; untilTick: number }>;
  cast: { skill: number; target: number; startTick: number; endTick: number } | null;
}

/** 키프레임 → 고칠 수 있는 상태(키프레임 시전의 시작 틱은 모른다: 키프레임 틱으로 둔다) */
export function stateFromKeyframe(keyframe: ReplayKeyframe): ReplayUnitState[] {
  return keyframe.units.map((unit) => ({
    status: unit.status,
    x: unit.x,
    y: unit.y,
    facing: unit.facing,
    hp: unit.hp,
    armor: unit.armor,
    shield: unit.shield,
    mp: unit.mp,
    stamina: unit.stamina,
    effects: new Map(
      unit.effects.map((effect) => [effect.effect, { stacks: effect.stacks, untilTick: effect.untilTick }]),
    ),
    cast: unit.cast ? { ...unit.cast, startTick: keyframe.tick } : null,
  }));
}

export function cloneState(state: readonly ReplayUnitState[]): ReplayUnitState[] {
  return state.map((unit) => ({
    ...unit,
    effects: new Map(unit.effects),
    cast: unit.cast ? { ...unit.cast } : null,
  }));
}

/** 참전: 들어온 틱 < tick인 "absent" 유닛을 산 것으로 */
export function admitJoined(replay: BattleReplay, state: ReplayUnitState[], tick: number): void {
  replay.units.forEach((unit, index) => {
    const now = state[index];
    if (now && now.status === "absent" && unit.joinTick < tick) now.status = "alive";
  });
}

/** 사건 하나를 적용한다(사건 틱 차례로 부른다). 표시 전용 사건(projectile·building·vision·end)은 유닛 상태를 바꾸지 않는다 */
export function applyReplayEvent(state: ReplayUnitState[], event: ReplayEvent): void {
  switch (event.k) {
    case "move": {
      const unit = state[event.u];
      if (!unit) return;
      unit.x = event.x;
      unit.y = event.y;
      unit.facing = event.facing;
      return;
    }
    case "attack":
    case "skillHit": {
      const target = state[event.target];
      if (target) {
        target.hp = event.hp;
        target.armor = event.armor;
        target.shield = event.shield;
      }
      if (event.k === "attack") {
        const unit = state[event.u];
        if (unit) unit.facing = event.facing;
      }
      return;
    }
    case "cast": {
      const unit = state[event.u];
      if (unit)
        unit.cast = { skill: event.skill, target: event.target, startTick: event.t, endTick: event.endTick };
      return;
    }
    case "skill": {
      const unit = state[event.u];
      if (!unit) return;
      unit.cast = null;
      unit.facing = event.facing;
      return;
    }
    case "fizzle":
    case "interrupt": {
      const unit = state[event.u];
      if (unit) unit.cast = null;
      return;
    }
    case "heal": {
      const target = state[event.target];
      if (!target) return;
      target.hp = event.hp;
      target.shield = event.shield;
      return;
    }
    case "dot": {
      const target = state[event.target];
      if (target) target.hp = event.hp;
      return;
    }
    case "effectOn": {
      const target = state[event.target];
      if (target) target.effects.set(event.effect, { stacks: event.stacks, untilTick: event.untilTick });
      return;
    }
    case "effectOff": {
      state[event.target]?.effects.delete(event.effect);
      return;
    }
    case "down": {
      const unit = state[event.u];
      if (unit) unit.status = "down";
      return;
    }
    case "retreat": {
      const unit = state[event.u];
      if (unit) unit.status = "retreated";
      return;
    }
    case "vitals": {
      const unit = state[event.u];
      if (!unit) return;
      unit.hp = event.hp;
      unit.armor = event.armor;
      unit.shield = event.shield;
      unit.mp = event.mp;
      unit.stamina = event.stamina;
      return;
    }
    case "projectile":
    case "building":
    case "vision":
    case "end":
      return;
    default: {
      const unknown: never = event;
      throw new RangeError(`unknown replay event ${String(unknown)}`);
    }
  }
}

/** 틱 tick 처음의 상태: 그 틱 이하의 가장 가까운 키프레임에서 t < tick인 사건을 적용한다(시험·한 번 보기용, 보기 화면은 색인을 쓴다) */
export function replayStateAt(replay: BattleReplay, tick: number): ReplayUnitState[] {
  let keyframe = replay.keyframes[0];
  for (const candidate of replay.keyframes) if (candidate.tick <= tick) keyframe = candidate;
  if (!keyframe) throw new RangeError("battle replay has no keyframe");
  const state = stateFromKeyframe(keyframe);
  for (const event of replay.events) {
    if (event.t < keyframe.tick) continue;
    if (event.t >= tick) break;
    applyReplayEvent(state, event);
  }
  admitJoined(replay, state, tick);
  return state;
}
