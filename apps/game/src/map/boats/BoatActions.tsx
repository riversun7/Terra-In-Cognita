// 고른 유닛의 배 단추 — 배: 승객 수 + [모두 내리기], 탄 유닛: "배 #N에 탔음" + [배에서 내리기], 걷는 유닛: 가까운 내 배가 있으면 [배에 타기].
// docs/adr/2026-11-13-boats.md 4절. 배는 내구도·집 정박장도 보인다(docs/adr/2026-11-15-shipyard-harbor.md). D-559: 배는 연료·표류·[오버히트 켜기/끄기],
// 탄 유닛은 보직 고르기(함장·화포수·엔진실·갑판병·낚시 선원(D-570) — 자리 수는 서버가 본다). 조선소·정박장·교역 부두 판은 HarborPanel.tsx. 서버가 소유·거리·자리를 다시 본다(멀면 배 옆까지 걸어간 뒤 탄다). 결과는 같은 줄에 알린다.
import type { MapUnit } from "@terra/shared/mapUnits";
import { CREW_POSTS, type CrewPost } from "@terra/shared/naval";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { sendBoatCommand } from "./boatCommands.ts";
import { type BoatOutcomeKind, boatChoiceOf, boatOutcomeText, boatStatusText } from "./boatText.ts";

/** 보직 이름 */
const postLabel = (post: CrewPost | "none"): string =>
  post === "captain"
    ? m.boat_post_captain()
    : post === "gunner"
      ? m.boat_post_gunner()
      : post === "engine"
        ? m.boat_post_engine()
        : post === "deck"
          ? m.boat_post_deck()
          : post === "pilot"
            ? m.boat_post_pilot()
            : post === "fisher"
              ? m.boat_post_fisher()
              : m.boat_post_none();

/** 고른 값 → 보직(모르면 없음) */
const postOf = (value: string): CrewPost | null => CREW_POSTS.find((post) => post === value) ?? null;
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

  const run = async (kind: BoatOutcomeKind, send: () => ReturnType<typeof sendBoatCommand>) => {
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
      {/* 배 내구도·집 정박장(D-547 1485 — 집이 없으면 빨리 닳는다) */}
      {choice.kind === "boat" && boatStatusText(unit.boat) !== null ? (
        <p className="boat-line boat-status" data-hull={unit.boat?.hullPm}>
          {boatStatusText(unit.boat)}
        </p>
      ) : null}
      {choice.kind === "boat" && unit.boat?.fuelPm !== undefined ? (
        <button
          type="button"
          className="button-small boat-overheat"
          aria-pressed={unit.boat.overheat === true}
          disabled={sending}
          onClick={() =>
            void run("overheat", () =>
              sendBoatCommand({
                t: "boat_overheat",
                boatId: choice.boatId,
                on: unit.boat?.overheat !== true,
              }),
            )
          }
        >
          {unit.boat.overheat === true ? m.boat_overheat_off() : m.boat_overheat_on()}
        </button>
      ) : null}
      {choice.kind === "rider" ? (
        <p className="boat-line">
          {m.boat_aboard({ id: choice.boatId })}
          {/* 승객에게 내린 이동은 배 이동(기획 D-541 1279 나) */}
          <span className="boat-tip"> · {m.boat_sail_hint()}</span>
        </p>
      ) : null}
      {choice.kind === "rider" ? (
        <label className="harbor-field boat-crew">
          <span>{m.boat_crew_label()}</span>
          <select
            defaultValue="none"
            disabled={sending}
            onChange={(event) =>
              void run("crew", () =>
                sendBoatCommand({
                  t: "boat_crew",
                  boatId: choice.boatId,
                  unitId: unit.unitId,
                  post: postOf(event.target.value),
                }),
              )
            }
          >
            {(["none", ...CREW_POSTS] as const).map((post) => (
              <option key={post} value={post}>
                {postLabel(post)}
              </option>
            ))}
          </select>
        </label>
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
