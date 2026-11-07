// 2차맵 화면의 내 사이보그 몫 — [내 사이보그](572 다: 1차맵에서 고른 곳을 보다가 돌아가기)와 2차맵 사이 이동(WP9) 가는 중 줄·넘어갈 때 안내·
// [따라가기]. docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동", 기획 D-139(2차맵 경계를 넘을 때 화면이 짧게 바뀐다).
import type { WorldTravel } from "@terra/shared/worldMap";
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

/** 따라가는 화면에서 내 사이보그가 옆 2차맵으로 넘어갔다(곧 그 2차맵으로 바뀐다) */
export function CrossingNotice({ show }: { readonly show: boolean }) {
  if (!show) return null;
  return (
    <div className="map-panel map-notice map-crossing" role="status">
      <p>{m.map_travel_crossing()}</p>
    </div>
  );
}

/** [내 사이보그](이 맵에 있을 때)·[따라가기](따라가지 않는 화면에서 넘어갔을 때) */
export function CyborgActions({
  onGoToCyborg,
  followTo,
}: {
  /** 이 맵에 내 사이보그가 없으면 null */
  readonly onGoToCyborg: (() => void) | null;
  /** 넘어간 2차맵(따라가는 화면이거나 넘어가지 않았으면 null) */
  readonly followTo: number | null;
}) {
  if (!onGoToCyborg && followTo === null) return null;
  return (
    <div className="map-actions">
      {onGoToCyborg ? (
        <button type="button" className="button-small map-go-cyborg" onClick={onGoToCyborg}>
          {m.world_my_cyborg()}
        </button>
      ) : null}
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
