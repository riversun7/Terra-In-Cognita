// 일터로 걸어가기 — 사용자 결정 D-591("어떠한 경우에도 순간이동은 없다"), D-555 1505("어떤 유닛이든 실제로 옮겨야한다"), 질문 2656 나(줄기 no-teleport-b).
// 예전에는 직무 배치·노동 계약(구인 받기·비접속 관리인 포함)을 맺으면 같은 2차맵 어디에 있든 그 자리에서 바로 그 시설 일을 했다(떨어져서 일함).
// - 일을 맡으면(workBook.ts startJob — 배치·계약·구인 받기·관리인 모두 이 한 곳) 유닛이 그 시설 둘레(건물 발자국 바깥 WORK_REACH_CELLS칸 안)로 걸어간다
//   (그 2차맵 길 찾기, 플레이어 이동 명령과 같은 걷기). 이미 둘레면 걷지 않는다.
// - 가는 동안(보낸 시각 ~ 도착 시각)은 일하지 않은 것으로 센다: 산출 없음(정산 멈춤 구간 — world/settlement.ts mergePauses), 작업 중 부상 굴림 없음(그 구간을
//   빼고 굴린다), 노동 계약의 임금·임대료도 도착 시각부터(계약 정산 시각을 도착으로 미룬다 — 아직 아무것도 치르지 않은 계약만). 직무 상태(피로·단계)는
//   그대로 흐른다 [임시 — 질문 2699].
// - 화면은 그 일꾼 줄에 "가는 중 · 도착 …"을 보인다(commuteOf → 시설 조회 FacilityWorkerView.commuteUntil).
// - NPC 휴먼(봇)은 스스로 일터·집을 오간다(npc/humanPlaces.ts·world/bots.ts "WP-NPC4") — 여기서 보내지 않는다.
// - 가는 길(멈춤 구간)은 메모리에만 있다. 다시 켜면 남은 길의 멈춤이 사라진다(유닛은 저장된 움직임대로 계속 걷는다 — 계약 임금 시작은 저장된다) [임시 2699].
//   길이 없거나 가는 중에 다른 명령으로 떠나도 일은 그대로다(같은 2차맵 조건 — 예전 규칙) [임시 2699].
import type { LaborContract } from "@terra/sim";
import {
  type CellRect,
  type Point,
  type SizeClass,
  anchorAt,
  anchorCenter,
  arrivalAt,
  footprintRect,
  positionAt,
} from "@terra/sim";
import type { SecondMap } from "../world/secondMap.ts";
import type { OutputPauses, PauseWindow, WorkInjuryHook } from "../world/settlement.ts";
import { UNIT_KIND_BOT } from "../world/unitKinds.ts";

/** [임시 2699] 시설 둘레 = 건물 발자국 바깥 이 칸 안(닿은 것으로 본다) */
export const WORK_REACH_CELLS = 4;
/** 걸어갈 칸 = 건물 발자국 바깥 이 칸(설 수 없으면 둘레에서 찾는다) */
const GOAL_MARGIN_CELLS = 2;
/** 설 칸을 찾는 반지름(칸) */
const GOAL_SEARCH_CELLS = 6;
/** 정산되지 않은 지난 길도 이만큼은 기억한다(그 뒤 지운다 — 오래 정산하지 않은 주체는 그 구간을 일한 것으로 센다) */
const KEEP_MS = 7 * 24 * 60 * 60_000;

/** 가는 길 하나 */
interface Trip {
  readonly ownerId: number;
  readonly buildingId: number;
  readonly fromMs: number;
  readonly untilMs: number;
}

export interface WalkToWork {
  /** 일을 맡은 유닛을 그 시설 둘레로 보낸다(이미 둘레·봇·없는 유닛·없는 건물이면 아무것도 하지 않는다) */
  begin(unitId: number, buildingId: number): void;
  /** 가는 중이면 도착 예상 시각(아니면 undefined) */
  commuteOf(unitId: number): number | undefined;
  /** 정산 멈춤 구간 고리: 그 주체의 가는 길을 시설 작업 멈춤(base)에 더한다 */
  pauses(base: OutputPauses): OutputPauses;
  /** 작업 중 부상 고리에서 가는 길 구간을 뺀다 */
  injury(hook: WorkInjuryHook): WorkInjuryHook;
}

/** 칸과 네모 사이 체비쇼프 거리(안이면 0) */
export function cellGap(cell: { readonly x: number; readonly y: number }, rect: CellRect): number {
  const dx = Math.max(rect.x - cell.x, 0, cell.x - (rect.x + rect.width - 1));
  const dy = Math.max(rect.y - cell.y, 0, cell.y - (rect.y + rect.height - 1));
  return Math.max(dx, dy);
}

