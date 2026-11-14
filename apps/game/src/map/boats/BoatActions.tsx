// 고른 유닛의 배 단추 — 배: 승객 수 + [모두 내리기], 탄 유닛: "배 #N에 탔음" + [배에서 내리기], 걷는 유닛: 가까운 내 배가 있으면 [배에 타기].
// docs/adr/2026-11-13-boats.md 4절. 서버가 소유·거리·자리를 다시 본다(멀면 배 옆까지 걸어간 뒤 탄다). 결과는 같은 줄에 알린다.
import type { MapUnit } from "@terra/shared/mapUnits";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { sendBoatCommand } from "./boatCommands.ts";
import { boatChoiceOf, boatOutcomeText } from "./boatText.ts";
import "./boats.css";

export function BoatActions({
  unit,
  units,
}: {
  /** 고른 내 유닛(목록 줄, 없으면 단추 없음) */
  readonly unit: MapUnit | undefined;
  readonly units: readonly MapUnit[] | null;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const choice = boatChoiceOf(unit, units);
  if (choice.kind === "none" || !unit)
    return notice ? (
      <p className="boat-notice" role="status">
        {notice}
      </p>
    ) : null;

  const run = async (kind: "board" | "leave", send: () => ReturnType<typeof sendBoatCommand>) => {
    setSending(true);
    try {
      setNotice(boatOutcomeText(kind, await send()));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="map-actions boat-actions" data-boat-choice={choice.kind}>
      {choice.kind === "boat" ? (
        <p className="boat-line">
          {m.boat_passengers({ count: choice.passengers, capacity: choice.capacity })}
          <span className="boat-tip"> · {m.boat_sail_hint()}</span>
        </p>
      ) : null}
      {choice.kind === "rider" ? (
        <p className="boat-line">
          {m.boat_aboard({ id: choice.boatId })}
          {/* 승객에게 내린 이동은 배 이동(기획 D-541 1279 나) */}
          <span className="boat-tip"> · {m.boat_sail_hint()}</span>
        </p>
      ) : null}
      {choice.kind === "board" ? (
        <button
          type="button"
          className="button-small button-primary boat-board"
          disabled={sending}
          onClick={() =>
            void run("board", () =>
              sendBoatCommand({ t: "boat_board", unitId: unit.unitId, boatId: choice.boatId }),
            )
          }
        >
          {m.boat_board({ id: choice.boatId })}
        </button>
      ) : (
        <button
          type="button"
          className="button-small button-primary boat-leave"
          disabled={sending || (choice.kind === "boat" && choice.passengers === 0)}
          onClick={() => void run("leave", () => sendBoatCommand({ t: "boat_leave", boatId: choice.boatId }))}
        >
          {choice.kind === "boat" ? m.boat_leave_all() : m.boat_leave()}
        </button>
      )}
      {notice ? (
        <p className="boat-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

/** 부두 판의 [배 만들기](건물 판 안, 단계 교통 시설만). 운영자 모드면 재료 없이(서버가 정한다) */
export function DockBoatButton({
  buildingId,
  level,
}: {
  readonly buildingId: number;
  readonly level: number;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  return (
    <div className="gather-section boat-dock" data-dock={buildingId}>
      <p className="gather-muted">{level > 0 ? m.boat_dock_note() : m.boat_dock_unbuilt()}</p>
      <button
        type="button"
        className="button-small button-primary boat-build"
        disabled={sending || level < 1}
        onClick={() => {
          setSending(true);
          void sendBoatCommand({ t: "boat_build", buildingId })
            .then((outcome) => setNotice(boatOutcomeText("build", outcome)))
            .finally(() => setSending(false));
        }}
      >
        {m.boat_build()}
      </button>
      {notice ? (
        <p className="boat-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
