// 시작 국가 설정 화면의 국력 등급 구역 — 요약 막대 + 등급 표 + 랜덤 국가 추가(담음 다루기를 화면 파일 밖에 둔다).
// docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)". 화면(NationEditorScreen)이 담음(stage)을 들고, 여기서 등급 줄·새 프리셋을 담는다.
import type { NationEditorListResponse, NationEditorRow, NationPresetJson } from "@terra/shared/nationEditor";
import type { NationTierJson } from "@terra/shared/nationTier";
import { m } from "../../paraglide/messages.js";
import { sameJson } from "../content/contentEditorModel.ts";
import { NationPowerChart, NationTierTable, powerRowsOf } from "./NationPowerPanel.tsx";
import { NationRandomPanel } from "./NationRandomPanel.tsx";
import { type NationStage, cleanTier, stageCreatedNation, stageTier } from "./nationModel.ts";

/** 등급 표의 지금 보이는 값(담은 값 → 되돌리기를 담았으면 팩 값 → 실효 값) */
export function liveTiersOf(list: NationEditorListResponse, stage: NationStage): NationTierJson[] {
  return list.tiers.map((row) => {
    const staged = stage.tiers.get(row.entry.id);
    if (staged?.op === "put") return staged.entry;
    if (staged?.op === "revert") return row.pack ?? row.entry;
    return row.entry;
  });
}

/** 이번에 새로 만드는 프리셋의 목록 줄(팩에도 덮어쓰기에도 아직 없다) */
export function createdRowsOf(stage: NationStage): NationEditorRow[] {
  return [...stage.created].flatMap((id) => {
    const staged = stage.nations.get(id);
    return staged?.op === "put"
      ? [
          {
            entry: staged.entry,
            origin: "created" as const,
            pack: null,
            override: null,
            hash: "",
            uploaded: null,
            slot: null,
          },
        ]
      : [];
  });
}

export type PowerPanel = "power" | "random" | null;

export function NationPowerSection({
  panel,
  list,
  rows,
  stage,
  locale,
  onStage,
  onSelect,
  onClose,
}: {
  panel: PowerPanel;
  list: NationEditorListResponse;
  /** 목록 줄(새로 만드는 프리셋 포함, 담은 초안 값) */
  rows: readonly { entry: NationPresetJson; uploaded: string | null; slot: number | null }[];
  stage: NationStage;
  locale: "ko" | "en";
  onStage: (next: NationStage) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  if (panel === null) return null;
  const tiers = liveTiersOf(list, stage);
  if (panel === "random")
    return (
      <NationRandomPanel
        existing={rows.map((row) => row.entry)}
        retiredIds={list.retiredIds}
        defaults={list.defaults}
        tiers={tiers}
        locale={locale}
        onAdd={(entry) => {
          onStage(stageCreatedNation(stage, entry));
          onSelect(entry.id);
          onClose();
        }}
        onClose={onClose}
      />
    );
  const editTier = (next: NationTierJson): void => {
    const row = list.tiers.find((item) => item.entry.id === next.id);
    if (!row) return;
    const current = stage.tiers.get(next.id);
    const base = current ? current.base : row.entry;
    const baseHash = current ? current.baseHash : row.hash;
    onStage(
      stageTier(
        stage,
        next.id,
        sameJson(cleanTier(next), cleanTier(base)) ? null : { op: "put", entry: next, base, baseHash },
      ),
    );
  };
  return (
    <section className="ce-panel ne-power" aria-labelledby="ne-power-title" data-testid="ne-power">
      <h2 id="ne-power-title" className="ce-panel-title">
        {m.dev_nations_power_title()}
      </h2>
      <p className="field-hint">{m.dev_nations_power_lead()}</p>
      <NationPowerChart rows={powerRowsOf(rows, list, tiers, locale)} locale={locale} onSelect={onSelect} />
      <h3 className="ne-power-subtitle">{m.dev_nations_tier_table_title()}</h3>
      <p className="field-hint ne-future" role="note">
        {m.dev_nations_tier_table_note()}
      </p>
      <NationTierTable
        rows={list.tiers}
        drafts={new Map(tiers.map((tier) => [tier.id, tier]))}
        staged={new Set(stage.tiers.keys())}
        facilities={list.facilities}
        locale={locale}
        onEdit={editTier}
        onRevert={(id) => {
          const row = list.tiers.find((item) => item.entry.id === id);
          if (!row) return;
          const current = stage.tiers.get(id);
          onStage(
            stageTier(stage, id, {
              op: "revert",
              base: current ? current.base : row.entry,
              baseHash: current ? current.baseHash : row.hash,
            }),
          );
        }}
        onUnstage={(id) => onStage(stageTier(stage, id, null))}
      />
      <span className="ce-inline-actions">
        <button type="button" className="button-small ne-power-close" onClick={onClose}>
          {m.dev_nations_random_close()}
        </button>
      </span>
    </section>
  );
}

/** 잠든 줄(이 판이 읽지 못해 적용하지 않고 둔 덮어쓰기) — 버릴 줄을 고른다 */
export function NationSleeping({
  rows,
  discard,
  onToggle,
}: {
  rows: NationEditorListResponse["sleeping"];
  discard: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="ce-panel" aria-labelledby="ne-sleeping-title">
      <h2 id="ne-sleeping-title" className="ce-panel-title">
        {m.dev_nations_sleeping_title()}
      </h2>
      <ul className="ne-plain-list">
        {rows.map((item) => (
          <li key={item.id} className="ce-inline-actions">
            <span>
              {m.dev_buildings_sleeping_line({
                id: item.id,
                reason: item.reason,
                version: item.contentVersion,
              })}
            </span>
            <button
              type="button"
              aria-pressed={discard.has(item.id)}
              onClick={() => onToggle(item.id, !discard.has(item.id))}
            >
              {m.dev_buildings_discard()}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
