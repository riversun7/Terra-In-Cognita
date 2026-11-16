// AI 전개 방식 8가지 — 기획 D-558 2차(사용자 "AI 판단 기준을 추가해도 좋다. 축구로 따지면 적극공격이나 수비집중, 중심공략 윙어공략 같이
// 전개방식", 기획 제안 8가지 모두 채택), 45 §4.1 표, docs/adr/2026-10-31-combat-core.md "바뀜 (D-558)". 군단(또는 파티)이 하나를 고르면
// 명령 받은 유닛이 그 방식으로 목표·걸음을 고른다(battle.ts가 이 계획대로 친다·걷는다). 스킬·물약·달리기 판단은 그대로다.
// - 돌격(assault): 가까운 적에게 밀고 들어간다(진형 기다림 없음).
// - 수비 집중(defend): 명령 받은 자리(닻)를 지키며 닻 둘레 defendRadius 칸 안에 들어온 적만 쫓는다. 없으면 닻으로 돌아간다.
// - 중앙 돌파(center): 지도 가운데 줄에 가까운 적부터, 보이는 적이 없으면 맞은편 가장자리 가운데 1/3로 간다.
// - 측면 우회(flank): 지도 절반을 지나기 전에는 자기 쪽 옆 1/3 길로 맞은편 가장자리까지 걸으며 닿는 적만 친다. 지나면 돌격.
// - 후방 침투(infiltrate): 재능 계열(1차 DEX + AGI가 STR + VIT·INT + WIS보다 큰 유닛 — D-557 답 1 "기술·AGI·DEX 계열")은 사거리
//   backlineRange 이상인 적(원거리·마법) 가운데 가장 깊이 있는 적을 쫓는다. 그 밖 유닛은 돌격.
// - 집중 사격(focus): 보이는 적 지휘관 먼저, 없으면 남은 HP + 아머 + 쉴드가 가장 적은 적을 모두 함께 친다.
// - 견제(harass): 사거리 2 이상 유닛은 사거리를 지키며 치고, 공격 사이(행동 시각 전)에 적이 사거리 안으로 들어와 있으면 한 걸음 물러난다.
//   근접은 돌격.
// - 지연전(delay): 쫓지 않는다. 적이 사거리 + delayGap 칸 안이면 자기 가장자리 쪽으로 물러나며(퇴각 구역 앞까지) 닿는 적만 친다.
// 같으면 가까운 적 → 작은 ID. 정수·결정적 계산만 쓴다. 수는 모두 설정 칸(질문 1963 → D-571 "기존 결정으로 답함 — D-558", 계수표 tactics,
// tuningTactics.ts d558_tactic_*) [임시]. 계수표에 tactics가 없으면 DEFAULT_TACTIC_COEFFICIENTS(D-558 때 코드 상수와 같은 값).
import type { Edge, UnitState } from "./battleTypes.ts";
import { edgeProgress, oppositeEdgeCells } from "./formation.ts";

export const TACTICS = [
  "assault",
  "defend",
  "center",
  "flank",
  "infiltrate",
  "focus",
  "harass",
  "delay",
] as const;
export type Tactic = (typeof TACTICS)[number];

export const isTactic = (value: unknown): value is Tactic =>
  typeof value === "string" && (TACTICS as readonly string[]).includes(value);

/** AI 전개 방식 수(설정 칸 d558_tactic_*) */
export interface TacticCoefficients {
  /** 수비 집중: 닻 둘레 이 칸 안(체비쇼프)에 들어온 적만 쫓는다 */
  readonly defendRadius: number;
  /** 후방 침투: 사거리가 이 이상인 적을 뒤쪽 원거리·마법 유닛으로 본다 */
  readonly backlineRange: number;
  /** 지연전: 적이 사거리 + 이 칸 안이면 물러난다 */
  readonly delayGap: number;
  /** 견제: 사거리가 이 이상인 유닛만 견제한다(아래는 돌격) */
  readonly harassMinRange: number;
  /** 측면 우회: 지도의 이 몫(‰)을 지나면 돌격으로 바꾼다 */
  readonly flankTurnPm: number;
  /** 중앙 돌파·측면 우회의 길: 맞은편 가장자리를 이 수로 나눈 폭이 옆 길, 가운데 남은 칸이 가운데 길(출발값 3 = 1/3씩) */
  readonly laneDivisor: number;
}