/** 그 2차맵에서 그 건물의 발자국(없으면 undefined) */
function rectOf(map: SecondMap, buildingId: number): CellRect | undefined {
  let rect: CellRect | undefined;
  map.forEachBuilding((building) => {
    if (!rect && building.id === buildingId) rect = footprintRect(building.placement);
  });
  return rect;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** 걸어갈 칸: 유닛 쪽 건물 발자국 바깥 GOAL_MARGIN_CELLS 칸(설 수 없으면 그 둘레에서 가장 가까운 설 칸) */
function goalNear(map: SecondMap, from: Point, size: SizeClass, rect: CellRect): Point | undefined {
  const here = anchorAt(from, size);
  const x = clamp(here.x, rect.x - GOAL_MARGIN_CELLS, rect.x + rect.width - 1 + GOAL_MARGIN_CELLS);
  const y = clamp(here.y, rect.y - GOAL_MARGIN_CELLS, rect.y + rect.height - 1 + GOAL_MARGIN_CELLS);
  for (let radius = 0; radius <= GOAL_SEARCH_CELLS; radius++)
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const cell = { x: x + dx, y: y + dy };
        if (
          cellGap(cell, rect) > 0 &&
          cellGap(cell, rect) <= WORK_REACH_CELLS &&
          map.isStandable(cell.x, cell.y, size)
        )
          return anchorCenter(cell.x, cell.y, size);
      }
  return undefined;
}

/**
 * 노동 계약의 임금·임대료를 도착 시각부터(질문 2699 [임시]): 그 유닛의 열린 계약 가운데 아직 치른 것이 없고 정산 시각이 도착 전인 계약의 정산·다음 지급
 * 시각을 도착으로 미룬다. 바꾼 계약은 save로 저장한다
 */
export function shiftPayStart(
  contracts: Iterable<LaborContract>,
  unitId: number,
  atMs: number,
  save: (c: LaborContract) => void,
): void {
  for (const c of contracts) {
    if (c.unitId !== unitId || c.state !== "active" || c.paidTotal !== 0n || c.settledAtMs >= atMs) continue;
    c.settledAtMs = atMs;
    if (c.nextDueMs < atMs) c.nextDueMs = atMs;
    save(c);
  }
}

export function createWalkToWork(deps: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly now: () => number;
  /** 도착 시각을 알면(계약 임금 시작을 미룬다 — shiftPayStart). 없으면 미루지 않는다 */
  readonly payFrom?: ((unitId: number, atMs: number) => void) | undefined;
}): WalkToWork {
  const trips = new Map<number, Trip>();
  const prune = (): void => {
    const cutoff = deps.now() - KEEP_MS;
    for (const [unitId, trip] of trips) if (trip.untilMs < cutoff) trips.delete(unitId);
  };
  return {
    begin(unitId, buildingId) {
      for (const map of deps.maps.values()) {
        const info = map.unitInfo(unitId);
        if (!info) continue;
        const rect = info.kind === UNIT_KIND_BOT ? undefined : rectOf(map, buildingId);
        if (!rect) return;
        const at = deps.now();
        const from = positionAt(info.motion, at);
        if (cellGap(anchorAt(from, info.size), rect) <= WORK_REACH_CELLS) return;
        const goal = goalNear(map, from, info.size, rect);
        if (!goal) return;
        const ownerId = info.ownerId;
        void map.moveUnit(unitId, goal).then((result) => {
          const motion = result.ok ? map.unitInfo(unitId)?.motion : undefined;
          if (!motion || arrivalAt(motion) <= at) return;
          prune();
          trips.set(unitId, { ownerId, buildingId, fromMs: at, untilMs: arrivalAt(motion) });
          deps.payFrom?.(unitId, arrivalAt(motion));
        });
        return;
      }
    },
    commuteOf(unitId) {
      const trip = trips.get(unitId);
      return trip && deps.now() < trip.untilMs ? trip.untilMs : undefined;
    },
    pauses(base) {
      return (ownerId) => {
        const given = base(ownerId);
        let out: Map<number, readonly PauseWindow[]> | undefined;
        for (const [unitId, trip] of trips) {
          if (trip.ownerId !== ownerId) continue;
          out ??= new Map(given ?? []);
          out.set(unitId, [...(out.get(unitId) ?? []), { fromMs: trip.fromMs, untilMs: trip.untilMs }]);
        }
        return out ?? given;
      };
    },
    injury(hook) {
      return (unit, fromMs, toMs, offline) => {
        const trip = trips.get(unit.id);
        if (!trip || trip.untilMs <= fromMs || trip.fromMs >= toMs) {
          hook(unit, fromMs, toMs, offline);
          return;
        }
        if (trip.fromMs > fromMs) hook(unit, fromMs, trip.fromMs, offline);
        if (trip.untilMs < toMs) hook(unit, trip.untilMs, toMs, offline);
      };
    },
  };
}
