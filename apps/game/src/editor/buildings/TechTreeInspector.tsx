// 건물 테크트리 우측 상세 패널 — 선택한 건물의 실제 3D 미리보기(BuildingPreview 지연 로딩), Lv1~LvN 레벨 선택,
// 레벨별 수치·모듈, 건설 비용·시간, 선행·해금 이동 칩, [시설 편집에서 열기] 단추.
import type { BuildingPreview } from "@terra/engine/buildingPreview";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { formatDuration } from "./buildingModel.ts";
import { type TechTreeColumnId, type TechTreeNode, formatStorageKg } from "./buildingTechTree.ts";
import { BuildingIsoThumb, ClockIcon } from "./TechTreeIcons.tsx";

/** 우측 패널 상단 실제 3D 건물 미리보기(WebGL 실패 시 아이소메트릭 SVG 대체) */
function Inspector3DStage({ node, level }: { node: TechTreeNode; level: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<BuildingPreview | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  const width = node.entry.footprint?.width ?? 3;
  const depth = node.entry.footprint?.height ?? 3;
  const input = useMemo(
    () => ({
      widthCells: width,
      depthCells: depth,
      seed: 7,
      look: {
        facility: node.entry.id,
        level,
        state: "ok" as const,
        upgrading: false,
        accent: null,
        accentColor: null,
        emblem: null,
        art: node.entry.look ?? null,
      },
    }),
    [width, depth, node.entry.id, node.entry.look, level],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return () => undefined;
    let alive = true;
    let observer: ResizeObserver | null = null;
    void import("./buildingEditorPreview.ts").then(
      (module) => {
        if (!alive) return;
        try {
          const preview = new module.BuildingPreview(canvas);
          previewRef.current = preview;
          observer = new ResizeObserver(() => {
            preview.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
          });
          observer.observe(canvas);
          preview.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
          setStatus("ready");
        } catch {
          setStatus("failed");
        }
      },
      () => {
        if (alive) setStatus("failed");
      },
    );
    return () => {
      alive = false;
      observer?.disconnect();
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const preview = previewRef.current;
    if (status !== "ready" || !preview) return;
    preview.set(input);
    preview.setNight(0);
  }, [input, status]);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const start = dragRef.current;
    const preview = previewRef.current;
    if (!start || !preview) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    dragRef.current = { x: event.clientX, y: event.clientY };
    preview.rotate(-dx * 0.01, dy * 0.008);
  };
  const onPointerUp = (): void => {
    dragRef.current = null;
  };

  return (
    <div className="btt-hero-stage" data-preview={status}>
      {status === "failed" ? (
        <div className="btt-hero-fallback">
          <BuildingIsoThumb entry={node.entry} column={node.column} className="btt-hero-iso" />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="btt-hero-canvas"
          aria-label={node.entry.name.ko}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      )}
      <span className="btt-hero-tier">{m.dev_buildings_tree_tier_code({ tier: node.tier })}</span>
    </div>
  );
}

