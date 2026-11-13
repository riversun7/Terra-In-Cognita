// 2차 스탯 에디터(/dev/secondary-stats) — 가중치·공식 편집 + 4종 SVG 시각화.
// 조각 이름 SecondaryStatsEditorScreen-*(미리 캐시 규칙 [Ss]econdaryStats).
// 기존 /dev/balance([가중치 표]·[계산식])은 건드리지 않는다. 걷기 속도(walk_speed / D-540)는 제외한다.
import type { BalancePrimaries, BalanceTableResponse } from "@terra/shared/balance";
import type { FormulaListResponse } from "@terra/shared/formula";
import { PRIMARY_STATS } from "@terra/shared/roster";
import {
  SECONDARY_ARCHETYPE_IDS,
  SECONDARY_ARCHETYPE_WEIGHTS,
  SECONDARY_INITIAL_SUM_MAX,
  SECONDARY_INITIAL_SUM_MIN,
  SECONDARY_INITIAL_SUM_PRESETS,
  SECONDARY_STAT_CATEGORIES,
  type SecondaryStatCategory,
} from "@terra/shared/secondaryStatsSim";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { ScopeTarget } from "../../scope/ScopeBar.tsx";
import { AppLink } from "../../shell/AppLink.tsx";
import { BackButton } from "../../shell/BackButton.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { SecondaryStatEditCard } from "./SecondaryStatEditCard.tsx";
import { SecondaryStatsCharts } from "./SecondaryStatsCharts.tsx";
import { archetypeText, categoryText, primaryCode, saveErrorText } from "./secondaryStatsMessages.ts";
import {
  EMPTY_DRAFTS,
  LEGACY_INACTIVE_ROWS,
  type SecondaryDraftState,
  type SimulationConfig,
  type TargetEntry,
  buildSavePayload,
  buildTargetCatalog,
  computeChartBundle,
  extractErrorKey,
  hasTargetChanges,
  revertTargetDrafts,
} from "./secondaryStatsModel.ts";
import "./secondaryStats.css";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | {
      readonly status: "ready";
      readonly table: BalanceTableResponse;
      readonly formulas: FormulaListResponse;
    };

export interface SecondaryStatsEditorScreenProps {
  readonly initialTarget?: string | undefined;
}

