// 크리쳐 3D 미리 보기 칸 — 캔버스 하나에 크리쳐 미리 보기 엔진(@terra/engine/creaturePreview)을 붙인다. docs/adr/2026-11-25-creature-codex-groups.md 3절.
// - 엔진(three·GLB 로더)은 지연 로딩한다(creatureEditorViewer 조각). 받는 동안·WebGL을 못 쓸 때는 안내 문구만 보인다(일러스트는 옆 칸에 늘 있다).
// - 모델 파일(GLB)이 있으면 그것을, 없거나 읽지 못하면 임시 몸(네 발 짐승, 크기 등급 배율)을 돌려 본다.
// - 조작(캐릭터 미리 보기와 같다): 끌기 = 돌리기, 휠·두 손가락 = 확대. 키: 화살표 = 돌리기·기울이기, + − = 확대, Home = 처음 각도.
// - 시험 표지: data-viewer(loading·ready·unsupported)·data-kind(model·placeholder)·data-model(ok·loading·failed·none)·data-triangles.
import type { CreaturePreview } from "@terra/engine/creaturePreview";
import { resolveCreatureModelUrl } from "@terra/shared/creatureEditor";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

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

type ViewerState = "loading" | "ready" | "unsupported";
interface ModelLoad {
  readonly url: string;
  readonly status: "ok" | "failed";
  readonly triangles: number;
  readonly clips: number;
}

export function CreatureModelViewer({
  model,
  seed,
  scale,
  locale,
  label,
}: {
  /** 크리쳐의 모델 칸(파일 이름·경로). 없으면 임시 몸 */
  readonly model: string | undefined;
  /** 임시 몸 색 씨앗·크기 배율 */
  readonly seed: number;
  readonly scale: number;
  readonly locale: "ko" | "en";
  /** 캔버스 이름(크리쳐 이름) */
  readonly label: string;
}) {
  const ko = locale !== "en";
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<CreaturePreview | null>(null);
  const [state, setState] = useState<ViewerState>("loading");
  const [turntable, setTurntable] = useState(() => !reducedMotion());
  const [moving, setMoving] = useState(false);
  const [loaded, setLoaded] = useState<ModelLoad | null>(null);
  const motionRef = useRef({ turntable, moving });
  const url = resolveCreatureModelUrl(model);

  useEffect(() => {
    motionRef.current = { turntable, moving };
  }, [turntable, moving]);

  // 엔진 받기 → 캔버스에 붙이기(한 번)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let closed = false;
    let observer: ResizeObserver | null = null;
    void import("./creatureEditorViewer.ts")
      .then((engine) => {
        if (closed) return;
        const preview = new engine.CreaturePreview(canvas);
        previewRef.current = preview;
        const fit = (): void => {
          const rect = canvas.getBoundingClientRect();
          preview.resize(Math.round(rect.width), Math.round(rect.height), window.devicePixelRatio || 1);
        };
        fit();
        observer = new ResizeObserver(fit);
        observer.observe(canvas);
        preview.setMotion(motionRef.current);
        setState("ready");
      })
      .catch(() => {
        // 조각을 받지 못했거나 WebGL을 쓸 수 없다
        if (!closed) setState("unsupported");
      });
    return () => {
      closed = true;
      observer?.disconnect();
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  // 그릴 것 정하기: 임시 몸을 먼저 세우고, 모델 파일이 있으면 받아서 바꾼다(못 읽으면 임시 몸 그대로)
  useEffect(() => {
    const preview = previewRef.current;
    const host = hostRef.current;
    if (state !== "ready" || !preview || !host) return undefined;
    let stale = false;
    const mark = (stats: { kind: string; triangles: number }): void => {
      host.dataset["kind"] = stats.kind;
      host.dataset["triangles"] = String(stats.triangles);
    };
    mark(preview.showPlaceholder(seed, scale));
    if (url !== null) {
      preview.showModel(url).then(
        (stats) => {
          if (stale) return;
          mark(stats);
          setLoaded({ url, status: "ok", triangles: stats.triangles, clips: stats.clips });
        },
        () => {
          if (!stale) setLoaded({ url, status: "failed", triangles: 0, clips: 0 });
        },
      );
    }
    return () => {
      stale = true;
    };
  }, [state, url, seed, scale]);

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
  const current = loaded !== null && loaded.url === url ? loaded : null;
  const modelState = url === null ? "none" : current === null ? "loading" : current.status;
  const caption =
    state === "loading"
      ? ko
        ? "3D 미리 보기를 불러오는 중…"
        : "Loading 3D preview…"
      : state === "unsupported"
        ? ko
          ? "이 기기에서는 3D 미리 보기를 쓸 수 없습니다."
          : "3D preview is not available on this device."
        : modelState === "ok"
          ? ko
            ? `GLB 모델 · 삼각형 ${(current?.triangles ?? 0).toLocaleString()}개${(current?.clips ?? 0) > 0 ? ` · 애니메이션 ${current?.clips}개` : ""}`
            : `GLB model · ${(current?.triangles ?? 0).toLocaleString()} triangles${(current?.clips ?? 0) > 0 ? ` · ${current?.clips} clips` : ""}`
          : modelState === "loading"
            ? ko
              ? "모델 파일을 받는 중… (임시 몸)"
              : "Loading model file… (placeholder body)"
            : modelState === "failed"
              ? ko
                ? `모델 파일을 읽지 못했습니다: ${url ?? ""} — 임시 몸을 보입니다.`
                : `Could not read the model file: ${url ?? ""} — showing the placeholder body.`
              : ko
                ? "모델 파일 없음 — 임시 몸(공용 네 발 짐승)입니다. [기본] 탭에서 GLB 파일을 연결하세요."
                : "No model file — placeholder body. Link a GLB file in the Basic tab.";

  return (
    <div ref={hostRef} className="ce-viewer" data-viewer={state} data-model={modelState}>
      <div className="ce-viewer-stage">
        <canvas
          ref={canvasRef}
          className="ce-viewer-canvas"
          hidden={state === "unsupported"}
          tabIndex={ready ? 0 : -1}
          role="img"
          aria-label={ko ? `${label} 3D 미리 보기` : `${label} 3D preview`}
          onKeyDown={onKeyDown}
        />
      </div>
      <p className={modelState === "failed" ? "field-error" : "field-hint"} role="status">
        {caption}
      </p>
      <div className="be-actions" role="group" aria-label={ko ? "3D 보기 조작" : "3D view controls"}>
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
          {ko ? "돌림판" : "Turntable"}
        </button>
        <button
          type="button"
          className="button-small"
          aria-pressed={moving}
          disabled={!ready}
          onClick={() => {
            previewRef.current?.setMotion({ moving: !moving });
            setMoving(!moving);
          }}
        >
          {ko ? "움직임" : "Motion"}
        </button>
        <button
          type="button"
          className="button-small"
          aria-label={ko ? "멀리" : "Zoom out"}
          disabled={!ready}
          onClick={() => previewRef.current?.zoom(ZOOM_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="button-small"
          aria-label={ko ? "가까이" : "Zoom in"}
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
          {ko ? "처음 각도" : "Reset view"}
        </button>
      </div>
    </div>
  );
}
