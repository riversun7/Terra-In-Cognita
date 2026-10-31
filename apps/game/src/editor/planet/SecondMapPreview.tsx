// 편집기 2차맵 미리보기 창 — ADR 2026-10-31-second-map-from-planet 9절(ADR 38 D6a). 지연 조각(planetEditorSecondMap.ts)으로만 들어온다:
// 2차맵 엔진(@terra/engine)을 편집기 첫 조각에 넣지 않는다.
// - 열리면 워커 손잡이에 부탁한다(행성 진짜 면 레벨 → 누른 칸의 2차맵). 단계 글을 보이고, 결과가 오면 2차맵 엔진으로 그린다.
// - 낮밤은 끈다(고정 빛, 엔진 sky 없음): 지형을 보는 도구다. 유닛·건물·안개 없음.
// - <dialog>.showModal(): 초점을 가두고 Esc·[닫기]로 닫는다. 닫으면 엔진을 버린다(워커의 행성 값은 손잡이가 들고 있다).
// 시험·측정용 data-*: data-status(planet·map·ready·failed), data-hash(2차맵 결과 해시), data-props(세운 소품 모델 수).
import { type SecondMapEngine, createSecondMapEngine } from "@terra/engine";
import { useEffect, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { formatNumber } from "./editorMessages.ts";
import {
  type SecondMapJob,
  SecondMapPreviewError,
  type SecondMapPreviewClient,
  previewTerrainInput,
} from "./secondMapPreviewClient.ts";
import type { SecondMapPreviewResult, SecondMapPreviewStage } from "./secondMapPreviewProtocol.ts";

export interface SecondMapPreviewProps {
  readonly client: SecondMapPreviewClient;
  readonly job: SecondMapJob;
  /** 행성 면 레벨(단계 글) */
  readonly level: number;
  readonly onClose: () => void;
}

type ViewState =
  | { readonly kind: "working"; readonly stage: SecondMapPreviewStage | null }
  | { readonly kind: "ready"; readonly result: SecondMapPreviewResult }
  | { readonly kind: "failed"; readonly code: string };

/** 엔진 소품 수를 읽는 간격(ms) — 시험 표지(data-props)만 쓴다 */
const STATS_MS = 1000;

function stageText(stage: SecondMapPreviewStage | null, level: number): string {
  return stage === "map"
    ? m.planet_editor_second_map_stage_map()
    : m.planet_editor_second_map_stage_planet({ level: String(level) });
}

function readyText(result: SecondMapPreviewResult): string {
  const { terrain, planetMs, mapMs } = result;
  const planet =
    planetMs === null
      ? m.planet_editor_second_map_planet_reused()
      : m.planet_editor_second_map_planet_ms({ seconds: formatNumber(planetMs / 1000, 1) });
  return m.planet_editor_second_map_ready({
    cell: formatNumber(terrain.cellSizeMm / 1000, 2),
    ms: formatNumber(mapMs),
    planet,
    hash: terrain.hash,
  });
}

export default function SecondMapPreview({ client, job, level, onClose }: SecondMapPreviewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [state, setState] = useState<ViewState>({ kind: "working", stage: null });
  const [props, setProps] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // 부탁 → 결과가 오면 엔진을 만들어 지형을 건다. 닫히면(언마운트) 낡은 결과는 버리고 엔진을 버린다
  useEffect(() => {
    let live = true;
    let engine: SecondMapEngine | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    client
      .request(job, (stage) => {
        if (live) setState({ kind: "working", stage });
      })
      .then((result) => {
        const host = hostRef.current;
        if (!live || !host) return;
        // 지형 입력을 먼저 바꾼다(틀리면 엔진을 만들지 않고 실패로 보인다)
        const terrain = previewTerrainInput(result.terrain);
        setState({ kind: "ready", result });
        const created = createSecondMapEngine(host, { mapKey: job.mapKey });
        engine = created;
        void created.setTerrain(terrain);
        timer = setInterval(() => setProps(created.stats().props), STATS_MS);
      })
      .catch((error: unknown) => {
        if (live)
          setState({ kind: "failed", code: error instanceof SecondMapPreviewError ? error.code : "failed" });
      });
    return () => {
      live = false;
      if (timer !== null) clearInterval(timer);
      engine?.dispose();
    };
  }, [client, job]);

  const status = state.kind === "working" ? (state.stage ?? "planet") : state.kind;
  return (
    <dialog
      ref={dialogRef}
      className="pe-dialog pe-second-map-dialog"
      aria-labelledby={titleId}
      data-density="compact"
      data-status={status}
      data-hash={state.kind === "ready" ? state.result.terrain.hash : undefined}
      data-props={props}
      onClose={onClose}
    >
      <div className="pe-dialog-body">
        <h2 id={titleId} className="pe-dialog-title">
          {m.planet_editor_second_map_title({ key: String(job.mapKey) })}
        </h2>
        <p className="field-hint" role="status">
          {state.kind === "working" ? stageText(state.stage, level) : null}
          {state.kind === "ready" ? readyText(state.result) : null}
          {state.kind === "failed" ? m.planet_editor_second_map_failed({ code: state.code }) : null}
        </p>
        <div
          ref={hostRef}
          className="pe-second-map-view"
          role="img"
          aria-label={m.planet_editor_second_map_view_label()}
        />
        <p className="field-hint">{m.planet_editor_second_map_note()}</p>
        <form method="dialog" className="form-actions">
          <button type="submit" className="pe-second-map-close">
            {m.planet_editor_second_map_close()}
          </button>
        </form>
      </div>
    </dialog>
  );
}
