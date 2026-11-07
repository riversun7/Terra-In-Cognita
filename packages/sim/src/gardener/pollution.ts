// 오염 층 — docs/adr/2026-11-01-gardener-r5b.md 1절, 기획 D-115·D-460 200(P15)
// 1차맵 칸(면 레벨 F9 = 2차맵 하나)마다 오염 정수 0~cellMax. 값이 있는 칸만 든 성긴 표(칸 키 → 값)다.
// 칸의 모양(이웃)은 부르는 쪽이 준다: 서버는 행성 칸 키·이웃 8칸(@terra/planet neighbors8, 큐브 모서리 칸은 7칸),
// 시뮬레이터는 지형이 없어 도시마다 합성 격자 칸을 준다(squareGrid). @terra/sim은 @terra/planet을 가져오지 않는다.
// 하루 한 번(dailyPollutionStep): 숲 감소 → 자연 감소(올림, 최소 1) → 퍼짐(이웃에 고르게, 내림) → 상한. 넣은 차례와 상관없이 같다.
// 사건(시설 일·전투·인구·정화)은 addPollution으로 더한다.

export type PollutionLayer = Map<number, number>;

/** 칸의 이웃(이웃 차례는 정해져 있어야 한다. 결과는 차례와 상관없지만 같은 칸을 두 번 내지 않는다) */
export interface PollutionGrid {
  neighbors(cell: number): readonly number[];
}

interface PollutionRules {
  readonly cellMax: number;
}

const HOUR_MS = 3_600_000;

/** 칸에 오염을 더한다(빼기는 음수). 0~cellMax에서 자르고 0이 되면 지운다. 새 값 */
export function addPollution(layer: PollutionLayer, cell: number, amount: number, c: PollutionRules): number {
  const value = Math.max(0, Math.min(c.cellMax, (layer.get(cell) ?? 0) + Math.trunc(amount)));
  if (value === 0) layer.delete(cell);
  else layer.set(cell, value);
  return value;
}

/** 휴먼 오염: humansPerStep명당 하루 humanStep(내림) */
export function humanPollution(
  humans: number,
  c: { readonly humansPerStep: number; readonly humanStep: number },
): number {
  return Math.floor((Math.max(0, humans) * c.humanStep) / Math.max(1, c.humansPerStep));
}

/**
 * 시설 오염: Σ(시설 레벨 × 시설 오염 값 × 일한 ms)를 1시간 단위로 내림. 부르는 쪽이 하루 동안 모은 합을 준다
 * (생산 한 번마다 내림하면 짧은 생산의 몫이 사라진다)
 */
export function facilityPollution(weightedWorkMs: number): number {
  return Math.floor(Math.max(0, weightedWorkMs) / HOUR_MS);
}

/** 정화 한 번: purifyAmount만큼 뺀다(정화 직무 D-310이 부른다). 새 값 */
export function purify(
  layer: PollutionLayer,
  cell: number,
  c: PollutionRules & { readonly purifyAmount: number },
): number {
  return addPollution(layer, cell, -c.purifyAmount, c);
}

/**
 * 하루 바뀜(새 표, 원본은 그대로). 칸마다 지난 값에서:
 * 숲 칸이면 forestDaily를 빼고, 자연 감소 ⌈값 × decayBp ÷ 10000⌉을 빼고, 퍼짐 ⌊값 × spreadBp ÷ 10000⌋을 이웃 수로 나눠
 * 이웃마다 몫(내림)을 보낸다(나머지는 제자리). 모든 칸의 바뀜을 지난 값으로 셈한 뒤 더하므로 차례와 상관없다.
 */
export function dailyPollutionStep(
  layer: PollutionLayer,
  grid: PollutionGrid,
  c: PollutionRules & {
    readonly decayBp: number;
    readonly spreadBp: number;
    readonly forestDaily: number;
  },
  isForest?: (cell: number) => boolean,
): PollutionLayer {
  const next = new Map<number, number>();
  const add = (cell: number, amount: number): void => {
    next.set(cell, (next.get(cell) ?? 0) + amount);
  };
  for (const cell of [...layer.keys()].toSorted((a, b) => a - b)) {
    let value = layer.get(cell) ?? 0;
    if (isForest?.(cell)) value = Math.max(0, value - c.forestDaily);
    if (value > 0) value -= Math.min(value, Math.ceil((value * c.decayBp) / 10_000));
    const neighbors = value > 0 ? grid.neighbors(cell) : [];
    const share =
      neighbors.length === 0 ? 0 : Math.floor(Math.floor((value * c.spreadBp) / 10_000) / neighbors.length);
    if (share > 0) {
      for (const other of neighbors) add(other, share);
      value -= share * neighbors.length;
    }
    add(cell, value);
  }
  const out = new Map<number, number>();
  for (const cell of [...next.keys()].toSorted((a, b) => a - b)) {
    const value = Math.min(c.cellMax, next.get(cell) ?? 0);
    if (value > 0) out.set(cell, value);
  }
  return out;
}

/** 칸에서 이웃을 radius 걸음 안에 닿는 칸(자기 포함, 칸 키 차례). 이웃 8칸 격자면 체비쇼프 반경이다 */
export function influenceCells(cell: number, grid: PollutionGrid, radius: number): number[] {
  const seen = new Set<number>([cell]);
  let ring = [cell];
  for (let step = 0; step < radius; step++) {
    const next: number[] = [];
    for (const from of ring)
      for (const other of grid.neighbors(from))
        if (!seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
    ring = next;
  }
  return [...seen].toSorted((a, b) => a - b);
}

/** 영향권 오염 합(도시 칸 + 반경 안 칸, D-192) */
export function influenceSum(
  layer: PollutionLayer,
  cell: number,
  grid: PollutionGrid,
  radius: number,
): number {
  let sum = 0;
  for (const other of influenceCells(cell, grid, radius)) sum += layer.get(other) ?? 0;
  return sum;
}

/**
 * 세력 오염(D-509, D-511 기술 해석 "그 세력 칸 오염의 합으로 시작"): 그 세력 도시들의 영향권 칸을 합친 집합(겹치는 칸은 한 번)의
 * 오염 합. 세력 오염은 목표 순위·세기를 정하고 정원 세력 관계도를 깎는다
 */
export function unionInfluenceSum(
  layer: PollutionLayer,
  cells: readonly number[],
  grid: PollutionGrid,
  radius: number,
): number {
  const seen = new Set<number>();
  let sum = 0;
  for (const cell of cells)
    for (const other of influenceCells(cell, grid, radius))
      if (!seen.has(other)) {
        seen.add(other);
        sum += layer.get(other) ?? 0;
      }
  return sum;
}

/** 합성 정사각 격자(한 변 size, 칸 = y × size + x, 이웃 8칸, 가장자리 밖은 없다). 시뮬레이터·시험용 */
export interface SquareGrid extends PollutionGrid {
  readonly size: number;
  cellOf(x: number, y: number): number;
}

export function squareGrid(size: number): SquareGrid {
  return {
    size,
    cellOf: (x, y) => y * size + x,
    neighbors(cell) {
      const x = cell % size;
      const y = Math.floor(cell / size);
      const out: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(ny * size + nx);
        }
      return out;
    },
  };
}
