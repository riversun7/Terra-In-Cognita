// 생산 편집기(/dev/production) — 사용자 요청 2026-11-11 "생산에디터 : 예전 에디터가 아직 더 낫다. 3가지만 적용하는게 아니라 낚시 채집 등 6가지
// 전부에 적용하며 각각의 스탯이 주력 보조로 골고루 쓰이게 해야한다", 기획 D-513(옛 생산 편집기 기준)·43 §4. docs/adr/2026-11-11-production-six.md.
// 옛 "Production Editor — 1차 생산 파라미터 편집"의 짜임: 묶음 탭 줄(필드채집 · 건물생산 · 2차가공 · 공용)과 탭마다의 수.
// - 필드채집(벌목장·광산·약초원)·건물생산(농장·목장·낚시터): 스탯 짝·방식·수확량·성공 확률·사다리·미리 보기(ProductionTypePanel).
// - 2차가공: 가공 시설과 레시피(읽기만). 공용: 확률 분포(옛 /dev/gather-tiers 화면 — 이 주소는 이 탭으로 열린다)·예상 확률(D-534)·스탯 매핑·전투 클래스(D-529)·개요.
// dev·admin, 틀 안, 촘촘(개발 화면 층). 서버는 건물 편집기와 같은 tRPC buildings.list·check·save·history다(시설 = put, 확률표 = put_gather_band,
// 전투 클래스 = put_combat_class). 고친 칸은 바로 담기고(실효 값과 같아지면 빠진다) 막대의 [적용]이 묶음 하나로 보낸다. 입력이 1초 멈추면 검사.
// 조각 이름 ProductionEditorScreen-*(미리 캐시 규칙 [Pp]roductionEditor). 건물 편집기 조각(editor/buildings/)은 가져오지 않는다.
import {
  BUILDING_EDITOR_REASONS,
  type BuildingEditorCheckResponse,
  type BuildingEditorGatherRules,
  type BuildingEditorHistoryRow,
  type BuildingEditorListResponse,
  type BuildingEditorReason,
} from "@terra/shared/buildingEditor";
import { materialOfFacility } from "@terra/shared/catchment";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { OLD_COMBAT_CLASS_RULE, statCoverage } from "@terra/shared/unitGuide";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { CheckLater } from "../content/contentEditorCheckLater.tsx";
import { ContentHistory } from "../content/contentEditorHistory.tsx";
import { EditorSummary, ExportPanel } from "../content/contentEditorLayout.tsx";
import { type ContentErrorInfo, contentErrorOf, stableJson } from "../content/contentEditorModel.ts";
import { leafDiff } from "../content/contentEditorPaths.ts";
import { PendingBar, type PendingEntry } from "../content/contentEditorPending.tsx";
import { useUndoShortcut, useUndoStack } from "../content/contentEditorUndo.ts";
import { bandRangeText } from "../gatherTiers/GatherBandPanel.tsx";
import { type GatherStage, stageBand, stageGatherDiscard } from "../gatherTiers/gatherTierModel.ts";
import { gatherErrorText } from "../gatherTiers/gatherTierText.ts";
import { ProductionClassPanel } from "./ProductionClassPanel.tsx";
import { ProductionExpectPanel } from "./ProductionExpectPanel.tsx";
import {
  ProductionMappingPanel,
  ProductionOverviewPanel,
  ProductionProcessPanel,
} from "./ProductionCommonPanels.tsx";
import { type ProductionTabGroup, ProductionTabs } from "./ProductionTabs.tsx";
import { ProductionTiersPanel } from "./ProductionTiersPanel.tsx";
import { ProductionTypePanel } from "./ProductionTypePanel.tsx";
import { COMMON_ICON, facilityIcon } from "./productionIcons.tsx";
import {
  EMPTY_PRODUCTION_STAGE,
  type ProductionStage,
  draftBands,
  editClass,
  editFacility,
  ladderOf,
  processRows,
  productionChangesOf,
  productionStageKeys,
  productionTypeRows,
  revertClass,
  revertFacility,
  tabOfKey,
  unstageClass,
  unstageFacility,
} from "./productionModel.ts";
import { issueText, statusOf } from "./productionText.ts";
import "./production.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: BuildingEditorListResponse }
  | { readonly status: "failed"; readonly message: string };

/** 옛 서버(손잡이 칸 없음)일 때의 값 = 팩 출발값(N32·N44·N9) */
const FALLBACK_RULES: BuildingEditorGatherRules = {
  progressDivisor: 20,
  yieldPerStatPm: 80,
  tierProgressBase: 30,
  tierProgressStep: 30,
  tickMs: 60_000,
  oreGrams: 20,
  defaultStat: 10,
};

