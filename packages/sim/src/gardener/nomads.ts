// 유목 정원사 부대 규칙 — docs/adr/2026-11-01-gardener-r5b.md 3절, 기획 D-203·D-206·D-319·D-320·D-321, D-460 202, D-464(질문 221 가)
// 부대는 도시 영향권 밖의 오염원을 찾아 떠돈다(D-206). 목표 = 탐지 거리 안·영향권 밖·문턱 이상·제외 안 된 칸 가운데 가장 높은 칸.
// 종류는 데이터(정찰대·정화 군단, 파수꾼은 출현 한도 D-050이 정해지면). 순수 함수만: 예약·싸움은 부르는 쪽(gardenerRun.ts·서버)이 한다.
import type { GardenerCoefficients } from "./coefficients.ts";
import { type PollutionGrid, type PollutionLayer, influenceCells } from "./pollution.ts";
import { floorLog2 } from "./waves.ts";

export const NOMAD_KINDS = ["scout", "legion"] as const;
export type NomadKind = (typeof NOMAD_KINDS)[number];

export interface NomadParty {
  readonly id: number;
  readonly kind: NomadKind;
  /** 지금 자리(1차맵 칸) */
  cell: number;
  /** 고른 목표 칸과 도착 시각(진군 중일 때) */
  target: number | null;
  arriveAtMs: number | null;
  /** 진군 중인 규모(모함 몫에서 빌린 수) */
  size: number;
  /** 실패한 목표 → 다시 고를 수 있는 시각(C18 유목 제외 7일) */
  readonly excluded: Map<number, number>;
}

/** 행성 하나의 처음 부대: 정찰대 nomadScouts·정화 군단 nomadLegions, 처음 자리 = 모함 칸 */
export function startingNomads(mothershipCell: number, c: GardenerCoefficients): NomadParty[] {
  const kinds: NomadKind[] = [
    ...Array.from({ length: c.nomadScouts }, (): NomadKind => "scout"),
    ...Array.from({ length: c.nomadLegions }, (): NomadKind => "legion"),
  ];
  return kinds.map((kind, index) => ({
    id: index + 1,
    kind,
    cell: mothershipCell,
    target: null,
    arriveAtMs: null,
    size: 0,
    excluded: new Map(),
  }));
}

/** 그 종류가 고르는 오염인가(문턱 이상, 정찰대 < nomadLegionAt ≤ 정화 군단) */
export function nomadFits(kind: NomadKind, value: number, c: GardenerCoefficients): boolean {
  if (value < c.nomadThreshold) return false;
  return kind === "legion" ? value >= c.nomadLegionAt : value < c.nomadLegionAt;
}

/** 탐지 거리 안의 목표(없으면 null). 같은 값이면 작은 칸 키 */
export function nomadTarget(
  layer: PollutionLayer,
  from: number,
  grid: PollutionGrid,
  c: GardenerCoefficients,
  o: {
    readonly kind: NomadKind;
    readonly inInfluence: (cell: number) => boolean;
    readonly excluded: ReadonlyMap<number, number>;
    readonly nowMs: number;
  },
): number | null {
  let best: { cell: number; value: number } | null = null;
  for (const cell of influenceCells(from, grid, c.nomadDetect)) {
    const value = layer.get(cell) ?? 0;
    if (!nomadFits(o.kind, value, c) || o.inInfluence(cell)) continue;
    if ((o.excluded.get(cell) ?? 0) > o.nowMs) continue;
    if (!best || value > best.value) best = { cell, value };
  }
  return best?.cell ?? null;
}

/** 부대 규모: 정찰대 nomadScoutSize, 정화 군단 strengthBase × (1 + ⌊log2(1 + ⌊오염 ÷ 걸음⌋)⌋)(D-319 "오염에 비례") */
export function nomadSize(kind: NomadKind, targetValue: number, c: GardenerCoefficients): number {
  if (kind === "scout") return c.nomadScoutSize;
  const steps = BigInt(Math.floor(Math.max(0, targetValue) / Math.max(1, c.nomadLegionStep)));
  return c.strengthBase * (1 + floorLog2(1n + steps));
}

/** 떠돎: 반경 안 칸(칸 키 차례) 가운데 굴림으로 하나 */
export function roamCell(from: number, grid: PollutionGrid, radius: number, roll: number): number {
  const cells = influenceCells(from, grid, radius);
  return cells[Math.abs(Math.trunc(roll)) % cells.length] ?? from;
}
