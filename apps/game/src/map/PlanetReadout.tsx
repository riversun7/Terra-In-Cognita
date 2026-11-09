// 1차맵 누른 칸 안내 판 — 누른 칸 줄(자리·땅·기후)·범례·받기 실패 수, 그리고 누른 지역으로 보내기(바뀜 2026-11-09, 사용자 요청 "1차맵에서
// 해당지역으로 이동"): 보낼 수 있으면 [이곳으로 이동], 바다·내 사이보그 2차맵이면 까닭 한 줄(commandTarget.ts areaCheck).
// 줄은 role="status"(누를 때마다 읽힌다), 버튼은 그 밖에 둔다.
import { m } from "../paraglide/messages.js";
import { type AreaCheck, areaCheckText } from "./commandTarget.ts";

interface PlanetReadoutProps {
  /** 누른 칸 줄(없으면 처음 안내) */
  readonly lines: readonly string[] | null;
  readonly hidden: boolean;
  /** 기후 레이어면 범례 한 줄 */
  readonly climate: boolean;
  /** 지금 받지 못한 타일 수(0이면 줄 없음) */
  readonly tilesFailed: number;
  readonly area: AreaCheck;
  /** [이곳으로 이동] — 없으면(도시 자료 전) 버튼을 감춘다 */
  readonly onMove: (() => void) | null;
}

export function PlanetReadout({ lines, hidden, climate, tilesFailed, area, onMove }: PlanetReadoutProps) {
  const note = areaCheckText(area);
  return (
    <div className="map-panel planet-readout" hidden={hidden}>
      <div role="status">
        {(lines ?? [m.planet_hint()]).map((line, index) => (
          // 같은 문장이 두 번 나올 수 있어 순서도 키에 넣는다
          <p key={`${index}-${line}`}>{line}</p>
        ))}
        {climate ? <p className="planet-legend">{m.planet_climate_legend()}</p> : null}
        {tilesFailed > 0 ? (
          <p className="planet-legend">{m.planet_tile_errors({ count: tilesFailed })}</p>
        ) : null}
        {note ? <p className="planet-legend planet-area-note">{note}</p> : null}
      </div>
      {area.kind === "ok" && onMove ? (
        <div className="planet-jump planet-area">
          <button type="button" className="button-small button-primary planet-area-move" onClick={onMove}>
            {m.world_area_move()}
          </button>
        </div>
      ) : null}
    </div>
  );
}
