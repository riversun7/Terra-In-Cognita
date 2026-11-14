// 확률 분포 탭 — 스탯 구간별 티어 채집 확률(49 N43·D-513, 옛 skill_tier_probability). /dev/gather-tiers 화면이던 것을 생산 편집기 탭으로
// 옮겼다(사용자 2026-11-11 "예전 에디터가 아직 더 낫다", docs/adr/2026-11-11-production-six.md). 부품은 그대로다: 전체 구간 일괄 프리셋,
// 구간 조절 판(분포 막대·잠금·균등·정규화 — docs/adr/2026-11-10-editor-input-controls.md), 행렬 표(칸을 고치면 나머지가 따라 움직여 합 1000‰).
import type { BuildingEditorGatherBand } from "@terra/shared/buildingEditor";
import type { ContentSleepingRow } from "@terra/shared/contentEdit";
import type { ReactNode } from "react";
import { m } from "../../paraglide/messages.js";
import { GatherBandPanel } from "../gatherTiers/GatherBandPanel.tsx";
import { GatherTierTable } from "../gatherTiers/GatherTierTable.tsx";
import {
  BULK_PRESETS,
  type GatherStage,
  applyBulkPreset,
  bulkEditBands,
  editBand,
  revertBand,
  stageBand,
  stageGatherDiscard,
} from "../gatherTiers/gatherTierModel.ts";
import { BULK_PRESET_TEXT } from "../gatherTiers/gatherTierText.ts";
import type { ProductionTypeRow } from "./productionModel.ts";
import { MODE_TEXT, STAT_CODE } from "./productionText.ts";
import "../gatherTiers/gatherTier.css";

export function ProductionTiersPanel({
  picker,
  bands,
  stage,
  sleeping,
  types,
  locale,
  levelBonus,
  selected,
  onSelect,
  onStage,
  onOpenType,
  canUndo,
  onUndo,
}: {
  /** 띠 표 고르기(기획 D-540 1217 나 — 사다리마다 띠 표) */
  picker?: ReactNode;
  /** 고른 사다리 표의 줄만 */
  bands: readonly BuildingEditorGatherBand[];
  stage: GatherStage;
  /** 잠든 확률표 줄 */
  sleeping: readonly ContentSleepingRow[];
  /** 이 표를 쓰는 생산 종류(추첨)와 쓰지 않는 종류(선택) */
  types: readonly ProductionTypeRow[];
  locale: "ko" | "en";
  levelBonus: number;
  /** 구간 조절 판에 올린 구간(없으면 첫 구간) */
  selected: string | null;
  onSelect: (id: string) => void;
  /**
   * 담은 확률표를 바꾼다(가장 새 담음에서 — 끌어 채우기처럼 한 그림 안에 고침이 이어져도 앞 고침을 잃지 않게 함수로 받는다).
   * editKey가 같으면 되돌리기 한 칸으로 묶는다
   */
  onStage: (update: (current: GatherStage) => GatherStage, editKey?: string) => void;
  onOpenType: (facility: string) => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="pd-tiers">
      <h2 id="gather-tiers-title" className="ce-panel-title pd-tiers-title" tabIndex={-1}>
        {m.dev_prod_tiers_title()}
      </h2>
      <p className="field-hint">
        {m.dev_gather_lead()} {m.dev_gather_rule({ bonus: levelBonus })} {m.dev_gather_ladder_note()}
      </p>
      {picker}
      {sleeping.length > 0 ? (
        <section className="ce-panel" aria-labelledby="gt-sleeping-title">
          <h3 id="gt-sleeping-title" className="ce-panel-title">
            {m.dev_gather_sleeping_title()}
          </h3>
          <ul className="gt-plain-list">
            {sleeping.map((row) => (
              <li key={row.id} className="ce-inline-actions">
                <span>
                  {m.dev_buildings_sleeping_line({
                    id: row.id,
                    reason: row.reason,
                    version: row.contentVersion,
                  })}
                </span>
                <button
                  type="button"
                  aria-pressed={stage.discard.has(row.id)}
                  onClick={() =>
                    onStage((current) => stageGatherDiscard(current, row.id, !current.discard.has(row.id)))
                  }
                >
                  {m.dev_buildings_discard()}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="gt-bulk" role="group" aria-label={m.dev_gather_bulk_label()}>
        <span className="gt-bulk-label">{m.dev_gather_bulk_label()}</span>
        {BULK_PRESETS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="button-small"
            data-preset={kind}
            onClick={() => onStage((current) => applyBulkPreset(current, bands, kind))}
          >
            {BULK_PRESET_TEXT[kind]()}
          </button>
        ))}
        <button
          type="button"
          className="button-small gt-undo"
          aria-disabled={!canUndo || undefined}
          onClick={onUndo}
        >
          {m.dev_input_undo()}
        </button>
      </div>
      <GatherBandPanel
        bands={bands}
        stage={stage}
        selected={selected}
        onSelect={onSelect}
        onEdit={(row, weights, source) =>
          onStage(
            (current) => editBand(current, row, weights),
            source === undefined ? undefined : `band:${row.entry.id}:${source}`,
          )
        }
        onRevert={(row) => onStage((current) => revertBand(current, row))}
        onUnstage={(id) => onStage((current) => stageBand(current, id, null))}
      />
      <GatherTierTable
        bands={bands}
        stage={stage}
        selected={selected ?? bands[0]?.entry.id ?? null}
        onSelect={(id) => {
          onSelect(id);
          document.querySelector(".gt-panel")?.scrollIntoView({ block: "nearest" });
        }}
        onEdit={(row, weights, source) =>
          onStage(
            (current) => editBand(current, row, weights),
            source === undefined ? undefined : `band:${row.entry.id}:${source}`,
          )
        }
        onBulk={(picked, op) => onStage((current) => bulkEditBands(current, bands, picked, op))}
      />
      <section className="ce-panel gt-facilities" aria-labelledby="gt-facilities-title">
        <h3 id="gt-facilities-title" className="ce-panel-title">
          {m.dev_gather_facilities_title()}
        </h3>
        <ul className="gt-facility-list">
          {types.map((row) => (
            <li key={row.type.facility} data-mode={row.type.mode}>
              <button
                type="button"
                className="pd-linkish gt-facility-link"
                onClick={() => onOpenType(row.type.facility)}
              >
                {row.draft.name[locale]}
              </button>{" "}
              <code className="dev-code" translate="no">
                {STAT_CODE[row.gather.primary]()}+{STAT_CODE[row.gather.secondary]()}
              </code>{" "}
              <span className="dev-badge">{MODE_TEXT[row.type.mode]()}</span>
            </li>
          ))}
        </ul>
        <p className="field-hint">{m.dev_gather_mode_note()}</p>
      </section>
    </div>
  );
}