export function TechTreeInspector({
  node,
  level,
  onLevel,
  locale,
  columnLabel,
  itemNames,
  facilityNames,
  directUnlocks,
  showMaterialEdges,
  onSelectId,
  onOpenEdit,
}: {
  node: TechTreeNode | null;
  level: number;
  onLevel: (lv: number) => void;
  locale: "ko" | "en";
  columnLabel: (col: TechTreeColumnId) => string;
  itemNames: ReadonlyMap<string, string>;
  facilityNames: ReadonlyMap<string, string>;
  directUnlocks: readonly string[];
  showMaterialEdges: boolean;
  onSelectId: (id: string) => void;
  onOpenEdit: (id: string) => void;
}) {
  if (!node) {
    return (
      <aside className="btt-drawer btt-drawer-empty" aria-label={m.dev_buildings_tree_inspector_label()}>
        <p className="btt-drawer-hint">{m.dev_buildings_tree_footer_hint()}</p>
      </aside>
    );
  }

  const activeLv = node.levels.find((row) => row.level === level) ?? node.levels[0];
  const currentLevel = activeLv?.level ?? 1;

  // 대표 수치 타일(창고 용량 → 자리 수 → 채집 보너스 우선)
  let primaryLabel = m.dev_buildings_tree_metric_slots();
  let primaryValue = String(activeLv?.slots ?? 0);
  let primaryDelta: string | null =
    activeLv && activeLv.level > 1 && activeLv.slotsDelta > 0 ? `+${activeLv.slotsDelta}` : null;

  if (activeLv && activeLv.storageKg !== null) {
    primaryLabel = m.dev_buildings_tree_metric_storage();
    primaryValue = formatStorageKg(activeLv.storageKg);
    primaryDelta =
      activeLv.level > 1 && activeLv.storageDeltaKg !== null && activeLv.storageDeltaKg > 0
        ? `+${formatStorageKg(activeLv.storageDeltaKg)}`
        : null;
  } else if (activeLv && activeLv.gatherBonus !== null && activeLv.slots === 0) {
    primaryLabel = m.dev_buildings_tree_metric_gather();
    primaryValue = `+${activeLv.gatherBonus}`;
    primaryDelta =
      activeLv.level > 1 && activeLv.gatherBonusDelta !== null && activeLv.gatherBonusDelta > 0
        ? `+${activeLv.gatherBonusDelta}`
        : null;
  }

  const durabilityValue = String(activeLv?.durability ?? node.entry.durability ?? 100);
  const durabilityDelta =
    activeLv && activeLv.level > 1 && activeLv.durabilityDelta > 0 ? `+${activeLv.durabilityDelta}` : null;
  const firstNote = activeLv?.notes[0]?.[locale] ?? null;

  return (
    <aside className="btt-drawer" aria-label={m.dev_buildings_tree_inspector_label()}>
      <Inspector3DStage node={node} level={currentLevel} />

      <div
        className="btt-lv-tabs"
        role="tablist"
        aria-label={m.dev_buildings_tree_levels_toggle({ max: node.maxLevel })}
      >
        {node.levels.map((row) => (
          <button
            key={row.level}
            type="button"
            role="tab"
            aria-selected={row.level === currentLevel}
            className="btt-lv-tab"
            data-special={row.bandChanged || row.notes.length > 0 ? "" : undefined}
            onClick={() => onLevel(row.level)}
          >
            {m.dev_buildings_tree_level_badge({ level: row.level })}
          </button>
        ))}
      </div>

      <div className="btt-drawer-title-block">
        <div className="btt-drawer-title-row">
          <h2 className="btt-drawer-name">{node.entry.name[locale]}</h2>
          <span className="btt-drawer-col">{columnLabel(node.column)}</span>
        </div>
        <p className="btt-drawer-sub">{node.summary[locale]}</p>
        <div className="btt-drawer-id-row">
          <span className="btt-card-id">{node.id}</span>
          {node.traits.slice(0, 3).map((trait, idx) => (
            <span key={`${node.id}-tr-${idx}`} className="btt-trait-chip">
              {trait[locale]}
            </span>
          ))}
        </div>
      </div>

      <section className="btt-drawer-section">
        <h3 className="btt-drawer-heading">{m.dev_buildings_tree_section_effects()}</h3>
        <div className="btt-metric-grid">
          <div className="btt-metric-tile">
            <span className="btt-metric-k">{primaryLabel}</span>
            <strong className="btt-metric-v">{primaryValue}</strong>
            {primaryDelta ? <span className="btt-metric-d">{primaryDelta}</span> : null}
          </div>
          <div className="btt-metric-tile">
            <span className="btt-metric-k">{m.dev_buildings_tree_metric_durability()}</span>
            <strong className="btt-metric-v">{durabilityValue}</strong>
            {durabilityDelta ? <span className="btt-metric-d">{durabilityDelta}</span> : null}
          </div>
          <div className="btt-metric-tile" data-accent={firstNote || activeLv?.bandChanged ? "" : undefined}>
            <span className="btt-metric-k">{m.dev_buildings_tree_metric_module()}</span>
            <strong className="btt-metric-mod">
              {firstNote ??
                (activeLv?.bandChanged
                  ? m.dev_buildings_tree_band_switch()
                  : m.dev_buildings_tree_level_badge({ level: currentLevel }))}
            </strong>
          </div>
        </div>
        {activeLv && activeLv.notes.length > 1 ? (
          <ul className="btt-drawer-notes">
            {activeLv.notes.slice(1).map((note, idx) => (
              <li key={`note-${idx}`}>{note[locale]}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="btt-drawer-section">
        <h3 className="btt-drawer-heading">{m.dev_buildings_tree_section_cost()}</h3>
        <div className="btt-cost-pills">
          {activeLv && activeLv.materials.length > 0 ? (
            activeLv.materials.map((mat) => (
              <span key={mat.item} className="btt-cost-pill" data-disabled={mat.disabled ? "" : undefined}>
                <span className="btt-cost-name">{itemNames.get(mat.item) ?? mat.item}</span>
                <strong className="btt-cost-qty">{mat.qty}</strong>
              </span>
            ))
          ) : (
            <span className="btt-inspector-muted">{m.dev_buildings_tree_no_materials()}</span>
          )}
          {activeLv ? (
            <span className="btt-cost-time">
              <ClockIcon />
              {formatDuration(activeLv.timeMs)}
            </span>
          ) : null}
        </div>
      </section>

      <section className="btt-drawer-section">
        <h3 className="btt-drawer-heading">
          {m.dev_buildings_tree_prereq_label()} / {m.dev_buildings_tree_unlocks_label()}
        </h3>
        <div className="btt-rel-list">
          {node.explicitRequires.length === 0 &&
          (!showMaterialEdges || node.inferredProducers.length === 0) ? (
            <span className="btt-inspector-muted">{m.dev_buildings_tree_prereq_none()}</span>
          ) : (
            <>
              {node.explicitRequires.map((req) => (
                <button
                  key={`req-${req.facilityId}`}
                  type="button"
                  className="btt-jump-chip btt-jump-explicit"
                  onClick={() => onSelectId(req.facilityId)}
                >
                  {facilityNames.get(req.facilityId) ?? req.facilityId}
                  {req.minLevel && req.minLevel > 1 ? ` Lv${req.minLevel}` : ""}
                </button>
              ))}
              {showMaterialEdges
                ? node.inferredProducers.map((prod) => (
                    <button
                      key={`mat-${prod.facilityId}`}
                      type="button"
                      className="btt-jump-chip btt-jump-material"
                      onClick={() => onSelectId(prod.facilityId)}
                    >
                      {facilityNames.get(prod.facilityId) ?? prod.facilityId} (
                      {prod.items.map((id) => itemNames.get(id) ?? id).join(", ")})
                    </button>
                  ))
                : null}
            </>
          )}
        </div>
        {directUnlocks.length > 0 ? (
          <div className="btt-rel-list">
            <span className="btt-rel-arrow" aria-hidden="true">
              →
            </span>
            {directUnlocks.map((targetId) => (
              <button
                key={`out-${targetId}`}
                type="button"
                className="btt-jump-chip btt-jump-down"
                onClick={() => onSelectId(targetId)}
              >
                {facilityNames.get(targetId) ?? targetId}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <button type="button" className="btt-cta-btn" onClick={() => onOpenEdit(node.id)}>
        {m.dev_buildings_tree_open_edit_cta()} ▶
      </button>
    </aside>
  );
}
