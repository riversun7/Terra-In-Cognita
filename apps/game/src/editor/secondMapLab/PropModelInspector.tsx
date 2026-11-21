// 선택된 지형 오브젝트의 3D 로우폴리 모델 미리 보기 카드 — 끌기 회전·휠 확대·변형 씨앗·눈 효과·[맵에서 찾기].
// @terra/engine/propPreview의 PropPreview를 써서 실제 2차맵과 같은 부품 기하·조명으로 그린다.
import { PropPreview, type PropPreviewStats, defaultGroundForArt } from "@terra/engine/propPreview";
import { mapPropArtCode } from "@terra/shared";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import type { TerrainRow, TerrainRowKind } from "../terrainObjects/terrainObjectsModel.ts";
import { artText } from "./labMessages.ts";

const KIND_TEXT: Readonly<Record<TerrainRowKind, () => string>> = {
  decor: m.dev_terrain_objects_kind_decor,
  slow: m.dev_terrain_objects_kind_slow,
  cover: m.dev_terrain_objects_kind_cover,
  water: m.dev_terrain_objects_kind_water,
  site: m.dev_terrain_objects_kind_site,
  school: m.dev_terrain_objects_kind_school,
};

const formatDec = (value: number): string => (Math.round(value * 10) / 10).toFixed(1);

export interface PropModelInspectorProps {
  readonly row: TerrainRow | null;
  readonly biomeId: string | null;
  readonly locale: "ko" | "en";
  /** 현재 열린 2차맵에 놓인 개수(0이면 찾기 비활성) */
  readonly mapCount: number;
  readonly onLocate: () => void;
}

export function PropModelInspector({ row, biomeId, locale, mapCount, onLocate }: PropModelInspectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<PropPreview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [seed, setSeed] = useState(0);
  const [snowy, setSnowy] = useState(false);
  const [stats, setStats] = useState<PropPreviewStats | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return () => undefined;
    let observer: ResizeObserver | null = null;
    try {
      const preview = new PropPreview(canvas);
      previewRef.current = preview;
      observer = new ResizeObserver(() => {
        preview.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
      });
      observer.observe(canvas);
      preview.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
      queueMicrotask(() => setStatus("ready"));
    } catch {
      queueMicrotask(() => setStatus("failed"));
    }
    return () => {
      observer?.disconnect();
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  const art = row?.art ?? "";
  const isSnowBiome = biomeId === "ice_sheet" || biomeId === "tundra";
  const effectiveSnow = snowy || isSnowBiome;

  useEffect(() => {
    const preview = previewRef.current;
    if (status !== "ready" || !preview || !art) return;
    const ground =
      effectiveSnow && !defaultGroundForArt(art, biomeId).includes("water")
        ? "snow"
        : defaultGroundForArt(art, biomeId);
    const next = preview.set({ art, seed, snowy: effectiveSnow, ground });
    queueMicrotask(() => setStats(next));
  }, [status, art, seed, effectiveSnow, biomeId]);

  const onKey = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    const preview = previewRef.current;
    if (!preview) return;
    const step = 0.22;
    const actions: Readonly<Record<string, () => void>> = {
      ArrowLeft: () => preview.rotate(step, 0),
      ArrowRight: () => preview.rotate(-step, 0),
      ArrowUp: () => preview.rotate(0, step * 0.6),
      ArrowDown: () => preview.rotate(0, -step * 0.6),
      "+": () => preview.zoom(1 / 1.15),
      "=": () => preview.zoom(1 / 1.15),
      "-": () => preview.zoom(1.15),
      "0": () => preview.reset(),
      Home: () => preview.reset(),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const label = row ? row.name[locale] : "";
  const artCode = art ? mapPropArtCode(art) : -1;

  return (
    <section
      className="to-inspector"
      aria-label={m.dev_terrain_lab_model_title()}
      data-art={art}
      data-preview={status}
    >
      <div className="to-inspector-stage">
        <canvas
          ref={canvasRef}
          className="to-inspector-canvas"
          tabIndex={0}
          role="img"
          aria-label={m.dev_terrain_lab_model_canvas_label({ name: label || art })}
          data-parts={stats?.parts}
          data-triangles={stats?.triangles}
          onKeyDown={onKey}
        />
        {status === "loading" ? (
          <p className="to-inspector-overlay">{m.dev_terrain_lab_preview_loading()}</p>
        ) : null}
        {status === "failed" ? (
          <p className="to-inspector-overlay">{m.dev_terrain_lab_preview_failed()}</p>
        ) : null}
      </div>
      <div className="to-inspector-info">
        {row ? (
          <>
            <div className="to-inspector-head">
              <strong className="to-inspector-name">{label}</strong>
              <span className="dev-badge" data-kind={row.kind}>
                {KIND_TEXT[row.kind]()}
              </span>
              {stats ? (
                <span className="dev-badge">
                  {stats.float ? m.dev_terrain_lab_water_tag() : m.dev_terrain_lab_land_tag()}
                </span>
              ) : null}
            </div>
            <p className="to-inspector-codes">
              <code>{row.id}</code>
              {" · "}
              <code>{row.art}</code>
              {artCode > 0 ? ` (${artText(artCode)})` : ""}
            </p>
            {stats ? (
              <p className="to-inspector-stats">
                {m.dev_terrain_lab_model_stats({
                  height: formatDec(stats.heightM),
                  width: formatDec(Math.max(stats.widthM, stats.depthM)),
                  parts: stats.parts,
                  tris: stats.triangles,
                })}
              </p>
            ) : null}
            <p className="to-inspector-keys">{m.dev_terrain_lab_model_keys()}</p>
            <div className="to-inspector-actions">
              <button
                type="button"
                className="button-small"
                onClick={() => setSeed((current) => (current + 1) % 6)}
              >
                {m.dev_terrain_lab_model_variant({ n: seed + 1 })}
              </button>
              <button
                type="button"
                className="button-small"
                aria-pressed={effectiveSnow}
                onClick={() => setSnowy((current) => !current)}
              >
                {m.dev_terrain_lab_model_snow()}
              </button>
              <button type="button" className="button-small" onClick={() => previewRef.current?.reset()}>
                {m.dev_terrain_lab_model_reset()}
              </button>
              <button
                type="button"
                className="button-small button-primary to-locate-btn"
                disabled={mapCount <= 0}
                aria-label={m.dev_terrain_lab_locate_aria({ name: label })}
                onClick={onLocate}
              >
                {m.dev_terrain_lab_locate({ count: mapCount })}
              </button>
            </div>
          </>
        ) : (
          <p className="dev-muted">{m.dev_terrain_lab_model_empty()}</p>
        )}
      </div>
    </section>
  );
}
