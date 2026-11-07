// 2차맵 화면 앞 단계 — 열 맵을 정한 뒤에 지도를 그린다(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1 D-6017).
// 내 사이보그 자리(tRPC world.myPosition)를 받아 mapTarget.ts로 고른다. 받는 동안·맵이 없을 때·실패했을 때는 같은 지도 틀에 안내만 그린다.
import { type ReactNode, useEffect, useState } from "react";
import { m } from "../paraglide/messages.js";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { type MapTarget, chooseMapTarget } from "./mapTarget.ts";
import { loadMyPosition } from "./worldMapData.ts";
import "./map.css";

type Phase = { readonly kind: "loading" } | MapTarget;

interface MapTargetGateProps {
  /** 주소 ?key= */
  readonly keyParam: string | undefined;
  readonly onClose: () => void;
  readonly children: (target: Extract<MapTarget, { kind: "ready" }>) => ReactNode;
}

/** [다시 시도]는 안쪽을 새로 만든다(열쇠를 바꾼다 — 효과를 다시 돌리는 신호를 의존성에 넣지 않는다) */
export function MapTargetGate(props: MapTargetGateProps) {
  const [attempt, setAttempt] = useState(0);
  return <TargetLoader key={attempt} {...props} onRetry={() => setAttempt((count) => count + 1)} />;
}

function TargetLoader({
  keyParam,
  onClose,
  children,
  onRetry,
}: MapTargetGateProps & { onRetry: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    loadMyPosition(controller.signal).then(
      (position) => {
        if (!controller.signal.aborted) setPhase(chooseMapTarget(keyParam, position));
      },
      () => {
        if (!controller.signal.aborted) setPhase(chooseMapTarget(keyParam, null));
      },
    );
    return () => controller.abort(new DOMException("map closed", "AbortError"));
  }, [keyParam]);

  if (phase.kind === "ready") return children(phase);
  return <GateNotice phase={phase} onClose={onClose} onRetry={onRetry} />;
}

function GateNotice({
  phase,
  onClose,
  onRetry,
}: {
  phase: Exclude<Phase, { kind: "ready" }>;
  onClose: () => void;
  onRetry: () => void;
}) {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const line =
    phase.kind === "loading"
      ? m.map_resolving()
      : phase.kind === "none"
        ? m.map_no_map()
        : m.map_resolve_failed();
  return (
    <section className="map-screen" aria-labelledby="map-title" data-target={phase.kind}>
      <header className="map-hud map-hud-top">
        <div className="map-panel map-heading">
          <button type="button" className="button-small" onClick={onClose}>
            {m.map_back()}
          </button>
          <h1 id="map-title" className="map-title" ref={headingRef} tabIndex={-1}>
            {m.map_title()}
          </h1>
        </div>
      </header>
      <div className="map-panel map-notice" role={phase.kind === "loading" ? "status" : "alert"}>
        <p>{line}</p>
        {phase.kind === "failed" ? (
          <button type="button" className="button-small" onClick={onRetry}>
            {m.retry()}
          </button>
        ) : null}
      </div>
    </section>
  );
}
