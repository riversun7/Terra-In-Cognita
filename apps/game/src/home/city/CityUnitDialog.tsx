// 홈 [도시 활동] 카드의 남의 유닛 대화상자 — 지연 조각(default export). 유닛 탭의 주변 유닛 줄을 누르면 2차맵에서 남의 유닛을 눌렀을 때와 같은
// 작은 창(map/UnitControlPanels.tsx PeekCard)을 연다(사용자 요청 2026-11-25 "유닛 탭에는 npc 유닛들도 보여지며 누르고 상호작용 가능"):
// - 한눈 정보(world.unitGlance — 세력·가문·무소속, 지금 시야 안일 때만). 시야 밖으로 나갔으면 번호·움직임만 보인다.
// - NPC 국가 지도자면 지도자 몫(government/LeaderSheet.tsx — 지도자와 이야기 = 그 나라 수도 정부 판).
// - [공격](map/UnitAttack.tsx — 기준 유닛으로 친다, WebSocket unit_attack). 같은 가문 유닛이면 없다(D-593).
// 규칙은 2차맵과 같다: 거리·소유·시가지·신용 판정은 서버가 한다. 운영자 조종 단추는 없다(2차맵 운영 단추에서).
import type { MapUnitGlance } from "@terra/shared/mapUnits";
import { useEffect, useRef, useState } from "react";
import { LeaderSheet } from "../../government/LeaderSheet.tsx";
import { createLeaderTagState } from "../../map/leaderTags.ts";
import { loadUnitGlance } from "../../map/mapUnits.ts";
import { UnitAttack } from "../../map/UnitAttack.tsx";
import { PeekCard } from "../../map/UnitControlPanels.tsx";
import { m } from "../../paraglide/messages.js";
import "../../map/map.css";
import "./cityCard.css";
import "./cityDialog.css";

interface CityUnitDialogProps {
  readonly mapKey: number;
  /** 누른 남의 유닛 */
  readonly unitId: number;
  /** 목록을 받은 때 가는 중이었나 */
  readonly moving: boolean;
  /** NPC 국가 지도자인가(지도자 몫을 보인다) */
  readonly leader: boolean;
  /** 명령을 받을 기준 유닛(카드에서 고른 내 유닛) */
  readonly actor: number;
  readonly onClose: () => void;
}

export default function CityUnitDialog({
  mapKey,
  unitId,
  moving,
  leader,
  actor,
  onClose,
}: CityUnitDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [glance, setGlance] = useState<MapUnitGlance | null>(null);
  // 지도자 몫은 "보이는 지도자" 목록을 본다(2차맵은 이름표 덧그림이 채운다) — 여기서는 누른 유닛 하나
  const [tags] = useState(() => {
    const created = createLeaderTagState();
    if (leader) created.setIds([unitId]);
    return created;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadUnitGlance(mapKey, unitId, controller.signal).then(
      (response) => setGlance(response.glance?.unitId === unitId ? response.glance : null),
      () => undefined,
    );
    return () => controller.abort();
  }, [mapKey, unitId]);

  return (
    <dialog
      ref={dialogRef}
      className="city-dialog city-dialog-unit"
      aria-label={m.home_city_unit_dialog_label()}
      data-unit={unitId}
      onClose={onClose}
      // 판 밖(바탕)을 누르면 닫는다 — 판 안을 누른 것은 대화상자 자신이 아니다
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="city-dialog-frame">
        <PeekCard
          unitId={unitId}
          moving={moving}
          glance={glance}
          ground="none"
          hasActions
          onControl={null}
          onClose={() => dialogRef.current?.close()}
        >
          <LeaderSheet tags={tags} selected={unitId} mapKey={mapKey} embedded />
          {glance?.sameHouse === true ? (
            <p className="map-peek-hint" data-part="unit-attack-same-house">
              {m.unit_attack_same_house()}
            </p>
          ) : (
            <UnitAttack key={`${actor}:${unitId}`} actor={actor} target={unitId} />
          )}
        </PeekCard>
      </div>
    </dialog>
  );
}
