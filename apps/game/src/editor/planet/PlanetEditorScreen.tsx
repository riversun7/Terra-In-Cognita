// 행성 편집기 화면(/dev/planet-editor, 틀 숨김) — ADR 38. 주소 → 화면 표(shell/routeViews.tsx)가 지연 로딩 조각으로 연다.
// 조각 이름은 이 파일 이름을 따른다(PlanetEditorScreen-*.js): 미리 캐시 규칙 DEV_ONLY_CHUNK의 [Pp]lanetEditor에 걸려
// 플레이어 설치 때 받지 않는다(ADR 38 1절). 파일 이름 앞머리를 바꾸지 않는다.
// 화면은 { onClose, monitor }만 받는다(ADR 37 주소 → 화면 표). 순서: 정의 조회(서버가 켤 때 만든 팩 행성·바이옴·확인 해시,
// 부를 때마다 감사 기록) → 행성 고르기(기본은 편집 전용 행성 s2_editor_planet) → 편집 화면(EditorWorkspace).
// 화면 시험은 e2e/planet-editor.spec.ts.
import { useEffect, useId, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { apiErrorInfo } from "../../net/apiErrors.ts";
import { m } from "../../paraglide/messages.js";
import type { FrameMonitor } from "../../perf/frameMonitor.ts";
import { LiveMessage } from "../../ui/LiveMessage.tsx";
import { text } from "../../ui/text.ts";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { type EditorDefinitions, EditorWorkspace } from "./EditorWorkspace.tsx";
import { localName } from "./editorMessages.ts";
import "./planetEditor.css";

/** 처음 여는 행성: 편집 전용 행성(ADR 38 10절, 사용자 D2). 팩에 없으면 첫 행성 */
const DEFAULT_PLANET_ID = "s2_editor_planet";

interface PlanetEditorScreenProps {
  onClose: () => void;
  /** 앱 프레임 측정기 — 지금은 쓰지 않는다(편집기는 성능 보고 화면이 아니다). 주소 → 화면 표와 모양을 맞춘다 */
  monitor: FrameMonitor;
}

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly definitions: EditorDefinitions };

/** [다시 시도]는 안쪽을 새로 만든다(정의를 다시 받는다) */
export default function PlanetEditorScreen({ onClose }: PlanetEditorScreenProps) {
  const [attempt, setAttempt] = useState(0);
  return <EditorLoader key={attempt} onClose={onClose} onRetry={() => setAttempt((count) => count + 1)} />;
}

function EditorLoader({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [planetId, setPlanetId] = useState<string | null>(null);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const selectId = useId();

  useEffect(() => {
    let cancelled = false;
    api.planetEditor.definitions.query().then(
      (definitions) => {
        if (!cancelled) setLoad({ kind: "ready", definitions });
      },
      (error: unknown) => {
        if (cancelled) return;
        const info = apiErrorInfo(error);
        if (info.sessionEnded) void refreshSession();
        setLoad({ kind: "failed", message: text({ key: info.key }) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const definitions = load.kind === "ready" ? load.definitions : null;
  const planets = definitions?.planets ?? [];
  const chosen =
    planets.find((planet) => planet.id === planetId) ??
    planets.find((planet) => planet.id === DEFAULT_PLANET_ID) ??
    planets[0] ??
    null;

  const heading = (
    <>
      <h1 id="planet-editor-title" className="pe-title" ref={headingRef} tabIndex={-1}>
        {m.shell_route_dev_planet_editor()}
      </h1>
      {planets.length > 1 && chosen ? (
        <>
          <label htmlFor={selectId} className="visually-hidden">
            {m.planet_editor_planet()}
          </label>
          <select
            id={selectId}
            className="pe-planet-select"
            value={chosen.id}
            onChange={(event) => setPlanetId(event.target.value)}
          >
            {planets.map((planet) => (
              <option key={planet.id} value={planet.id}>
                {localName(planet.entry.name, planet.id)}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </>
  );

  return (
    <section className="pe-screen" data-density="compact" aria-labelledby="planet-editor-title">
      {definitions && chosen ? (
        <EditorWorkspace
          key={chosen.id}
          planet={chosen}
          definitions={definitions}
          onClose={onClose}
          heading={heading}
        />
      ) : (
        <>
          <header className="pe-header">
            <button type="button" className="button-small pe-back" onClick={onClose}>
              {m.planet_editor_back()}
            </button>
            {heading}
          </header>
          <div className="pe-center">
            {load.kind === "loading" ? (
              <p className="status pe-loading" role="status">
                {m.planet_editor_loading()}
              </p>
            ) : (
              <>
                <LiveMessage
                  tone="error"
                  lines={
                    load.kind === "failed"
                      ? [m.planet_editor_load_failed(), load.message]
                      : [m.planet_editor_no_planets()]
                  }
                />
                <div className="form-actions">
                  <button type="button" onClick={onRetry}>
                    {m.retry()}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
