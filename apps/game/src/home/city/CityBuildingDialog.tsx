// 홈 [도시 활동] 카드의 건물 판 대화상자 — 지연 조각(default export). 카드의 건물 줄을 누르면 2차맵에서 건물을 눌렀을 때와 같은 판을 연다
// (사용자 답 2026-11-25 "2차맵 건물 판 그대로"): 개요·일꾼·창고·장부·지분·관리 칸, 행정 건물이면 정부 몫, [들어가기]·[닫기].
// - 2차맵의 채집·건물 판(map/gather/GatherPanel.tsx)을 지도 없이 쓴다: 판 상태(gatherState)를 대화상자마다 하나 만들어 그 건물을 연 채로 둔다.
//   판이 스스로 닫히면([닫기], 들어가기를 보낸 뒤) 대화상자도 닫는다. 채집소 반경 고리(state.ring)는 그릴 지도가 없어 쓰이지 않는다.
// - 명령 규칙은 2차맵과 같다(사용자 답 "2차맵과 같은 규칙"): 들어가기는 기준 유닛이 실제로 걸어가고 판정은 서버가 한다(WebSocket unit_enter).
// - 위 줄 바로가기: [2차맵에서 보기](그 2차맵을 연다)·[경제 화면]. 운영자 모드는 없다(남의 건물 관리는 2차맵 운영 단추에서).
import type { MapUnitsResponse } from "@terra/shared/mapUnits";
import { useEffect, useRef, useState } from "react";
import { GovernmentSheet } from "../../government/GovernmentSheet.tsx";
import { GatherPanel } from "../../map/gather/GatherPanel.tsx";
import { createGatherState } from "../../map/gather/gatherState.ts";
import { loadMapUnits, unitLabel } from "../../map/mapUnits.ts";
import { m } from "../../paraglide/messages.js";
import { HomeLink } from "../shellParts.tsx";
import "../../map/map.css";
import "./cityCard.css";
import "./cityDialog.css";

interface CityBuildingDialogProps {
  readonly mapKey: number;
  readonly buildingId: number;
  /** 목록에서 읽은 건물 이름(대화상자 이름 — 모르면 null) */
  readonly buildingName: string | null;
  /** 명령을 받을 기준 유닛(카드에서 고른 내 유닛) */
  readonly actor: number;
  readonly onClose: () => void;
}

export default function CityBuildingDialog({
  mapKey,
  buildingId,
  buildingName,
  actor,
  onClose,
}: CityBuildingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state] = useState(() => {
    const created = createGatherState();
    created.open({ kind: "building", id: buildingId });
    return created;
  });
  // 이 2차맵의 내 유닛(보내는 유닛 이름·배에 탔나) — 열 때 한 번
  const [units, setUnits] = useState<MapUnitsResponse | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // 건물 판이 스스로 닫히면 대화상자를 닫는다(onClose는 <dialog>의 close 알림이 부른다)
  useEffect(
    () =>
      state.subscribe(() => {
        if (state.sheet === null) dialogRef.current?.close();
      }),
    [state],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadMapUnits(mapKey, controller.signal).then(setUnits, () => undefined);
    return () => controller.abort();
  }, [mapKey]);

  const here = units?.status === "ready" ? units.units : null;
  const name = buildingName ?? m.nearby_building_unknown({ id: buildingId });
  return (
    <dialog
      ref={dialogRef}
      className="city-dialog"
      aria-label={m.home_city_dialog_label({ building: name })}
      data-building={buildingId}
      onClose={onClose}
      // 판 밖(바탕)을 누르면 닫는다 — 판 안을 누른 것은 대화상자 자신이 아니다
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="city-dialog-frame">
        <div className="city-dialog-bar">
          <HomeLink to={{ route: "map", search: { key: String(mapKey) } }} className="city-link-button">
            {m.home_city_dialog_map()}
          </HomeLink>
          <HomeLink to={{ route: "economy" }} className="city-link-button">
            {m.home_city_dialog_economy()}
          </HomeLink>
        </div>
        <GatherPanel
          state={state}
          mapKey={mapKey}
          actor={actor}
          actorAboard={here?.some((unit) => unit.unitId === actor && unit.aboard != null) === true}
          unitLabel={(unitId) => unitLabel(unitId, here)}
          buildingExtra={<GovernmentSheet state={state} embedded />}
        />
      </div>
    </dialog>
  );
}
