// 고른 유닛의 배 단추 — 배: 승객 수 + [모두 내리기], 탄 유닛: "배 #N에 탔음" + [배에서 내리기], 걷는 유닛: 가까운 내 배가 있으면 [배에 타기].
// docs/adr/2026-11-13-boats.md 4절. 서버가 소유·거리·자리를 다시 본다(멀면 배 옆까지 걸어간 뒤 탄다). 결과는 같은 줄에 알린다.
import type { MapUnit } from "@terra/shared/mapUnits";
import { useEffect, useState } from "react";
import { serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";
import { sendBoatCommand } from "./boatCommands.ts";
import { boatChoiceOf, boatOutcomeText, dockJobText } from "./boatText.ts";
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

/** 서버 시각(기기 시계 + 인사 때 잰 차이) */
const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/**
 * 부두 판의 [배 만들기](건물 판 안, 단계 교통 시설만). 운영자 모드면 재료 없이(서버가 정한다). 만드는 시간이 있어(기획 D-541 1271 나) 만드는 중이면
 * 남은 시간을 보이고 단추를 막는다(job = 건물 판 조회의 boatJob, 또는 방금 보낸 만들기의 readyAtMs)
 */
export function DockBoatButton({
  buildingId,
  level,
  job,
}: {
  readonly buildingId: number;
  readonly level: number;
  readonly job?: { readonly readyAt: number } | undefined;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [started, setStarted] = useState<{ readonly readyAt: number } | null>(null);
  const [now, setNow] = useState(serverNow);
  const shown = started ?? job;
  const building = shown !== undefined && shown.readyAt > now;
  // 만드는 중이면 남은 시간을 1초마다 다시 그린다
  useEffect(() => {
    if (!building) return () => undefined;
    const timer = setInterval(() => setNow(serverNow()), 1_000);
    return () => clearInterval(timer);
  }, [building]);
  const progress = building ? dockJobText(shown, now) : null;
  return (
    <div
      className="gather-section boat-dock"
      data-dock={buildingId}
      data-boat-building={building ? "" : undefined}
    >
      <p className="gather-muted">{level > 0 ? m.boat_dock_note() : m.boat_dock_unbuilt()}</p>
      {progress ? (
        <p className="boat-line boat-progress" role="status">
          {progress}
        </p>
      ) : null}
      <button
        type="button"
        className="button-small button-primary boat-build"
        disabled={sending || level < 1 || building}
        onClick={() => {
          setSending(true);
          void sendBoatCommand({ t: "boat_build", buildingId })
            .then((outcome) => {
              const at = serverNow();
              setNow(at);
              if (outcome.readyAtMs !== undefined) setStarted({ readyAt: outcome.readyAtMs });
              setNotice(boatOutcomeText("build", outcome, at));
            })
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