export default function SecondaryStatsEditorScreen({ initialTarget }: SecondaryStatsEditorScreenProps) {
  const locale = getLocale();
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const titleId = useId();
  const searchId = useId();
  const noteId = useId();

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selectedKey, setSelectedKey] = useState<string>(initialTarget ?? "hp");
  const [query, setQuery] = useState("");
  const [showLegacy, setShowLegacy] = useState(false);
  const [drafts, setDrafts] = useState<SecondaryDraftState>(EMPTY_DRAFTS);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ readonly kind: "ok" | "err"; readonly text: string } | null>(
    null,
  );

  const [config, setConfig] = useState<SimulationConfig>({
    archetype: "physical",
    customWeights: { ...SECONDARY_ARCHETYPE_WEIGHTS.physical },
    showCustomInCurves: false,
    initialSum: 60,
    maxLevel: 60,
    focusLevel: 30,
    growthPm: 100,
    kPm: 1000,
    showBaseline: true,
    weaponId: "natural_human",
  });

  const applyLoaded = useCallback(
    (
      table: Awaited<ReturnType<typeof api.balance.table.query>>,
      formulas: Awaited<ReturnType<typeof api.formulas.list.query>>,
    ) => {
      setLoad({ status: "ready", table, formulas });
      setConfig((prev) => ({
        ...prev,
        growthPm: formulas.growth?.growthPm ?? prev.growthPm,
        maxLevel: Math.max(prev.maxLevel, formulas.growth?.maxLevel ?? 60),
        weaponId: formulas.weapons.some((w) => w.id === prev.weaponId)
          ? prev.weaponId
          : (formulas.weapons.find((w) => w.unarmed)?.id ?? formulas.weapons[0]?.id ?? prev.weaponId),
      }));
    },
    [],
  );

  const handleLoadError = useCallback((error: unknown) => {
    const key = extractErrorKey(error);
    if (key === "unauthorized") void refreshSession();
    setLoad({ status: "failed", message: saveErrorText(key) });
  }, []);

  const reload = useCallback(async () => {
    try {
      const [table, formulas] = await Promise.all([api.balance.table.query(), api.formulas.list.query()]);
      applyLoaded(table, formulas);
    } catch (error: unknown) {
      handleLoadError(error);
    }
  }, [applyLoaded, handleLoadError]);

  useEffect(() => {
    let active = true;
    Promise.all([api.balance.table.query(), api.formulas.list.query()]).then(
      ([table, formulas]) => {
        if (active) applyLoaded(table, formulas);
      },
      (error: unknown) => {
        if (active) handleLoadError(error);
      },
    );
    return () => {
      active = false;
    };
  }, [applyLoaded, handleLoadError]);

  const catalog = useMemo(() => {
    if (load.status !== "ready") return [];
    return buildTargetCatalog(load.table, load.formulas);
  }, [load]);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return catalog;
    return catalog.filter(
      (entry) =>
        entry.key.toLowerCase().includes(q) ||
        entry.name.ko.toLowerCase().includes(q) ||
        entry.name.en.toLowerCase().includes(q),
    );
  }, [catalog, query]);

  const groupedCatalog = useMemo(() => {
    const map = new Map<SecondaryStatCategory, TargetEntry[]>();
    for (const cat of SECONDARY_STAT_CATEGORIES) map.set(cat, []);
    for (const entry of filteredCatalog) map.get(entry.category)?.push(entry);
    return SECONDARY_STAT_CATEGORIES.map((cat) => ({
      category: cat,
      entries: map.get(cat) ?? [],
    })).filter((g) => g.entries.length > 0);
  }, [filteredCatalog]);

  const activeTarget = useMemo(() => {
    return catalog.find((entry) => entry.key === selectedKey) ?? catalog[0] ?? null;
  }, [catalog, selectedKey]);

  const chartBundle = useMemo(() => {
    if (load.status !== "ready" || !activeTarget) return null;
    return computeChartBundle(activeTarget, load.table, load.formulas, drafts, config);
  }, [load, activeTarget, drafts, config]);

  const payload = useMemo(() => buildSavePayload(drafts), [drafts]);

  const onCellChange = (key: string, value: number | null) => {
    setFeedback(null);
    setDrafts((prev) => {
      const nextCells = new Map(prev.cellDrafts);
      if (value === null) nextCells.delete(key);
      else nextCells.set(key, value);
      return { ...prev, cellDrafts: nextCells };
    });
  };

  const onFormulaChange = (key: string, source: string | null) => {
    setFeedback(null);
    setDrafts((prev) => {
      const nextFormulas = new Map(prev.formulaDrafts);
      if (load.status === "ready") {
        const slot = load.formulas.slots.find((s) => s.key === key);
        const unchanged =
          (source === null && slot?.override === null) ||
          (source !== null && slot?.source === source && slot?.override !== null);
        if (unchanged) nextFormulas.delete(key);
        else nextFormulas.set(key, source);
      } else if (source === null) {
        nextFormulas.delete(key);
      } else {
        nextFormulas.set(key, source);
      }
      return { ...prev, formulaDrafts: nextFormulas };
    });
  };

  const onApply = async () => {
    if (load.status !== "ready" || busy || payload.totalCount === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const expectedRevision = Math.max(load.table.revision, load.formulas.revision);
      const saved = await api.tuning.save.mutate({
        expectedRevision,
        changes: payload.changes,
        formulas: payload.formulas,
        note: note.trim() === "" ? null : note.trim(),
      });
      setDrafts(EMPTY_DRAFTS);
      setNote("");
      setFeedback({
        kind: "ok",
        text: m.dev_sec_applied({ count: payload.totalCount, revision: saved.revision }),
      });
      await reload();
    } catch (error: unknown) {
      const key = extractErrorKey(error);
      if (key === "unauthorized") void refreshSession();
      setFeedback({ kind: "err", text: saveErrorText(key) });
      if (key === "revision_conflict") await reload();
    } finally {
      setBusy(false);
    }
  };

  const onExportDiff = async () => {
    try {
      const res = await api.tuning.export.query();
      const blob = new Blob([JSON.stringify(res.diff, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      setFeedback({ kind: "err", text: saveErrorText(extractErrorKey(error)) });
    }
  };

  const patchConfig = (patch: Partial<SimulationConfig>) => setConfig((prev) => ({ ...prev, ...patch }));

  const updateCustomWeight = (stat: keyof BalancePrimaries, raw: number) =>
    setConfig((prev) => ({
      ...prev,
      customWeights: { ...prev.customWeights, [stat]: Math.max(0, Math.min(100, Math.trunc(raw))) },
    }));

  return (
    <section
      className="screen screen-wide sec-screen"
      aria-labelledby={titleId}
      data-density="compact"
      data-status={load.status}
    >
      <header className="screen-header sec-header">
        <div className="sec-header-main">
          <h1 id={titleId} className="screen-title" tabIndex={-1} ref={headingRef}>
            {m.shell_route_dev_secondary_stats()}
          </h1>
          <div className="sec-header-links">
            <AppLink className="button-small" to={{ route: "dev_balance" }}>
              {m.dev_sec_to_balance()}
            </AppLink>
            <button type="button" className="button-small" onClick={() => void onExportDiff()}>
              {m.dev_sec_export_diff()}
            </button>
            <BackButton />
          </div>
        </div>
        <p className="lead sec-lead">{m.dev_sec_lead()}</p>
      </header>

      {feedback ? (
        <p
          className={feedback.kind === "err" ? "field-error sec-banner" : "sec-banner sec-banner-ok"}
          role="status"
        >
          {feedback.text}
        </p>
      ) : null}

      {load.status === "loading" ? <p className="field-hint">{m.dev_sec_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="sec-failed">
          <p className="field-error" role="alert">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.dev_sec_retry()}
          </button>
        </div>
      ) : null}

      {load.status === "ready" && activeTarget && chartBundle ? (
        <div className="sec-layout">
          <aside className="sec-sidebar" aria-label={m.shell_route_dev_secondary_stats()}>
            <label htmlFor={searchId} className="visually-hidden">
              {m.dev_sec_search_placeholder()}
            </label>
            <input
              id={searchId}
              type="search"
              className="input sec-search"
              placeholder={m.dev_sec_search_placeholder()}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="field-hint sec-exclude-note">{m.dev_sec_walk_speed_excluded()}</p>

            <div className="sec-groups">
              {groupedCatalog.map((group) => (
                <section key={group.category} className="sec-group">
                  <h2 className="sec-group-title">{categoryText(group.category)}</h2>
                  <ul className="sec-target-list">
                    {group.entries.map((entry) => {
                      const active = entry.key === activeTarget.key;
                      const staged = hasTargetChanges(entry, drafts);
                      const overriden =
                        entry.kind === "combat"
                          ? entry.slot.override !== null
                          : entry.row.formula === "world" || entry.row.cells.some((c) => c.override !== null);
                      return (
                        <li key={entry.key}>
                          <button
                            type="button"
                            className="sec-target-btn"
                            data-target={entry.key}
                            aria-current={active ? "true" : undefined}
                            onClick={() => setSelectedKey(entry.key)}
                          >
                            <span className="sec-target-name">
                              {locale === "en" ? entry.name.en : entry.name.ko}
                            </span>
                            <span className="sec-target-marks">
                              <code className="sec-target-id">
                                {entry.kind === "combat" ? entry.formulaId : entry.key}
                              </code>
                              {staged ? (
                                <span className="sec-dot sec-dot-staged" aria-label="staged" />
                              ) : overriden ? (
                                <span className="sec-dot sec-dot-override" aria-label="override" />
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="sec-legacy-box">
              <label className="sec-checkbox">
                <input
                  type="checkbox"
                  checked={showLegacy}
                  onChange={(event) => setShowLegacy(event.target.checked)}
                />
                <span>{m.dev_sec_show_inactive()}</span>
              </label>
              {showLegacy ? (
                <ul className="sec-legacy-list">
                  {LEGACY_INACTIVE_ROWS.map((item) => (
                    <li key={item.id}>
                      <code>{item.id}</code> → <code>{item.replacedBy}</code> ({m.dev_sec_inactive_badge()})
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </aside>

          <div className="sec-main">
            <section className="sec-sim-bar" aria-label={m.dev_sec_sim_controls_title()}>
              <div className="sec-sim-row">
                <div className="sec-sim-block">
                  <span className="sec-sim-label">{m.dev_sec_initial_sum_label()}</span>
                  <div className="sec-sum-presets" role="group" aria-label={m.dev_sec_initial_sum_label()}>
                    {SECONDARY_INITIAL_SUM_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="sec-sum-btn"
                        aria-pressed={config.initialSum === preset}
                        onClick={() => patchConfig({ initialSum: preset })}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <div className="sec-range-inline">
                    <input
                      type="range"
                      min={SECONDARY_INITIAL_SUM_MIN}
                      max={SECONDARY_INITIAL_SUM_MAX}
                      value={config.initialSum}
                      aria-label={m.dev_sec_initial_sum_label()}
                      onChange={(event) => patchConfig({ initialSum: Number(event.target.value) })}
                    />
                    <input
                      type="number"
                      className="input sec-num-sm"
                      min={SECONDARY_INITIAL_SUM_MIN}
                      max={SECONDARY_INITIAL_SUM_MAX}
                      value={config.initialSum}
                      aria-label={m.dev_sec_initial_sum_label()}
                      onChange={(event) => {
                        const n = Math.trunc(Number(event.target.value));
                        if (Number.isFinite(n)) {
                          patchConfig({
                            initialSum: Math.max(
                              SECONDARY_INITIAL_SUM_MIN,
                              Math.min(SECONDARY_INITIAL_SUM_MAX, n),
                            ),
                          });
                        }
                      }}
                    />
                  </div>
                  <span className="field-hint">{m.dev_sec_initial_sum_hint()}</span>
                </div>

                <div className="sec-sim-block">
                  <span className="sec-sim-label">{m.dev_sec_chart_kband_arch()}</span>
                  <div className="sec-arch-pills" role="group" aria-label={m.dev_sec_chart_kband_arch()}>
                    {([...SECONDARY_ARCHETYPE_IDS, "custom"] as const).map((arch) => (
                      <button
                        key={arch}
                        type="button"
                        className="sec-arch-btn"
                        aria-pressed={config.archetype === arch}
                        onClick={() => patchConfig({ archetype: arch })}
                      >
                        {archetypeText(arch)}
                      </button>
                    ))}
                  </div>
                  <label className="sec-checkbox">
                    <input
                      type="checkbox"
                      checked={config.showCustomInCurves}
                      onChange={(event) => patchConfig({ showCustomInCurves: event.target.checked })}
                    />
                    <span>{m.dev_sec_custom_show()}</span>
                  </label>
                </div>
              </div>

              {config.archetype === "custom" || config.showCustomInCurves ? (
                <div className="sec-custom-weights">
                  <span className="sec-sim-label">{m.dev_sec_custom_weights_label()}</span>
                  <div className="sec-custom-grid">
                    {PRIMARY_STATS.map((stat) => (
                      <label key={stat} className="sec-custom-item">
                        <span>{primaryCode(stat)}</span>
                        <input
                          type="number"
                          className="input sec-num-sm"
                          min={0}
                          max={100}
                          value={config.customWeights[stat]}
                          onChange={(event) => updateCustomWeight(stat, Number(event.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="sec-sim-params">
                <label className="sec-param-field">
                  <span>
                    {m.dev_sec_focus_level_label()}: Lv.{config.focusLevel}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={config.maxLevel}
                    value={config.focusLevel}
                    onChange={(event) => patchConfig({ focusLevel: Number(event.target.value) })}
                  />
                </label>
                <label className="sec-param-field">
                  <span>{m.dev_sec_level_range_label()}</span>
                  <input
                    type="number"
                    className="input sec-num-sm"
                    min={10}
                    max={100}
                    value={config.maxLevel}
                    onChange={(event) => {
                      const v = Math.max(10, Math.min(100, Math.trunc(Number(event.target.value) || 60)));
                      setConfig((prev) => ({
                        ...prev,
                        maxLevel: v,
                        focusLevel: Math.min(prev.focusLevel, v),
                      }));
                    }}
                  />
                </label>
                <label className="sec-param-field">
                  <span>{m.dev_sec_growth_label()}</span>
                  <input
                    type="number"
                    className="input sec-num-sm"
                    min={0}
                    max={1000}
                    value={config.growthPm}
                    onChange={(event) =>
                      patchConfig({
                        growthPm: Math.max(0, Math.min(1000, Math.trunc(Number(event.target.value) || 0))),
                      })
                    }
                  />
                </label>
                <label className="sec-param-field">
                  <span>{m.dev_sec_k_label()}</span>
                  <input
                    type="number"
                    className="input sec-num-sm"
                    min={100}
                    max={3000}
                    step={50}
                    value={config.kPm}
                    onChange={(event) =>
                      patchConfig({
                        kPm: Math.max(100, Math.min(3000, Math.trunc(Number(event.target.value) || 1000))),
                      })
                    }
                  />
                </label>
                <label className="sec-param-field">
                  <span>{m.dev_sec_weapon_label()}</span>
                  <select
                    className="input sec-select"
                    value={config.weaponId}
                    onChange={(event) => patchConfig({ weaponId: event.target.value })}
                  >
                    {load.formulas.weapons.map((w) => (
                      <option key={w.id} value={w.id}>
                        {locale === "en" ? w.name.en : w.name.ko}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sec-checkbox">
                  <input
                    type="checkbox"
                    checked={config.showBaseline}
                    onChange={(event) => patchConfig({ showBaseline: event.target.checked })}
                  />
                  <span>{m.dev_sec_overlay_baseline()}</span>
                </label>
              </div>
            </section>

            <SecondaryStatEditCard
              target={activeTarget}
              drafts={drafts}
              locale={locale}
              onCellChange={onCellChange}
              onFormulaChange={onFormulaChange}
              onRevertTarget={() => setDrafts((prev) => revertTargetDrafts(activeTarget, prev))}
            />

            <SecondaryStatsCharts
              target={activeTarget}
              bundle={chartBundle}
              rows={load.table.rows}
              kMinPm={load.formulas.growth?.kMinPm ?? 800}
              kMaxPm={load.formulas.growth?.kMaxPm ?? 1200}
              config={config}
              locale={locale}
              onSelectStat={(rowId) => setSelectedKey(rowId)}
            />
          </div>
        </div>
      ) : null}

      {payload.totalCount > 0 ? (
        <footer
          className="sec-pending-bar"
          role="region"
          aria-label={m.dev_sec_pending_count({ count: payload.totalCount })}
        >
          <strong className="sec-pending-count">
            {m.dev_sec_pending_count({ count: payload.totalCount })}
          </strong>
          <ScopeTarget />
          <label className="visually-hidden" htmlFor={noteId}>
            {m.dev_sec_pending_note()}
          </label>
          <input
            id={noteId}
            className="input sec-note-input"
            maxLength={200}
            placeholder={m.dev_sec_pending_note()}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="sec-pending-actions">
            <button type="button" onClick={() => setDrafts(EMPTY_DRAFTS)}>
              {m.dev_sec_discard_all()}
            </button>
            <button type="button" className="button-primary" disabled={busy} onClick={() => void onApply()}>
              {m.dev_sec_apply()}
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