/** [임시] 출발값 = D-558 때 코드 상수(수비 4칸·후방 사거리 3·지연 2칸·견제 사거리 2·우회 절반·길 1/3) */
export const DEFAULT_TACTIC_COEFFICIENTS: TacticCoefficients = {
  defendRadius: 4,
  backlineRange: 3,
  delayGap: 2,
  harassMinRange: 2,
  flankTurnPm: 500,
  laneDivisor: 3,
};

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** 계획에 판정이 빌려 주는 것 */
export interface TacticView {
  readonly size: number;
  /** 자기 편 가장자리 */
  readonly edge: Edge;
  /** 지금 보이는 산 적 */
  readonly enemies: readonly UnitState[];
  /** 적 편 지휘관 ID */
  readonly commanders: ReadonlySet<number>;
  /** 수비 집중의 닻 칸(없으면 지금 칸) */
  readonly anchor: number | undefined;
  /** 퇴각 구역 폭(칸, C23) — 지연전이 그 앞에서 멈춘다 */
  readonly retreatBand: number;
  /** 전개 방식 수(없으면 출발값) */
  readonly k?: TacticCoefficients | undefined;
}

/** 이번 차례 계획 */
export interface TacticPlan {
  /** 칠 적(없으면 아무도 치지 않는다) */
  readonly target: UnitState | undefined;
  /** 목표가 사거리 밖이면 쫓는다 */
  readonly chase: boolean;
  /** 자기 가장자리 쪽으로 한 걸음 물러난다 */
  readonly back: boolean;
  /** 쫓지 않을 때 걸어갈 칸(키 = 거리장 캐시 키). null이면 목표가 없을 때 적 쪽으로(돌격과 같은 길) */
  readonly goal: { readonly key: string; readonly cells: () => number[] } | null;
  /** 목표도 길도 없으면 서 있는다(수비 집중·지연전) */
  readonly stay: boolean;
}

/** 옆 좌표(앞 방향에 수직, 0 ~ size − 1) */
function lateralOf(edge: Edge, x: number, y: number): number {
  return edge === 0 || edge === 2 ? x : y;
}

/** 맞은편 가장자리 가운데 길(중앙 돌파) 또는 옆 길(측면 우회: low = 옆 좌표 작은 쪽). 옆 길 폭 = size ÷ laneDivisor(출발값 1/3) */
function edgeThird(edge: Edge, size: number, part: "middle" | "low" | "high", divisor: number): number[] {
  const third = Math.max(1, Math.floor(size / Math.max(2, Math.trunc(divisor))));
  const from = part === "low" ? 0 : part === "middle" ? third : size - third;
  const to = part === "low" ? third : part === "middle" ? size - third : size;
  return oppositeEdgeCells(edge, size).filter((cell) => {
    const lat = edge === 0 || edge === 2 ? cell % size : Math.floor(cell / size);
    return lat >= from && lat < to;
  });
}

function nearest(unit: UnitState, list: readonly UnitState[]): UnitState | undefined {
  let best: UnitState | undefined;
  let bestD = 0;
  for (const enemy of list) {
    const d = chebyshev(unit.x, unit.y, enemy.x, enemy.y);
    if (!best || d < bestD || (d === bestD && enemy.id < best.id)) {
      best = enemy;
      bestD = d;
    }
  }
  return best;
}

/** score가 가장 작은 적(같으면 가까운 적 → 작은 ID) */
function minBy(
  unit: UnitState,
  list: readonly UnitState[],
  score: (enemy: UnitState) => number,
): UnitState | undefined {
  let best: UnitState | undefined;
  let bestS = 0;
  let bestD = 0;
  for (const enemy of list) {
    const s = score(enemy);
    const d = chebyshev(unit.x, unit.y, enemy.x, enemy.y);
    if (!best || s < bestS || (s === bestS && (d < bestD || (d === bestD && enemy.id < best.id)))) {
      best = enemy;
      bestS = s;
      bestD = d;
    }
  }
  return best;
}

