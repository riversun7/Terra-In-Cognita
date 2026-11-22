// [유닛 · 프리셋] 전용 탭 — 유닛 프리셋 도감(저장된 팀 프리셋 + 다양한 내장 샘플)을 둘러보고,
// 새 유닛을 꾸며 서버 미리 보기로 확인한 뒤 저장·복제·이름 바꾸기·지우기하거나 곧바로 팀 A·B에 넣는다.
import {
  LAB_LIMITS,
  type LabPreviewResponse,
  type LabTeam,
  type LabUnit,
  newLabUnit,
} from "@terra/shared/battleLab";
import { useEffect, useId, useRef, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../../../ui/LiveMessage.tsx";
import {
  DEFAULT_UNIT_PRESET,
  addUnit,
  clampLevel,
  isLabUnitShape,
  labErrorOf,
  nameIn,
  unitPresets,
} from "./labModel.ts";
import { itemName, labErrorText, localized, teamText, unitTitle } from "./labMessages.ts";
import { UnitEditor } from "./UnitEditor.tsx";
import { UnitPreview } from "./UnitPreview.tsx";
import type { LabData } from "./useLabData.ts";

const QUICK_LEVELS = [1, 10, 20, 30, 50, 60] as const;
const PREVIEW_DELAY_MS = 250;

type SourceFilter = "all" | "team" | "sample";

export function UnitWorkshopTab(props: { readonly data: LabData; readonly locale: string }) {
  const { data, locale } = props;
  const { load, presets } = data;
  const id = useId();
  const list = unitPresets(presets?.presets ?? []);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [kindFilter, setKindFilter] = useState("");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(DEFAULT_UNIT_PRESET);
  const [draftState, setDraftState] = useState<LabUnit | null>(null);
  const [preview, setPreview] = useState<{ key: string; result: LabPreviewResponse } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSeq = useRef(0);
  const notice = useLiveLines();
  const noticeError = useLiveLines();

  // 사용자가 고르기 전에는 기본 샘플을 그대로 보여 준다(effect 안 setState 없이 파생)
  const initialPreset = list.find((entry) => entry.id === DEFAULT_UNIT_PRESET) ?? list[0] ?? null;
  const draft: LabUnit = draftState ?? initialPreset?.data ?? newLabUnit("cyborg");
  const effectiveActiveId = draftState === null ? (initialPreset?.id ?? null) : activeId;
  const updateDraft = (change: (current: LabUnit) => LabUnit): void =>
    setDraftState((current) => change(current ?? initialPreset?.data ?? newLabUnit("cyborg")));

  const unitJson = JSON.stringify(draft);
  const ready = load.status === "ready";

  useEffect(() => {
    if (!ready) return undefined;
    const seq = previewSeq.current + 1;
    previewSeq.current = seq;
    const timer = setTimeout(() => {
      const input: unknown = JSON.parse(unitJson);
      if (!isLabUnitShape(input)) return;
      api.battleLab.preview.query(input).then(
        (result) => {
          if (previewSeq.current !== seq) return;
          setPreview({ key: unitJson, result });
          setPreviewError(null);
        },
        (error: unknown) => {
          if (previewSeq.current !== seq) return;
          const info = labErrorOf(error);
          if (info.sessionEnded) void refreshSession();
          setPreviewError(labErrorText(info.key));
        },
      );
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, unitJson]);

  const onNotice = (line: string, tone: "success" | "error"): void => {
    if (tone === "success") {
      noticeError.clear();
      notice.show([line]);
    } else {
      notice.clear();
      noticeError.show([line]);
    }
  };

  if (load.status === "loading") {
    return (
      <div className="bl-workshop" data-status="loading">
        <p className="field-hint">{m.dev_balance_loading()}</p>
      </div>
    );
  }
  if (load.status === "failed") {
    return (
      <div className="bl-workshop bp-failed" data-status="failed">
        <p role="alert" className="field-error">
          {labErrorText(load.error.key)}
        </p>
        <button type="button" className="button-small" onClick={data.reload}>
          {m.dev_balance_retry()}
        </button>
      </div>
    );
  }

  const { catalog } = load;
  const query = search.trim().toLowerCase();
  const filtered = list.filter((entry) => {
    if (sourceFilter !== "all" && entry.source !== sourceFilter) return false;
    if (kindFilter !== "" && entry.data.kind !== kindFilter) return false;
    if (query === "") return true;
    const label = nameIn(entry.name, locale).toLowerCase();
    const kindName = localized(
      catalog.unitKinds.find((k) => k.id === entry.data.kind)?.name,
      locale,
      entry.data.kind,
    ).toLowerCase();
    return label.includes(query) || kindName.includes(query) || entry.data.kind.includes(query);
  });

  const sendToTeam = (team: LabTeam): void => {
    if (data.teams[team].units.length >= LAB_LIMITS.partyMax) {
      onNotice(m.dev_lab_workshop_full({ team: teamText(team), max: LAB_LIMITS.partyMax }), "error");
      return;
    }
    data.setTeams((current) => addUnit(current, team, draft));
    onNotice(m.dev_lab_workshop_sent_team({ team: teamText(team) }), "success");
  };

  const activePreset = list.find((entry) => entry.id === effectiveActiveId);
  const titleKey = activePreset ? nameIn(activePreset.name, locale) : unitTitle(draft, catalog, locale);

  return (
    <div className="bl-workshop" data-status="ready">
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={noticeError.lines} version={noticeError.version} />

      <div className="bl-workshop-grid">
        <aside className="bp-panel bl-workshop-list" aria-labelledby={`${id}-list-title`}>
          <div className="bp-panel-head">
            <h2 id={`${id}-list-title`} className="bp-title">
              {m.dev_lab_workshop_title()}
            </h2>
            <button
              type="button"
              className="button-primary button-small bl-workshop-new"
              onClick={() => {
                setActiveId(null);
                setDraftState(newLabUnit(kindFilter || catalog.unitKinds[0]?.id || "cyborg"));
              }}
            >
              {m.dev_lab_workshop_new()}
            </button>
          </div>

          <div className="bl-workshop-filters">
            <div className="bl-scale-group" role="group" aria-label={m.dev_lab_workshop_title()}>
              {(
                [
                  ["all", m.dev_lab_workshop_all()],
                  ["team", m.dev_lab_workshop_saved()],
                  ["sample", m.dev_lab_workshop_sample()],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className="button-small bl-scale-btn"
                  aria-pressed={sourceFilter === key}
                  onClick={() => setSourceFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="bl-workshop-filter-row">
              <label className="visually-hidden" htmlFor={`${id}-search`}>
                {m.dev_lab_workshop_search()}
              </label>
              <input
                id={`${id}-search`}
                type="search"
                className="input bl-workshop-search"
                placeholder={m.dev_lab_workshop_search()}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <label className="visually-hidden" htmlFor={`${id}-kind`}>
                {m.dev_lab_kind()}
              </label>
              <select
                id={`${id}-kind`}
                className="bl-workshop-kind"
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value)}
              >
                <option value="">{m.dev_lab_workshop_all()}</option>
                {catalog.unitKinds.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {localized(kind.name, locale, kind.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="field-hint">{m.dev_lab_workshop_empty()}</p>
          ) : (
            <ul className="bl-workshop-items">
              {filtered.map((entry) => {
                const selected = effectiveActiveId === entry.id;
                const weapon =
                  entry.data.weapon.kind === "item"
                    ? itemName(catalog, entry.data.weapon.id, locale)
                    : entry.data.weapon.kind === "custom"
                      ? m.dev_lab_weapon_custom()
                      : m.dev_lab_weapon_natural();
                const kindLabel = localized(
                  catalog.unitKinds.find((k) => k.id === entry.data.kind)?.name,
                  locale,
                  entry.data.kind,
                );
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="bl-workshop-item"
                      data-source={entry.source}
                      aria-pressed={selected}
                      onClick={() => {
                        setActiveId(entry.id);
                        setDraftState(entry.data);
                      }}
                    >
                      <span className="bl-workshop-item-head">
                        <strong className="bl-workshop-item-name">{nameIn(entry.name, locale)}</strong>
                        <span className="bl-workshop-badge" data-source={entry.source}>
                          {entry.source === "team" ? m.dev_lab_workshop_saved() : m.dev_lab_workshop_sample()}
                        </span>
                      </span>
                      <span className="bl-workshop-item-meta">
                        {`${kindLabel} · Lv ${entry.data.level} · ${weapon}`}
                        {entry.data.skills.length > 0
                          ? ` · ${m.dev_lab_skill_count({ count: entry.data.skills.length })}`
                          : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="bl-workshop-main">
          <div className="bp-panel bl-workshop-bar">
            <div className="bl-level-bar">
              <span className="bl-level-label">{m.dev_lab_workshop_quick_level()}</span>
              <div className="bl-level-chips">
                {QUICK_LEVELS.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    className="button-small bl-level-chip"
                    aria-pressed={draft.level === lv}
                    onClick={() => updateDraft((current) => ({ ...current, level: clampLevel(lv) }))}
                  >
                    {`Lv ${lv}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="bl-team-utils">
              <button type="button" className="button-small bl-send-team-a" onClick={() => sendToTeam("a")}>
                {m.dev_lab_workshop_send_a()}
              </button>
              <button type="button" className="button-small bl-send-team-b" onClick={() => sendToTeam("b")}>
                {m.dev_lab_workshop_send_b()}
              </button>
            </div>
          </div>

          <div className="bl-workbench">
            <div className="bl-col">
              <UnitEditor
                key={effectiveActiveId ?? "new"}
                unit={draft}
                unitKey={titleKey}
                team="a"
                catalog={catalog}
                presets={presets}
                locale={locale}
                onChange={updateDraft}
                onPresets={data.setPresets}
                onNotice={onNotice}
              />
            </div>
            <div className="bl-col">
              <UnitPreview
                preview={preview?.result ?? null}
                error={previewError}
                stale={preview !== null && preview.key !== unitJson}
                catalog={catalog}
                locale={locale}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
