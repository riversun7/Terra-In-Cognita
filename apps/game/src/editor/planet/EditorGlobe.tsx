// 편집기 지구본 — 미리보기 결과 하나를 1차맵 엔진(@terra/engine/planet)으로 그린다. ADR 38 5절 "지구본 갱신"
// - 새 결과를 보일 때 엔진을 버리고 다시 만든다(엔진 변경 없음). 위도·경도·거리는 넘기고, 방위는 북쪽으로 돌아간다.
// - 새 결과가 올 때까지 지금 지구본을 둔다(부모가 결과를 바꿀 때만 다시 만든다): 바꿀 때마다 빈 화면은 한 번이다.
// - 행성 설명: 면 레벨 = 미리보기 레벨, 반지름 = 정의 면 레벨의 반지름, 가장 높은 땅 = 결과의 최댓값(previewTiles.ts).
//   타일은 결과에서 요청마다 자른다(서버 굽기와 같은 코드). 하늘은 끈다(편집기는 지형을 본다, 엔진 기본값).
// - 누른 칸은 위도·경도로 부모에게 알린다(칸 정보창은 결과 배열에서 정확한 값을 읽는다, cellReport.ts).
// - focus가 바뀌면(미니맵에서 고른 점) 그곳으로 카메라를 옮긴다(거리는 그대로).
// 시험·측정용 data-*: data-face-level·data-sequence(그리는 결과), data-status(엔진 상태), data-first-display-ms.
import {
  type PlanetEngine,
  type PlanetStatus,
  type PlanetView,
  createPlanetEngine,
} from "@terra/engine/planet";
import { useEffect, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import type { LatLon } from "./flatMapRender.ts";
import { previewPlanetDescription, previewTileSource } from "./previewTiles.ts";
import type { PreviewEntry } from "./previewTypes.ts";

interface EditorGlobeProps {
  readonly entry: PreviewEntry | null;
  /** 정의의 면 레벨(반지름) */
  readonly definitionFaceLevel: number;
  readonly biomeColors: readonly number[];
  readonly onPick: (point: LatLon) => void;
  /** 카메라를 옮길 곳(미니맵에서 고른 점). 같은 객체면 다시 옮기지 않는다 */
  readonly focus: LatLon | null;
  /** 이 결과가 낡았나(새 결과를 기다리는 중) — 위 띠에 적는다 */
  readonly stale: boolean;
}

function statusText(status: PlanetStatus): string | null {
  switch (status.kind) {
    case "unsupported":
      return m.map_unsupported();
    case "error":
      return m.map_error();
    case "context-lost":
      return m.map_context_lost();
    case "loading":
    case "ready":
      return null;
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}

export function EditorGlobe({
  entry,
  definitionFaceLevel,
  biomeColors,
  onPick,
  focus,
  stale,
}: EditorGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PlanetEngine | null>(null);
  /** 다음 엔진에 넘길 보기(엔진을 버리기 전에 잰다) */
  const viewRef = useRef<PlanetView | null>(null);
  const onPickRef = useRef(onPick);
  const [status, setStatus] = useState<PlanetStatus>({ kind: "loading" });
  const [firstDisplayMs, setFirstDisplayMs] = useState<number | null>(null);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !entry) return () => undefined;
    let engine: PlanetEngine | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const view = viewRef.current;
      engine = createPlanetEngine(host, {
        planet: previewPlanetDescription(entry.result, definitionFaceLevel, biomeColors),
        tileSource: previewTileSource(entry.result),
        ...(view ? { initialView: view } : {}),
        onStatus: (next) => {
          setStatus(next);
          if (next.kind === "ready" && engine) setFirstDisplayMs(engine.stats().firstDisplayMs);
        },
        onPick: (cell) => {
          if (cell) onPickRef.current({ latDeg: cell.latDeg, lonDeg: cell.lonDeg });
        },
      });
      engineRef.current = engine;
      // 버리기 전에 보기를 잴 수 있게 1초마다 적어 둔다(엔진을 버린 뒤에는 읽을 수 없다)
      timer = setInterval(() => {
        const camera = engine?.stats().camera;
        if (camera)
          viewRef.current = { latDeg: camera.latDeg, lonDeg: camera.lonDeg, distanceM: camera.distanceM };
      }, 1000);
    } catch {
      engine?.dispose();
      engine = null;
      engineRef.current = null;
      queueMicrotask(() => setStatus({ kind: "error", message: "engine" }));
    }
    return () => {
      if (timer !== undefined) clearInterval(timer);
      if (engine) {
        const camera = engine.stats().camera;
        viewRef.current = { latDeg: camera.latDeg, lonDeg: camera.lonDeg, distanceM: camera.distanceM };
        engine.dispose();
      }
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [entry, definitionFaceLevel, biomeColors]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !focus) return;
    engine.lookAt({ latDeg: focus.latDeg, lonDeg: focus.lonDeg, distanceM: engine.stats().camera.distanceM });
  }, [focus]);

  const notice = entry ? statusText(status) : m.planet_editor_globe_waiting();
  return (
    <div className="pe-globe">
      <div
        ref={hostRef}
        className="pe-globe-view"
        role="img"
        aria-label={m.planet_editor_view_label()}
        data-face-level={entry?.level ?? ""}
        data-sequence={entry?.sequence ?? ""}
        data-status={entry ? status.kind : "waiting"}
        data-first-display-ms={firstDisplayMs ?? ""}
      />
      {notice ? (
        <p className="pe-globe-notice" role="status">
          {notice}
        </p>
      ) : null}
      {entry && stale ? <p className="pe-globe-stale">{m.planet_editor_stale()}</p> : null}
    </div>
  );
}