export default function ProductionEditorScreen({ initialTab }: { initialTab?: string | undefined }) {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [stage, setStage] = useState<ProductionStage>(EMPTY_PRODUCTION_STAGE);
  const stageRef = useRef<ProductionStage>(EMPTY_PRODUCTION_STAGE);
  const [check, setCheck] = useState<{
    readonly key: string;
    readonly result: BuildingEditorCheckResponse | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly BuildingEditorHistoryRow[] | null>(null);
  const [tab, setTab] = useState<string | null>(initialTab ?? null);
  // 확률 분포 탭의 구간 조절 판에 올린 구간
  const [band, setBand] = useState<string | null>(null);
  // 확률 분포·예상 확률 탭이 보이는 띠 표(기획 D-540 1217 나 — undefined = 기본 표)
  const undoStack = useUndoStack<ProductionStage>();
  const notice = useLiveLines();
  const problem = useLiveLines();

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  /** 담은 변경을 바꾼다. editKey가 같은 고침이 1초 안에 이어지면(끌기·치기) 되돌리기 한 칸으로 묶는다 */
  const push = (next: ProductionStage, editKey?: string): void => {
    undoStack.record(stageRef.current, editKey);
    stageRef.current = next;
    setStage(next);
  };
  const pushGather = (update: (current: GatherStage) => GatherStage, editKey?: string): void =>
    push({ ...stageRef.current, gather: update(stageRef.current.gather) }, editKey);
  const undo = (): void => {
    const previous = undoStack.pop();
    if (previous === null) return;
    stageRef.current = previous;
    setStage(previous);
    notice.show([m.dev_input_undo_done()]);
  };
  useUndoShortcut(undo);

  const fail = (error: unknown): ContentErrorInfo<BuildingEditorReason> => {
    const info = contentErrorOf(error, BUILDING_EDITOR_REASONS);
    if (info.sessionEnded) void refreshSession();
    problem.show([gatherErrorText(info.key), ...info.details]);
    return info;
  };

  const reload = (): Promise<BuildingEditorListResponse | null> =>
    api.buildings.list.query().then(
      (list) => {
        setLoad({ status: "ready", list });
        return list;
      },
      (error: unknown) => {
        const info = contentErrorOf(error, BUILDING_EDITOR_REASONS);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: gatherErrorText(info.key) });
        return null;
      },
    );

  // 처음 한 번 목록을 받는다(받은 뒤 setLoad는 비동기 콜백 안이다)
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void api.buildings.list.query().then(
      (list) => setLoad({ status: "ready", list }),
      (error: unknown) => {
        const info = contentErrorOf(error, BUILDING_EDITOR_REASONS);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: gatherErrorText(info.key) });
      },
    );
  }, []);

  const list = load.status === "ready" ? load.list : null;
  const bands = list?.gatherBands ?? [];
  const classes = list?.combatClasses ?? [];
  const rules = list?.gatherRules ?? FALLBACK_RULES;
  const classRule = list?.classRule ?? OLD_COMBAT_CLASS_RULE;
  const levelBonus = list?.gatherLevelBonus ?? 0;
  // 탭 줄과 같은 차례: 필드채집 먼저, 그다음 건물생산(묶음 안은 팩 차례)
  const packOrder = productionTypeRows(list?.facilities ?? [], stage);
  const types = [
    ...packOrder.filter((row) => row.type.group === "field"),
    ...packOrder.filter((row) => row.type.group === "building"),
  ];
  const processes = processRows(list?.facilities ?? []);
  const shownBands = draftBands(bands, stage);
  // 표 하나(기획 D-552 "표 하나") — 낚시터(어류 시설)가 있으면 "예상 확률" 탭 물 종류 고르기(NPC 배후지, 기획 D-542 질문 1365 나)
  const fishShown = types.some((row) => materialOfFacility(row.type.facility) === "fish");
  const sleeping = (list?.sleeping ?? []).filter((row) => row.category === "gather_tiers");
  const coverage = statCoverage(types.map((row) => row.type));
  const keys = productionStageKeys(stage);
  const changes = productionChangesOf(stage);
  const stageJson = stableJson(changes);
  const checked = check && check.key === stageJson ? check.result : undefined;
  const status = statusOf(keys.length, checked);
  const canApply = keys.length > 0 && status.tone === "ok" && !busy;
  const issues = checked?.issues ?? [];

  // 고른 탭: 주소 값·누른 탭이 목록에 없으면 첫 생산 종류(없으면 개요)
  const typeIds = types.map((row) => row.type.facility);
  const processIds = processes.map((row) => row.entry.id);
  const active =
    tabOfKey(tab ?? undefined, typeIds, processIds) ??
    (typeIds[0] === undefined
      ? { kind: "overview" as const }
      : { kind: "type" as const, facility: typeIds[0] });
  const activeKey = active.kind === "type" || active.kind === "process" ? active.facility : active.kind;
  const openType = (facility: string): void => setTab(facility);

  const runCheck = (): void => {
    if (changes.length === 0) return;
    const key = stageJson;
    api.buildings.check.query({ changes: [...changes] }).then(
      (result) => setCheck({ key, result }),
      (error: unknown) => {
        if (contentErrorOf(error, BUILDING_EDITOR_REASONS).sessionEnded) void refreshSession();
        setCheck({ key, result: null });
      },
    );
  };

  const apply = async (): Promise<void> => {
    if (!list || busy) return;
    const batch = productionChangesOf(stageRef.current);
    if (batch.length === 0) return;
    setBusy(true);
    problem.clear();
    try {
      const next = await api.buildings.save.mutate({
        expectedRevision: list.revision,
        changes: batch,
        note: note.trim() === "" ? null : note,
      });
      setLoad({ status: "ready", list: next });
      stageRef.current = EMPTY_PRODUCTION_STAGE;
      setStage(EMPTY_PRODUCTION_STAGE);
      undoStack.clear();
      setNote("");
      setHistory(null);
      notice.show([m.dev_buildings_applied({ count: batch.length, revision: next.revision })]);
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict" || info.key === "entry_changed") {
        await reload();
        problem.show([gatherErrorText(info.key), m.dev_buildings_reloaded()]);
      }
    } finally {
      setBusy(false);
    }
  };

  // Ctrl/⌘+S 적용(입력 칸의 글자가 먼저 들도록 다음 그림에서), 담은 변경이 있으면 창 닫기 전에 묻는다
  const latest = useRef({ canApply, apply });
  useEffect(() => {
    latest.current = { canApply, apply };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "s" || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      event.preventDefault();
      requestAnimationFrame(() => {
        if (latest.current.canApply) void latest.current.apply();
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent): void => {
      if (keys.length > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [keys.length]);

  const rangeOf = (id: string): string => {
    const index = bands.findIndex((row) => row.entry.id === id);
    return index < 0 ? id : bandRangeText(bands, index);
  };
  const facilityName = (id: string): string =>
    list?.facilities.find((row) => row.entry.id === id)?.entry.name[locale] ?? id;
  const pendingEntries: PendingEntry[] = [
    ...[...stage.facilities].map(
      ([id, item]): PendingEntry => ({
        key: `facilities/${id}`,
        id,
        name: facilityName(id),
        kind: item.op === "put" ? "put" : "revert",
        fields: item.op === "put" ? leafDiff(item.base, item.entry).length : null,
        onOpen: () => setTab(id),
        onRemove: () => push(unstageFacility(stageRef.current, id)),
      }),
    ),
    ...[...stage.classes].map(
      ([id, item]): PendingEntry => ({
        key: `classes/${id}`,
        id,
        name: m.dev_prod_pending_class({
          name: classes.find((row) => row.entry.id === id)?.entry.name[locale] ?? id,
        }),
        kind: item.op === "put" ? "put" : "revert",
        fields: item.op === "put" ? leafDiff(item.base, item.entry).length : null,
        onOpen: () => setTab("classes"),
        onRemove: () => push(unstageClass(stageRef.current, id)),
      }),
    ),
    ...[...stage.gather.bands].map(
      ([id, item]): PendingEntry => ({
        key: id,
        id,
        name: m.dev_gather_pending_name({ range: rangeOf(id) }),
        kind: item.op === "put_gather_band" ? "put" : "revert",
        fields: item.op === "put_gather_band" ? leafDiff(item.base, item.entry).length : null,
        onOpen: () => {
          setTab("tiers");
          setBand(id);
        },
        onRemove: () => pushGather((current) => stageBand(current, id, null)),
      }),
    ),
    ...[...stage.gather.discard].map(
      (id): PendingEntry => ({
        key: `sleeping/${id}`,
        id,
        name: m.dev_gather_sleeping_title(),
        kind: "discard",
        onRemove: () => pushGather((current) => stageGatherDiscard(current, id, false)),
      }),
    ),
  ];

  const typeTab = (group: "field" | "building") =>
    types
      .filter((row) => row.type.group === group)
      .map((row) => ({
        key: row.type.facility,
        label: row.draft.name[locale],
        icon: facilityIcon(row.type.facility, "type"),
        count: ladderOf(list?.items ?? [], row.gather).reduce((sum, tier) => sum + tier.length, 0),
        staged: row.staged ? 1 : 0,
      }));
  const groups: ProductionTabGroup[] = [
    { id: "field", label: m.dev_prod_group_field(), tabs: typeTab("field") },
    { id: "building", label: m.dev_prod_group_building(), tabs: typeTab("building") },
    {
      id: "process",
      label: m.dev_prod_group_process(),
      tabs: processes.map((row) => ({
        key: row.entry.id,
        label: row.entry.name[locale],
        icon: facilityIcon(row.entry.id, "process"),
        count: row.recipes.length,
      })),
    },
    {
      id: "common",
      label: m.dev_prod_group_common(),
      tabs: [
        {
          key: "tiers",
          label: m.dev_prod_tab_tiers(),
          icon: COMMON_ICON.tiers,
          count: bands.length,
          staged: stage.gather.bands.size + stage.gather.discard.size,
        },
        // 예상 채집 확률표(D-534): 초기 합 × 레벨, 컨디션·시설 레벨 손잡이
        { key: "expect", label: m.dev_prod_tab_expect(), icon: COMMON_ICON.expect },
        { key: "mapping", label: m.dev_prod_tab_mapping(), icon: COMMON_ICON.mapping, count: types.length },
        {
          key: "classes",
          label: m.dev_prod_tab_classes(),
          icon: COMMON_ICON.classes,
          count: classes.length,
          staged: stage.classes.size,
        },
        { key: "overview", label: m.dev_prod_tab_overview(), icon: COMMON_ICON.overview },
      ],
    },
  ];

  const activeType =
    active.kind === "type" ? types.find((row) => row.type.facility === active.facility) : undefined;
  const activeProcess =
    active.kind === "process" ? processes.find((row) => row.entry.id === active.facility) : undefined;
  /** 이 시설의 스탯이 고르지 않게 쓰였으면 알림 글(없으면 null) */
  const unbalancedOf = (facility: string): string | null => {
    if (coverage.balanced) return null;
    const bad = coverage.rows.filter(
      (row) =>
        (row.primaryOf.includes(facility) && row.primaryOf.length !== 1) ||
        (row.secondaryOf.includes(facility) && row.secondaryOf.length !== 1),
    );
    return bad.length === 0 ? null : m.dev_prod_warn_coverage();
  };

  return (
    <section
      className="screen screen-wide ce-screen pd-screen gt-screen"
      aria-labelledby="production-title"
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
      data-tab={activeKey}
    >
      <div className="screen-header">
        <h1 id="production-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_production()}
          <span className="pd-title-sub"> — {m.dev_prod_subtitle()}</span>
        </h1>
        <BackButton />
      </div>
      <p className="lead">{m.dev_prod_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_prod_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="ce-inline-actions">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" onClick={() => void reload()}>
            {m.dev_buildings_retry()}
          </button>
        </div>
      ) : null}
      {list ? (
        <>
          <EditorSummary
            label={m.dev_prod_summary_label()}
            className="gt-summary pd-summary"
            chips={[
              { key: "pack", text: m.dev_buildings_pack({ version: list.contentVersion }) },
              { key: "revision", text: m.dev_buildings_revision({ revision: list.revision }) },
              { key: "types", text: m.dev_prod_chip_types({ count: types.length }), count: types.length },
              {
                key: "cover",
                text: coverage.balanced ? m.dev_prod_chip_cover_ok() : m.dev_prod_chip_cover_warn(),
                warn: !coverage.balanced,
              },
              { key: "bands", text: m.dev_gather_count({ count: bands.length }) },
            ]}
            tools={
              <span className="ce-inline-actions gt-tools">
                <AppLink to={{ route: "dev_buildings" }} className="button-small">
                  {m.dev_gather_open_buildings()}
                </AppLink>
                <AppLink to={{ route: "dev_tuning" }} className="button-small">
                  {m.dev_prod_open_tuning()}
                </AppLink>
                <button type="button" onClick={() => void api.tuning.export.query().then(setExported, fail)}>
                  {m.dev_buildings_export()}
                </button>
                <button
                  type="button"
                  aria-pressed={history !== null}
                  onClick={() => {
                    if (history) setHistory(null);
                    else void api.buildings.history.query().then((result) => setHistory(result.rows), fail);
                  }}
                >
                  {m.dev_buildings_history()}
                </button>
              </span>
            }
          />
          {exported ? (
            <ExportPanel exported={exported} textClass="gt-export-text" onClose={() => setExported(null)} />
          ) : null}
          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={m.dev_buildings_history()}
              className="ce-panel"
              headingId="pd-history-title"
            />
          ) : null}
          <ProductionTabs id="pd-tabs" groups={groups} selected={activeKey} onSelect={setTab} />
          <div className="ce-messages">
            <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
            <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          </div>
          {issues.length > 0 ? (
            <ul className="pd-issues" aria-label={m.dev_prod_issues_label()}>
              {issues.map((issue) => (
                <li
                  key={`${issue.file ?? ""}/${issue.id ?? ""}/${issue.path ?? ""}/${issue.code ?? ""}`}
                  data-level={issue.level}
                >
                  {issueText(issue)}
                </li>
              ))}
            </ul>
          ) : null}
          <div
            className="pd-panel"
            role="tabpanel"
            id="pd-tabs-panel"
            aria-labelledby={`pd-tabs-${activeKey}`}
          >
            {activeType ? (
              <ProductionTypePanel
                key={activeType.type.facility}
                row={activeType}
                items={list.items}
                subcategories={list.subcategories}
                bands={shownBands}
                rules={rules}
                levelBonus={levelBonus}
                locale={locale}
                unbalanced={unbalancedOf(activeType.type.facility)}
                onEdit={(entry) =>
                  push(
                    editFacility(stageRef.current, activeType.row, entry),
                    `facility:${activeType.type.facility}`,
                  )
                }
                onRevert={() => push(revertFacility(stageRef.current, activeType.row))}
                onUnstage={() => push(unstageFacility(stageRef.current, activeType.type.facility))}
              />
            ) : null}
            {activeProcess ? (
              <ProductionProcessPanel row={activeProcess} items={list.items} locale={locale} />
            ) : null}
            {active.kind === "tiers" ? (
              <ProductionTiersPanel
                bands={bands}
                stage={stage.gather}
                sleeping={sleeping}
                types={types}
                locale={locale}
                levelBonus={levelBonus}
                selected={band}
                onSelect={setBand}
                onStage={pushGather}
                onOpenType={openType}
                canUndo={undoStack.canUndo}
                onUndo={undo}
              />
            ) : null}
            {active.kind === "expect" ? (
              <ProductionExpectPanel
                bands={shownBands}
                rules={rules}
                fishTiers={fishShown ? rules.fishTiers : undefined}
              />
            ) : null}
            {active.kind === "mapping" ? (
              <ProductionMappingPanel
                rows={types}
                locale={locale}
                onEdit={(row, entry) =>
                  push(editFacility(stageRef.current, row.row, entry), `facility:${row.type.facility}`)
                }
                onOpen={openType}
              />
            ) : null}
            {active.kind === "classes" ? (
              <ProductionClassPanel
                classes={classes}
                rule={classRule}
                stage={stage}
                locale={locale}
                onEdit={(row, entry) =>
                  push(editClass(stageRef.current, row, entry), `class:${row.entry.id}`)
                }
                onRevert={(row) => push(revertClass(stageRef.current, row))}
                onUnstage={(id) => push(unstageClass(stageRef.current, id))}
              />
            ) : null}
            {active.kind === "overview" ? (
              <ProductionOverviewPanel
                rows={types}
                items={list.items}
                bands={shownBands}
                rules={rules}
                levelBonus={levelBonus}
                locale={locale}
                onOpen={openType}
              />
            ) : null}
          </div>
          {keys.length > 0 ? (
            <PendingBar
              label={m.dev_prod_stage_label()}
              entries={pendingEntries}
              status={status}
              note={note}
              onNote={setNote}
              busy={busy}
              canApply={canApply}
              onApply={() => void apply()}
              onDiscard={() => push(EMPTY_PRODUCTION_STAGE)}
              onCheck={runCheck}
              classes={{
                bar: "gt-stagebar pd-stagebar",
                note: "gt-note",
                apply: "gt-apply",
                discard: "gt-clear",
              }}
            />
          ) : null}
          {keys.length > 0 ? <CheckLater key={`check:${stageJson}`} delay={1000} run={runCheck} /> : null}
        </>
      ) : null}
    </section>
  );
}
