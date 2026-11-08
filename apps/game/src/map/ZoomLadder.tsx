// 확대 단계 표시와 [−]·[+] — 1차맵·2차맵이 같이 쓴다(사용자 요청 2026-11-07 "맵에서 확대 단계나 확대단계 표시 필요",
// ADR 2026-11-07-planet-view 1절). 지도 위 판 줄(머리 판 옆, 좁으면 다음 줄)에 놓는다: 아래 판(누른 칸·도시 판)이 커져도 겹치지 않는다.
// 단계 사다리(기획 D-107·D-6018 + 사용자 요청): 항성계 ← 1차맵 1 … 5 → 2차맵. [+]는 가까이, [−]는 멀리.
// 끝에서 한 번 더 누르면 화면이 넘어간다(1차맵 5단계 [+] = 가운데 2차맵, 1차맵 1단계 [−] = 항성계, 2차맵 [−] = 1차맵 5단계).
// 값은 늘 보이는 글(예: "1차맵 3/5")이고 점 다섯 개는 장식이다. 단계가 바뀔 때 읽기 프로그램에 알리지 않는다(줌 중 시끄럽지 않게).
// 2차맵도 단계를 보인다("2차맵 3/5", 사용자 지적 2026-11-08 "화면 축소확대배율 표시 없음", docs/adr/2026-11-08-map-input.md 3절): 엔진 확대 단계
// (camera/secondMapZoom.ts, 거리 한계를 로그 눈금으로 다섯 등분)이고 [+]·[−]가 한 단계씩 간다. 단계를 모르면(엔진이 아직 없음) "2차맵"만.
import { m } from "../paraglide/messages.js";
import "./zoomLadder.css";

/** 지금 있는 단계: 항성계, 1차맵 1~5단계, 2차맵 */
export type ZoomRung =
  | { readonly kind: "system" }
  | { readonly kind: "planet"; readonly stage: number }
  /** 2차맵 — stage = 2차맵 확대 단계 1~5(없거나 0이면 아직 모름) */
  | { readonly kind: "local"; readonly stage?: number | undefined };

export interface ZoomLadderProps {
  readonly rung: ZoomRung;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  /** 누를 수 없는 쪽(항성계의 [−] 등) */
  readonly canZoomIn?: boolean;
  readonly canZoomOut?: boolean;
}

const STAGES = [1, 2, 3, 4, 5] as const;

/** 시험·data 값: system · 1~5 · local */
export function rungValue(rung: ZoomRung): string {
  return rung.kind === "planet" ? String(rung.stage) : rung.kind;
}

/** 단계를 보이는 칸(1차맵 단계, 단계를 아는 2차맵): 제목과 단계. 항성계·단계를 모르는 2차맵은 null */
function stagedOf(rung: ZoomRung): { readonly caption: string; readonly stage: number } | null {
  if (rung.kind === "planet") return { caption: m.zoom_caption_planet(), stage: rung.stage };
  if (rung.kind === "local" && rung.stage !== undefined && rung.stage > 0)
    return { caption: m.zoom_caption_local(), stage: rung.stage };
  return null;
}

export function ZoomLadder({
  rung,
  onZoomIn,
  onZoomOut,
  canZoomIn = true,
  canZoomOut = true,
}: ZoomLadderProps) {
  const staged = stagedOf(rung);
  return (
    <div
      className="zoom-ladder"
      role="group"
      aria-label={m.zoom_ladder_label()}
      data-rung={rungValue(rung)}
      data-stage={staged?.stage}
    >
      <button
        type="button"
        className="zoom-ladder-step zoom-ladder-out"
        aria-label={m.zoom_out()}
        disabled={!canZoomOut}
        onClick={onZoomOut}
      >
        <span aria-hidden="true">−</span>
      </button>
      <p className="zoom-ladder-where">
        {staged ? (
          <>
            <span className="zoom-ladder-line">
              <span className="zoom-ladder-caption">{staged.caption}</span>
              <span className="zoom-ladder-value">
                {m.zoom_value_stage({ stage: staged.stage > 0 ? staged.stage : "–" })}
              </span>
            </span>
            <span className="zoom-ladder-dots" aria-hidden="true">
              {STAGES.map((stage) => (
                <span
                  key={stage}
                  className="zoom-ladder-dot"
                  data-on={stage <= staged.stage ? "" : undefined}
                />
              ))}
            </span>
          </>
        ) : (
          <span className="zoom-ladder-value">
            {rung.kind === "system" ? m.zoom_value_system() : m.zoom_value_local()}
          </span>
        )}
      </p>
      <button
        type="button"
        className="zoom-ladder-step zoom-ladder-in"
        aria-label={m.zoom_in()}
        disabled={!canZoomIn}
        onClick={onZoomIn}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
