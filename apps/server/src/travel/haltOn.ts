// 조우가 길을 멈춤 — service.ts에서 나눔(그 파일 1,000줄 상한). 기획 D-564 1641·D-570(encounterWorld.ts), docs/adr/2026-11-15-unloaded-second-maps.md.
import type { CellPoint } from "@terra/sim";
import type { WorldTravelStop } from "@terra/shared/worldMap";
import type { SecondMap } from "../world/secondMap.ts";
import type { TransferRow } from "../world/secondMapRows.ts";
import type { HiddenPlaceOf } from "./coordReads.ts";
import { haltedTrip } from "./serviceParts.ts";
import type { HaltedTrip, Journey } from "./serviceTypes.ts";

/** 멈춤이 쓰는 서비스 안쪽 몫 */
export interface HaltParts {
  readonly journeys: ReadonlyMap<number, Journey>;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly hiddenPlace: HiddenPlaceOf;
  readonly park: (row: TransferRow, mapKey: number, cell: CellPoint) => void;
  readonly finish: (journey: Journey, state: "arrived" | "stopped", stop: WorldTravelStop | null) => void;
  readonly arm: () => void;
}

/**
 * 그 2차맵을 지나는 그 유닛들의 길을 멈춘다. 좌표로 지나면 그 자리의 좌표 유닛으로(2차맵을 띄우면 장부에서 꺼내 놓인다), 띄운 2차맵을 걷는 중이면
 * 그 자리에 세운다(1901). 멈춘 길(전투 뒤 다시 판단 — 1908). NPC 이동(npcJourney.ts)은 멈추지 않는다(좌표 조우 밖 [임시 — 질문 2696])
 */
export function haltJourneys(parts: HaltParts, mapKey: number, unitIds: ReadonlySet<number>): HaltedTrip[] {
  const { journeys, maps, hiddenPlace, park, finish, arm } = parts;
  const halted: HaltedTrip[] = [];
  // finish가 목록에서 지우므로 사본으로 돈다
  for (const journey of Array.from(journeys.values())) {
    if (!unitIds.has(journey.unitId) || journey.npc === true) continue;
    const hidden = journey.hidden;
    if (hidden) {
      const place = hiddenPlace(journey, hidden);
      if (!place || place.mapKey !== mapKey || maps.has(mapKey)) continue;
      park(hidden.row, mapKey, place.cell);
      journey.hidden = null;
      journey.hiddenUntilMs = null;
      journey.leg = place.index;
    } else if (journey.route[journey.leg] !== mapKey || !maps.get(mapKey)?.halt(journey.unitId)) continue;
    halted.push(haltedTrip(journey));
    finish(journey, "stopped", "encounter");
  }
  arm();
  return halted;
}
