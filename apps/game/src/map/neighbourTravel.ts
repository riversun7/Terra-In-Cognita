// 옆 2차맵 땅 누르기 → 고른 내 유닛을 그곳으로 보낸다 — 사용자 지적 2026-11-09 "옆 2차맵 클릭도 안되어 이동도 안되고 화살표를 눌러야한다"
// (docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜"). 엔진 onNeighbourTap에 넘길 함수를 만든다(엔진을 만들 때 한 번 — useMapEngine.ts).
// - 보내는 유닛: 고른 유닛(없으면 기준 유닛). 다룰 수 없으면(남의 유닛·수호신·포로·중태) 땅 누르기와 같은 안내.
// - 명령: 2차맵 사이 이동 travel_start(옆 2차맵·그 틀의 칸, 변까지 걷고 넘는다 — 서버 판정). 넘으면 화면이 로딩 없이 그 2차맵으로 넘는다.
import type { MapUnit } from "@terra/shared/mapUnits";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { CommandNotice } from "./commandNotice.ts";
import type { MapFeed } from "./feedTypes.ts";
import { canCommand, unitControlOf, unitName } from "./mapUnits.ts";
import { neighbourCellAt } from "./neighbourTap.ts";
import { sendTravelCommand } from "./travelCommands.ts";

export interface NeighbourTravelInput {
  readonly mapKeyRef: RefObject<number>;
  readonly selectedRef: RefObject<number | null>;
  readonly anchorRef: RefObject<number | null>;
  readonly feedRef: RefObject<MapFeed | null>;
  readonly unitsRef: RefObject<readonly MapUnit[] | null>;
  readonly operatorRef: RefObject<boolean>;
  readonly setCommand: Dispatch<SetStateAction<CommandNotice | null>>;
  /** 목적지 표시(엔진 setMoveTarget, null이면 거둔다) — 보낼 때 누른 자리에, 거절되면 거둔다 */
  readonly markTarget?: (cell: { x: number; y: number } | null) => void;
}

/** 엔진 onNeighbourTap에 넘길 함수(지금 2차맵 틀의 배치 칸). 부를 때 ref를 읽는다 */
export function createNeighbourTravel(input: NeighbourTravelInput): (cell: { x: number; y: number }) => void {
  const { mapKeyRef, selectedRef, anchorRef, feedRef, unitsRef, operatorRef, setCommand, markTarget } = input;
  return (cell) => {
    const target = neighbourCellAt(mapKeyRef.current, cell);
    const unitId = selectedRef.current ?? anchorRef.current;
    if (!target || unitId === null) return;
    const mine = unitsRef.current?.find((unit) => unit.unitId === unitId);
    const control = unitControlOf({
      operator: operatorRef.current,
      mine,
      ownByFeed: feedRef.current?.isOwn(unitId) ?? false,
    });
    if (control.kind === "hold") {
      setCommand({ kind: "hold", hold: control.hold, label: mine ? unitName(mine) : String(unitId) });
      return;
    }
    if (!canCommand(control)) {
      setCommand({ kind: "view_only" });
      return;
    }
    setCommand({ kind: "travel", unitId, outcome: null });
    markTarget?.(cell);
    void sendTravelCommand({
      t: "travel_start",
      unitId,
      mapKey: target.mapKey,
      x: target.x,
      y: target.y,
      kind: "move",
    }).then((outcome) => {
      if (!outcome.ok) markTarget?.(null);
      setCommand({ kind: "travel", unitId, outcome });
    });
  };
}
