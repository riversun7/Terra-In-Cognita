// 확대 단계 표시와 [−]·[+] — 1차맵·2차맵이 같이 쓴다(사용자 요청 2026-11-07 "맵에서 확대 단계나 확대단계 표시 필요",
// ADR 2026-11-07-planet-view 1절). 지도 위 판 줄(머리 판 옆, 좁으면 다음 줄)에 놓는다: 아래 판(누른 칸·도시 판)이 커져도 겹치지 않는다.
// 단계 사다리(기획 D-107·D-6018 + 사용자 요청): 항성계 ← 1차맵 1 … 5 → 2차맵. [+]는 가까이, [−]는 멀리.
// 끝에서 한 번 더 누르면 화면이 넘어간다(1차맵 5단계 [+] = 가운데 2차맵, 1차맵 1단계 [−] = 항성계, 2차맵 [−] = 1차맵 5단계).
// 값은 늘 보이는 글(예: "1차맵 3/5")이고 점 다섯 개는 장식이다. 단계가 바뀔 때 읽기 프로그램에 알리지 않는다(줌 중 시끄럽지 않게).
import { m } from "../paraglide/messages.js";
import "./zoomLadder.css";

/** 지금 있는 단계: 항성계, 1차맵 1~5단계, 2차맵 */
export type ZoomRung =
  | { readonly kind: "system" }
  | { readonly kind: "planet"; readonly stage: number }
  | { readonly kind: "local" };

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

export function ZoomLadder({
  rung,
  onZoomIn,
  onZoomOut,
  canZoomIn = true,
  canZoomOut = true,
}: ZoomLadderProps) {
  return (
    <div className="zoom-ladder" role="group" aria-label={m.zoom_ladder_label()} data-rung={rungValue(rung)}>
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
        {rung.kind === "planet" ? (
          <>
            <span className="zoom-ladder-line">
              <span className="zoom-ladder-caption">{m.zoom_caption_planet()}</span>
              <span className="zoom-ladder-value">
                {m.zoom_value_stage({ stage: rung.stage > 0 ? rung.stage : "–" })}
              </span>
            </span>
            <span className="zoom-ladder-dots" aria-hidden="true">
              {STAGES.map((stage) => (
                <span
                  key={stage}
                  className="zoom-ladder-dot"
                  data-on={stage <= rung.stage ? "" : undefined}
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
