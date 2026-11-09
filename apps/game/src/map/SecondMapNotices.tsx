// 2차맵 화면 가운데 안내 판 — 자료·엔진 상태 안내(secondMapNotice.ts), 내 유닛 없는 2차맵(들어갈 수 없음, docs/adr/2026-11-08-seamless-second-map.md
// WP-1 Q3). SecondaryMapScreen.tsx에서 나눴다(그리기만 한다).
// 바뀜(2026-11-09): "탐사한 곳이 없어 온통 어둡다"(유닛 없는 계정) 안내를 지웠다 — 내 유닛이 없는 2차맵은 들어갈 수 없게 된 뒤(WP-1)로는 처음 가는
// 옆 2차맵에 넘은 직후(그 2차맵 탐사 기록이 다음 시야 틱에 채워지기 전)에만 떠서 "유닛이 없다"는 틀린 말을 잠깐 보였다.
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import type { Notice } from "./secondMapNotice.ts";

interface SecondMapNoticesProps {
  readonly notice: Notice | null;
  /** 이 2차맵에 내 유닛이 없어 들어갈 수 없다 */
  readonly blocked: boolean;
  readonly mapKey: number;
  readonly onRetry: () => void;
}

/** [1차맵에서 보기] — 이 2차맵 자리의 1차맵(바꾸기) */
function OpenPlanet({ mapKey }: { readonly mapKey: number }) {
  return (
    <button
      type="button"
      className="button-small button-primary map-open-planet"
      onClick={() => navigate({ route: "map_planet", search: { key: String(mapKey) } }, { replace: true })}
    >
      {m.map_open_planet_here()}
    </button>
  );
}

export function SecondMapNotices({ notice, blocked, mapKey, onRetry }: SecondMapNoticesProps) {
  return (
    <>
      {notice ? (
        <div className="map-panel map-notice" role={notice.tone}>
          {notice.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {notice.retry || notice.planet ? (
            <div className="map-notice-actions">
              {notice.planet ? <OpenPlanet mapKey={mapKey} /> : null}
              {notice.retry ? (
                <button type="button" className="button-small" onClick={onRetry}>
                  {m.retry()}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {blocked ? (
        <div className="map-panel map-notice map-blocked" role="status">
          <p>{m.map_blocked_no_units()}</p>
          <div className="map-notice-actions">
            <OpenPlanet mapKey={mapKey} />
          </div>
        </div>
      ) : null}
    </>
  );
}
