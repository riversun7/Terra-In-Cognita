// 2차맵 화면의 내 사이보그 몫 — [내 사이보그](572 다: 1차맵에서 고른 곳을 보다가 돌아가기)와 2차맵 사이 이동(WP9) 가는 중 줄·[따라가기].
// 넘어갈 때 안내 판("넘어가는 중")은 없앴다: 따라가는 화면은 아무것도 띄우지 않고 그대로 넘는다(사용자 지적 2026-11-11 "화면전환의 흔적"). docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동", 기획 D-139(2차맵 경계를 넘을 때 화면이 짧게 바뀐다).
// 바뀜(사용자 지적 2026-11-09 문제2): [내 사이보그] 자리는 [내 유닛 N](내 유닛 목록 — 사이보그가 첫 줄)이다(UnitControlPanels.tsx).
import type { WorldTravel } from "@terra/shared/worldMap";
import type { ReactNode } from "react";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import { clockText } from "./travelData.ts";
import { openMap } from "./useCyborgTravel.ts";

/** 아래 판의 가는 중 한 줄(2차맵 몇 번째·도착 예상). 건너뛰는 중·정찰이 돌아오는 중은 그 문구(WP11) */
export function TravelLine({ going }: { readonly going: WorldTravel | null }) {
  if (!going) return null;
  const time = clockText(going.arriveAt, serverLink.clockOffsetMs());
  const step = { at: going.leg + 1, total: going.route.length, time };
  return (
    <p className="map-command map-travel">
      {going.hidden
        ? m.map_travel_hidden({ time })
        : going.returning
          ? m.map_travel_returning(step)
          : m.map_travel_going(step)}
    </p>
  );
}

/** [내 유닛 N](목록이 접혀 있을 때)·[따라가기](따라가지 않는 화면에서 넘어갔을 때) */
export function CyborgActions({
  unitsToggle,
  followTo,
}: {
  /** [내 유닛 N] 단추(목록이 펼쳐져 있으면 null) */
  readonly unitsToggle: ReactNode;
  /** 넘어간 2차맵(따라가는 화면이거나 넘어가지 않았으면 null) */
  readonly followTo: number | null;
}) {
  if (!unitsToggle && followTo === null) return null;
  return (
    <div className="map-actions">
      {unitsToggle}
      {followTo === null ? null : (
        <button
          type="button"
          className="button-small button-primary map-travel-follow"
          onClick={() => openMap(followTo)}
        >
          {m.map_travel_follow()}
        </button>
      )}
    </div>
  );
}