/** 재능 계열(D-557 답 1): 1차 DEX + AGI가 STR + VIT와 INT + WIS보다 크다 */
export function talentUnit(unit: Pick<UnitState, "primaries">): boolean {
  const p = unit.primaries;
  const talent = (p[1] ?? 0) + (p[2] ?? 0);
  return talent > (p[0] ?? 0) + (p[3] ?? 0) && talent > (p[4] ?? 0) + (p[5] ?? 0);
}

const assault = (unit: UnitState, view: TacticView): TacticPlan => ({
  target: nearest(unit, view.enemies),
  chase: true,
  back: false,
  goal: null,
  stay: false,
});

/** 전개 방식 계획 */
export function planTactic(unit: UnitState, tactic: Tactic, view: TacticView): TacticPlan {
  const { size, edge, enemies } = view;
  const k = view.k ?? DEFAULT_TACTIC_COEFFICIENTS;
  const near = nearest(unit, enemies);
  const dist = near ? chebyshev(unit.x, unit.y, near.x, near.y) : Number.POSITIVE_INFINITY;
  switch (tactic) {
    case "defend": {
      const anchor = view.anchor ?? unit.y * size + unit.x;
      const ax = anchor % size;
      const ay = (anchor - ax) / size;
      const inZone = enemies.filter((enemy) => chebyshev(ax, ay, enemy.x, enemy.y) <= k.defendRadius);
      const target = nearest(unit, inZone) ?? (dist <= unit.range ? near : undefined);
      const home = unit.y * size + unit.x === anchor;
      return {
        target,
        chase: inZone.length > 0,
        back: false,
        goal: home ? null : { key: `cell:${unit.side}:${anchor}`, cells: () => [anchor] },
        stay: true,
      };
    }
    case "center": {
      const mid = Math.floor((size - 1) / 2);
      return {
        target: minBy(unit, enemies, (enemy) => Math.abs(lateralOf(edge, enemy.x, enemy.y) - mid)),
        chase: true,
        back: false,
        goal: { key: `center:${unit.side}`, cells: () => edgeThird(edge, size, "middle", k.laneDivisor) },
        stay: false,
      };
    }
    case "flank": {
      if (edgeProgress(edge, unit.x, unit.y, size) * 1000 >= size * k.flankTurnPm) return assault(unit, view);
      const mid = Math.floor((size - 1) / 2);
      const lat = lateralOf(edge, unit.x, unit.y);
      const part = lat < mid || (lat === mid && unit.party % 2 === 0) ? "low" : "high";
      return {
        target: dist <= unit.range ? near : undefined,
        chase: false,
        back: false,
        goal: { key: `flank:${unit.side}:${part}`, cells: () => edgeThird(edge, size, part, k.laneDivisor) },
        stay: false,
      };
    }
    case "infiltrate": {
      if (!talentUnit(unit)) return assault(unit, view);
      const backline = enemies.filter((enemy) => enemy.range >= k.backlineRange);
      // 가장 깊이 있는 적 = 내 가장자리에서 가장 먼 적(점수가 작을수록 먼저이므로 음수)
      const target = minBy(unit, backline, (enemy) => -edgeProgress(edge, enemy.x, enemy.y, size)) ?? near;
      return { target, chase: true, back: false, goal: null, stay: false };
    }
    case "focus": {
      const commander = enemies.filter((enemy) => view.commanders.has(enemy.id));
      const target =
        minBy(unit, commander, () => 0) ??
        minBy(unit, enemies, (enemy) => enemy.hp + enemy.armor + enemy.shield);
      return { target, chase: true, back: false, goal: null, stay: false };
    }
    case "harass": {
      if (unit.range < k.harassMinRange) return assault(unit, view);
      return { target: near, chase: dist > unit.range, back: dist < unit.range, goal: null, stay: false };
    }
    case "delay": {
      const room = edgeProgress(edge, unit.x, unit.y, size) > view.retreatBand + 1;
      return {
        target: dist <= unit.range ? near : undefined,
        chase: false,
        back: room && dist <= unit.range + k.delayGap,
        goal: null,
        stay: true,
      };
    }
    default:
      return assault(unit, view);
  }
}
