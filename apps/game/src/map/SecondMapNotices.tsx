// 2차맵 화면 가운데 안내 판 — 자료·엔진 상태 안내(secondMapNotice.ts), 내 유닛 없는 2차맵(들어갈 수 없음, docs/adr/2026-11-08-seamless-second-map.md
// WP-1 Q3), 탐사한 곳이 없어 온통 어두운 까닭. SecondaryMapScreen.tsx에서 나눴다(그리기만 한다).
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import type { Notice } from "./secondMapNotice.ts";

interface SecondMapNoticesProps {
  readonly notice: Notice | null;
  /** 이 2차맵에 내 유닛이 없어 들어갈 수 없다 */
  readonly blocked: boolean;
  /** 탐사한 곳이 없어 온통 어둡다 */
  readonly dark: boolean;
  readonly devTools: boolean;
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

export function SecondMapNotices({
  notice,
  blocked,
  dark,
  devTools,
  mapKey,
  onRetry,
}: SecondMapNoticesProps) {
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
      {dark ? (
        <div className="map-panel map-notice map-dark" role="status">
          <p>{m.map_dark_explain()}</p>
          {devTools ? (
            <>
              <p>{m.map_dark_dev({ spawn: m.map_vision_spawn(), observe: m.map_operator_mode() })}</p>
              <button
                type="button"
                className="button-small map-dark-lab"
                onClick={() => navigate({ route: "dev_second_map" })}
              >
                {m.map_dark_open_lab()}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
