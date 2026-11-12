// 채집소 판 자료(tRPC gather.station)와 문구 도우미 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요",
// docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 사용자 지적: 채집소 기능)". 2차맵 건물 판(StationPanel.tsx)과 건물 화면 카드
// (economy/StationParts.tsx)가 함께 쓴다. 엔진을 가져오지 않는다. 시각은 서버 ms다.
// facility 채집소(농장 — 오브젝트 없음, 기획 정리 756 ②)는 반경·다시 자람이 없어(null) 그 문구를 빼고 보인다.
import type { GatherKindView } from "@terra/shared/gather";
import type {
  GatherStationBuffs,
  GatherStationKind,
  GatherStationResponse,
  GatherStationWorker,
  GatherStationWorkerRest,
  GatherStationWorkerState,
} from "@terra/shared/gatherStation";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import type { GatherObjectEntry } from "./gatherState.ts";

const REQUEST_TIMEOUT_MS = 10_000;
/** 채집소 판을 다시 묻는 간격(ms) */
export const STATION_POLL_MS = 15_000;

export function loadGatherStation(buildingId: number, signal?: AbortSignal): Promise<GatherStationResponse> {
  return api.gather.station.query(
    { buildingId },
    { signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
}

/** 배율(‰) → 더함 %(1400 → 40) */
export const gainPct = (pm: number): number => Math.round((Math.max(0, pm) - 1000) / 10);
/** 배율(‰) → 줄임 %(500 → 50) */
export const cutPct = (pm: number): number => Math.round((1000 - Math.min(1000, Math.max(0, pm))) / 10);

/** 버프 한 줄: 채집량 +x% · 피로 −y% · 다시 자람 −z%(다시 자람이 없으면 앞 둘만) */
export function buffsText(buffs: GatherStationBuffs): string {
  if (buffs.regrowPm === null)
    return m.station_buffs_line_facility({ gain: gainPct(buffs.yieldPm), fatigue: cutPct(buffs.fatiguePm) });
  return m.station_buffs_line({
    gain: gainPct(buffs.yieldPm),
    fatigue: cutPct(buffs.fatiguePm),
    regrow: cutPct(buffs.regrowPm),
  });
}

/** 다음 레벨 미리 보기 한 줄(반경이 없으면 버프만) */
export function nextLevelText(level: number, buffs: GatherStationBuffs): string {
  if (buffs.radiusCells === null) return m.station_next_level_facility({ level, buffs: buffsText(buffs) });
  return m.station_next_level({ level, cells: buffs.radiusCells, buffs: buffsText(buffs) });
}

/** g(10진 글자) → kg 글자(소수 한 자리) */
export function kgOf(grams: string): string {
  const value = /^[0-9]{1,30}$/.test(grams) ? Number(BigInt(grams) / 100n) / 10 : 0;
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(value);
}

/** 원장 수량(10진 글자) → 글자 */
export function qtyOf(qty: string): string {
  if (!/^[0-9]{1,30}$/.test(qty)) return qty;
  return new Intl.NumberFormat(getLocale()).format(BigInt(qty));
}

/** 창고 무게 몫(0~100, 상한이 없으면 null) */
export function usedPct(storage: GatherStationResponse["storage"]): number | null {
  if (storage.capacityGrams === null || !/^[0-9]{1,30}$/.test(storage.capacityGrams)) return null;
  const capacity = BigInt(storage.capacityGrams);
  if (capacity <= 0n || !/^[0-9]{1,30}$/.test(storage.usedGrams)) return 100;
  const used = BigInt(storage.usedGrams);
  return Number(((used >= capacity ? capacity : used) * 100n) / capacity);
}

/** 일꾼 상태 문구. facility 채집소의 일함은 "캐는 중"이 아니라 "일하는 중" */
export function workerStateText(
  state: GatherStationWorkerState,
  kind: GatherStationKind = "objects",
): string {
  switch (state) {
    case "working":
      return kind === "objects" ? m.station_state_working() : m.station_state_working_facility();
    case "resting":
      return m.station_state_resting();
    case "no_objects":
      return m.station_state_no_objects();
    case "storage_full":
      return m.station_state_storage_full();
    case "stopped":
      return m.station_state_stopped();
    case "away":
      return m.station_state_away();
    case "waiting":
      return m.station_state_waiting();
    default: {
      const unhandled: never = state;
      return unhandled;
    }
  }
}

/** 일꾼이 쉬는 곳(질문 1088 가): 숙소 Lv·집과 회복 배율(‰ → ×1.5) */
export function restText(rest: GatherStationWorkerRest): string {
  const rate = (Math.max(0, rest.recoveryPm) / 1000).toFixed(1);
  return rest.kind === "lodging"
    ? m.station_worker_rest_lodging({ level: rest.level, rate })
    : m.station_worker_rest_home({ rate });
}

export function workerViaText(worker: GatherStationWorker): string {
  switch (worker.via) {
    case "assign":
      return m.station_worker_via_assign();
    case "wage":
      return m.station_worker_via_wage();
    case "lease":
      return m.station_worker_via_lease();
    default: {
      const unhandled: never = worker.via;
      return unhandled;
    }
  }
}

/** 반경 안에서 지금 캘 수 있는 가장 가까운 오브젝트(이 채집소가 맡는 종류, 같으면 작은 번호) */
export function nearestReady(
  station: Pick<GatherStationResponse, "facilityId" | "x" | "y" | "buffs">,
  objects: readonly GatherObjectEntry[],
  kinds: readonly GatherKindView[],
  nowMs: number,
): GatherObjectEntry | undefined {
  if (!station.buffs || station.buffs.radiusCells === null || station.facilityId === null) return undefined;
  const radius = station.buffs.radiusCells;
  let best: GatherObjectEntry | undefined;
  let bestDistance = 0;
  for (const object of objects) {
    const kind = kinds[object.kind];
    // 밭·목초지·물터(direct false)는 일꾼만 쓴다 — [직접 캐기] 대상이 아니다
    if (kind?.facility !== station.facilityId || kind.direct === false) continue;
    if (object.usesLeft <= 0 && object.regrowAtMs > nowMs) continue;
    const dx = object.x - station.x;
    const dy = object.y - station.y;
    const distance = dx * dx + dy * dy;
    if (distance > radius * radius) continue;
    if (!best || distance < bestDistance || (distance === bestDistance && object.id < best.id)) {
      best = object;
      bestDistance = distance;
    }
  }
  return best;
}
