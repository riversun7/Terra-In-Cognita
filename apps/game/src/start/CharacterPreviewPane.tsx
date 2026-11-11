// 외형 3D 미리 보기 칸 — 캔버스 하나에 캐릭터 미리 보기 엔진(@terra/engine/characterPreview)을 붙인다. docs/adr/2026-11-11-character-3d.md 3절.
// - 엔진(three)은 지연 로딩한다: 이름 단계가 먼저 뜨고, 외형 단계에 들어올 때 받는다. 받는 동안·WebGL을 못 쓸 때는 2D 그림을 보인다.
// - 조작: 끌기 = 돌리기, 휠·두 손가락 = 확대(엔진이 듣는다). 키: 화살표 = 돌리기·기울이기, + − = 확대, Home = 처음 각도.
//   단추: 돌림판·걷기·밤·가까이·멀리·처음 각도. 동작 줄이기면 돌림판·숨쉬기를 끄고 시작한다.
// - 시험·측정 표지: data-look(외형 표지)·data-preview(loading·ready·unsupported)·data-triangles·data-parts(엔진이 그린 모델).
import type { CharacterPreview } from "@terra/engine/characterPreview";
import { type CharacterLook, characterLookKey, legacyAppearanceOf } from "@terra/shared/characterLook";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { CyborgAvatar } from "../cyborg/CyborgAvatar.tsx";
import { m } from "../paraglide/messages.js";

type PreviewEngine = typeof import("@terra/engine/characterPreview");

let enginePromise: Promise<PreviewEngine> | null = null;

/** 미리 보기 엔진 조각을 받는다(한 번만). 실패하면 다음에 다시 받는다 */
export function loadPreviewEngine(): Promise<PreviewEngine> {
  enginePromise ??= import("@terra/engine/characterPreview").catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const TURN_STEP = 0.25;
const TILT_STEP = 0.12;
const ZOOM_STEP = 1.15;

type PreviewState = "loading" | "ready" | "unsupported";

export function CharacterPreviewPane({ look }: { look: CharacterLook }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<CharacterPreview | null>(null);
  const lookRef = useRef(look);
  const [state, setState] = useState<PreviewState>("loading");
  const [turntable, setTurntable] = useState(() => !reducedMotion());
  const [walking, setWalking] = useState(false);
  const [night, setNight] = useState(false);
  const motionRef = useRef({ turntable, walking, night });

  /** 엔진이 그린 모델 크기를 표지로 남긴다(React 상태로 두지 않는다 — 외형을 바꿀 때마다 다시 그리지 않게) */
  const show = useCallback((next: CharacterLook): void => {
    const preview = previewRef.current;
    const host = hostRef.current;
    if (!preview || !host) return;
    const stats = preview.set(next);
    host.dataset["triangles"] = String(stats.triangles);
    host.dataset["parts"] = String(stats.parts);
  }, []);

  useEffect(() => {
    lookRef.current = look;
    show(look);
  }, [look, show]);

  useEffect(() => {
    motionRef.current = { turntable, walking, night };
  }, [turntable, walking, night]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;
    let closed = false;
    let observer: ResizeObserver | null = null;
    void loadPreviewEngine()
      .then((engine) => {
        if (closed) return;
        const preview = new engine.CharacterPreview(canvas);
        previewRef.current = preview;
        const fit = (): void => {
          const rect = canvas.getBoundingClientRect();
          preview.resize(Math.round(rect.width), Math.round(rect.height), window.devicePixelRatio || 1);
        };
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(canvas);
        const motion = motionRef.current;
        preview.setMotion({
          turntable: motion.turntable,
          walking: motion.walking,
          breathing: !reducedMotion(),
        });
        preview.setNight(motion.night ? 1 : 0);
        show(lookRef.current);
        setState("ready");
      })
      .catch(() => {
        // 조각을 받지 못했거나 WebGL을 쓸 수 없다: 2D 그림으로 보인다
        if (!closed) setState("unsupported");
      });
    return () => {
      closed = true;
      observer?.disconnect();
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, [show]);

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    const preview = previewRef.current;
    if (!preview) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => preview.rotate(-TURN_STEP, 0),
      ArrowRight: () => preview.rotate(TURN_STEP, 0),
      ArrowUp: () => preview.rotate(0, TILT_STEP),
      ArrowDown: () => preview.rotate(0, -TILT_STEP),
      "+": () => preview.zoom(1 / ZOOM_STEP),
      "=": () => preview.zoom(1 / ZOOM_STEP),
      "-": () => preview.zoom(ZOOM_STEP),
      Home: () => preview.reset(),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const ready = state === "ready";
  return (
    <div
      ref={hostRef}
      className="start-avatar start-preview"
      data-look={characterLookKey(look)}
      data-preview={state}
    >
      <div className="start-preview-stage">
        <canvas
          ref={canvasRef}
          className="start-preview-canvas"
          hidden={state === "unsupported"}
          tabIndex={ready ? 0 : -1}
          role="img"
          aria-label={m.start_looks_preview3d()}
          onKeyDown={onKeyDown}
        />
        {ready ? null : (
          <div className="start-preview-fallback">
            <CyborgAvatar look={legacyAppearanceOf(look)} className="start-preview-drawing" />
            <p className="start-hint" role="status">
              {state === "loading" ? m.start_looks_loading() : m.start_looks_unsupported()}
            </p>
          </div>
        )}
      </div>
      <div className="start-preview-controls" role="group" aria-label={m.start_looks_view_controls()}>
        <button
          type="button"
          className="button-small"
          aria-pressed={turntable}
          disabled={!ready}
          onClick={() => {
            previewRef.current?.setMotion({ turntable: !turntable });
            setTurntable(!turntable);
          }}
        >
          {m.start_looks_turntable()}
        </button>
        <button
          type="button"
          className="button-small"
          aria-pressed={walking}
          disabled={!ready}
          onClick={() => {
            previewRef.current?.setMotion({ walking: !walking });
            setWalking(!walking);
          }}
        >
          {m.start_looks_walk()}
        </button>
        <button
          type="button"
          className="button-small"
          aria-pressed={night}
          disabled={!ready}
          onClick={() => {
            previewRef.current?.setNight(night ? 0 : 1);
            setNight(!night);
          }}
        >
          {m.start_looks_night()}
        </button>
        <button
          type="button"
          className="button-small start-preview-icon"
          aria-label={m.start_looks_zoom_out()}
          disabled={!ready}
          onClick={() => previewRef.current?.zoom(ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="button-small start-preview-icon"
          aria-label={m.start_looks_zoom_in()}
          disabled={!ready}
          onClick={() => previewRef.current?.zoom(1 / ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className="button-small"
          disabled={!ready}
          onClick={() => previewRef.current?.reset()}
        >
          {m.start_looks_view_reset()}
        </button>
      </div>
    </div>
  );
}
