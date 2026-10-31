// 행성 하나의 편집 화면 — 지구본 + 판(설정·면적·칸·초안 탭). ADR 38 2~13절
// 흐름: 세션(꺼짐 감지·서버 초안·미리보기) → 초안을 읽으면 미리보기를 연다(공개본 F5 → 초안 F7 → 공개본 F7)
// → 설정 판의 변경은 적용 전 변경으로 모으고, [적용]을 누를 때 초안 동기화(edit, 2초 뒤 자동 저장)와 미리보기(빠른 F5 → 미니맵,
//   본 레벨 → 지구본)에 같이 알린다(사용자 의견 2026-10-31: 슬라이더를 움직일 때마다 다시 만들지 않는다).
// 밖에서 초안이 바뀌면(되돌리기·가져오기·그쪽 불러오기·지우기) 본 레벨로 다시 만든다(lastSent로 내 편집과 가른다).
// - 휴대폰 세로: 지구본 + 아래 판, 가로·넓은 화면: 옆 판(폭 경계 37.5em, planetEditor.css). 판은 탭 넷이고 모두 그려 둔다(숨김).
// - 평면 미니맵: 넓고 높은 화면(37.5em 이상 × 높이 40em 이상)은 지구본 아래에 늘 보인다. 그 밖(휴대폰)은 지구본 자리 위
//   [지구본·평면] 단추로 바꿔 본다(사용자 의견 2026-10-31 "한번에 보기 힘듬").
// - 열 때 확인(editorView deviceCheck): 생성기 판이 다르거나 공개본 F5 해시가 서버와 다르면 알리고 내보내기를 막는다.
// - 저장하지 않은 변경이 있으면 [뒤로]에서 묻고, 창을 닫을 때(beforeunload) 브라우저가 묻게 한다.
import { GENERATOR_VERSION } from "@terra/planet/generator";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { m } from "../../paraglide/messages.js";
import { forceUpdate } from "../../pwa/updates.ts";
import { AreaPanel, type ShownRole } from "./AreaPanel.tsx";
import { CellPanel, reportAt } from "./CellPanel.tsx";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog.tsx";
import { DraftPanel } from "./DraftPanel.tsx";
import { EditorGlobe } from "./EditorGlobe.tsx";
import { FlatMap } from "./FlatMap.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { buildDraftExport, draftExportFileName, serializeDraftExport } from "./draftExport.ts";
import type { DraftImport } from "./draftExport.ts";
import { formatBytes, formatNumber, previewErrorText, saveStatusText } from "./editorMessages.ts";
import { type DraftDocument, type DraftEntry, pendingChangeCount } from "./editorModel.ts";
import {
  CONFIRM_PREVIEW_LEVEL,
  type ServerCheck,
  areaRows,
  comparableBaseSummary,
  deviceCheck,
  exportBlock,
  globeEntry,
  isCurrentEntry,
  latestEntry,
  roleError,
} from "./editorView.ts";
import type { LatLon } from "./flatMapRender.ts";
import { memoryEstimate } from "./memoryEstimate.ts";
import { HEAVY_PREVIEW_LEVEL } from "./previewJobs.ts";
import type { PreviewStage } from "./previewProtocol.ts";
import { biomeColoursOf } from "./previewTiles.ts";
import type { PreviewDefinition, PreviewSnapshot } from "./previewTypes.ts";
import { type EditorSession, useEditorSession, useStore } from "./useEditorSession.ts";

/** 정의 조회의 행성 하나에서 쓰는 것 */
export interface EditorPlanet {
  readonly id: string;
  readonly entry: DraftEntry;
  readonly definitionHash: string;
  readonly check: { readonly faceLevel: number; readonly hash: string };
}

export interface EditorDefinitions {
  readonly contentVersion: string;
  readonly generatorVersion: number;
  readonly planets: readonly EditorPlanet[];
  readonly biomes: readonly unknown[];
}

interface WorkspaceProps {
  readonly planet: EditorPlanet;
  readonly definitions: EditorDefinitions;
  readonly onClose: () => void;
  /** 머리 줄 앞쪽(제목·행성 고르기) */
  readonly heading: ReactNode;
}

type TabId = "settings" | "area" | "cell" | "draft";
const TABS: readonly { id: TabId; label: () => string }[] = [
  { id: "settings", label: m.planet_editor_tab_settings },
  { id: "area", label: m.planet_editor_tab_area },
  { id: "cell", label: m.planet_editor_tab_cell },
  { id: "draft", label: m.planet_editor_tab_draft },
];

/** 일 단계 차례(진행 칩의 n/전체) */
const STAGES: readonly PreviewStage[] = [
  "grid",
  "tectonics",
  "seaLevel",
  "flowDirections",
  "climate",
  "erosion",
  "hydrology",
  "surface",
  "hash",
  "summary",
  "levels",
];

/** 지금 도는 일 한 줄(본 줄 먼저). 없으면 null */
function runningText(snapshot: PreviewSnapshot): string | null {
  const running = snapshot.lanes.final.running ?? snapshot.lanes.quick.running;
  if (!running) return null;
  const step = running.stage === null ? 0 : STAGES.indexOf(running.stage) + 1;
  return m.planet_editor_job_running({
    level: String(running.level),
    role: running.role === "draft" ? m.planet_editor_role_draft() : m.planet_editor_role_base(),
    step: String(step),
    total: String(STAGES.length),
  });
}

function definitionOf(entry: DraftEntry, biomes: readonly unknown[]): PreviewDefinition {
  return { entry, biomes };
}

export function EditorWorkspace({ planet, definitions, onClose, heading }: WorkspaceProps) {
  const { biomes } = definitions;
  const fallback = useMemo<DraftDocument>(
    () => ({
      entry: planet.entry,
      base: {
        contentVersion: definitions.contentVersion,
        definitionHash: planet.definitionHash,
        generatorVersion: definitions.generatorVersion,
      },
    }),
    [planet, definitions.contentVersion, definitions.generatorVersion],
  );
  const session = useEditorSession(planet.id, fallback);
  return session ? (
    <Workspace
      session={session}
      planet={planet}
      definitions={definitions}
      biomes={biomes}
      onClose={onClose}
      heading={heading}
    />
  ) : (
    <Frame heading={heading} onBack={onClose} saveLine={null}>
      <p className="status pe-loading" role="status">
        {m.planet_editor_loading()}
      </p>
    </Frame>
  );
}

/** 머리 줄 + 본문 틀(세션 전에도 같은 모양) */
function Frame({
  heading,
  onBack,
  saveLine,
  children,
}: {
  heading: ReactNode;
  onBack: () => void;
  saveLine: { text: string; status: string } | null;
  children: ReactNode;
}) {
  return (
    <>
      <header className="pe-header">
        <button type="button" className="button-small pe-back" onClick={onBack}>
          {m.planet_editor_back()}
        </button>
        {heading}
        {saveLine ? (
          <span className="pe-chip pe-save-chip" data-save-status={saveLine.status}>
            {saveLine.text}
          </span>
        ) : null}
      </header>
      {children}
    </>
  );
}

function Workspace({
  session,
  planet,
  definitions,
  biomes,
  onClose,
  heading,
}: WorkspaceProps & { session: EditorSession; biomes: readonly unknown[] }) {
  const { sync, preview, sentinel } = session;
  const previewSnap = useStore(preview);
  const syncSnap = useStore(sync);
  const tabsId = useId();
  const [tab, setTab] = useState<TabId>("settings");
  const [shown, setShown] = useState<ShownRole>("draft");
  const [picked, setPicked] = useState<LatLon | null>(null);
  const [focus, setFocus] = useState<LatLon | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [deviceCap, setDeviceCap] = useState<number | null>(() => sentinel.maxLevel());
  /** 적용 전 변경(설정 판). base = 그때 적용돼 있던 초안: 밖에서 초안이 바뀌면(되돌리기·가져오기) 낡은 것으로 보고 버린다 */
  const [pending, setPending] = useState<{ base: DraftEntry; entry: DraftEntry } | null>(null);
  /** 휴대폰(좁거나 낮은 화면)의 지구본 자리 보기: 지구본 또는 평면 미니맵. 넓은 화면은 둘 다 늘 보인다(CSS) */
  const [stageView, setStageView] = useState<"globe" | "flat">("globe");
  const openedRef = useRef(false);
  /** 미리보기에 마지막으로 보낸 초안 항목(내 편집) — 밖에서 바뀐 초안과 가른다 */
  const lastSentRef = useRef<DraftEntry | null>(null);
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

  const baseEntry = planet.entry;
  const baseDef = useMemo(() => definitionOf(baseEntry, biomes), [baseEntry, biomes]);
  const biomeColors = useMemo(() => biomeColoursOf(baseEntry, biomes), [baseEntry, biomes]);
  const draftDoc = syncSnap?.document ?? null;
  const draftEntry = draftDoc?.entry ?? null;
  const faceLevel = typeof baseEntry.faceLevel === "number" ? baseEntry.faceLevel : 0;
  const activePending = pending !== null && pending.base === draftEntry ? pending.entry : null;
  const pendingCount = activePending && draftEntry ? pendingChangeCount(draftEntry, activePending) : 0;

  // 초안을 읽으면 미리보기를 연다(한 번). 그 뒤 밖에서 바뀐 초안은 본 레벨로 다시 만든다
  useEffect(() => {
    if (!draftEntry) return;
    if (!openedRef.current) {
      openedRef.current = true;
      lastSentRef.current = draftEntry;
      preview.open(baseDef, definitionOf(draftEntry, biomes));
      return;
    }
    if (draftEntry === lastSentRef.current) return;
    lastSentRef.current = draftEntry;
    preview.setDraft(definitionOf(draftEntry, biomes), "final");
  }, [draftEntry, preview, baseDef, biomes]);

  // 저장하지 않은 변경(적용 전 변경 포함)이 있으면 창을 닫을 때 브라우저가 묻는다
  const unsaved = (syncSnap?.unsaved ?? false) || pendingCount > 0;
  useEffect(() => {
    if (!unsaved) return () => undefined;
    const ask = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsaved]);

  /** 설정 판의 변경은 적용 전 변경에만 둔다(미리보기·자동 저장 없음) */
  const edit = useCallback(
    (next: DraftEntry) => {
      if (draftEntry) setPending({ base: draftEntry, entry: next });
    },
    [draftEntry],
  );
  /** [적용]: 초안 동기화(2초 뒤 자동 저장)와 미리보기(빠른 F5 → 미니맵, 본 레벨 → 지구본)에 같이 알린다 */
  const apply = useCallback(() => {
    const current = sync.getSnapshot().document;
    if (!activePending || !current || !sync.edit({ entry: activePending, base: current.base })) return;
    lastSentRef.current = activePending;
    const definition = definitionOf(activePending, biomes);
    preview.setDraft(definition, "quick");
    preview.setDraft(definition, "final");
    setPending(null);
  }, [activePending, sync, preview, biomes]);

  /** F9 이상은 확인 창 뒤에 한다(ADR 38 4절) */
  const confirmHeavy = (level: number, run: () => void): void => {
    if (level < CONFIRM_PREVIEW_LEVEL) {
      run();
      return;
    }
    const estimate = memoryEstimate(level);
    setConfirm({
      title: m.planet_editor_heavy_title({ level: String(level) }),
      body: [
        m.planet_editor_heavy_body({
          seconds: formatNumber(15),
          size: estimate ? formatBytes(estimate.workerPeakBytes) : "–",
        }),
      ],
      confirmLabel: m.planet_editor_heavy_confirm(),
      onConfirm: run,
    });
  };

  if (!previewSnap || !syncSnap) return null;
  const finalLevel = previewSnap.finalLevel;
  const shownRole = previewSnap[shown];
  const globe = globeEntry(shownRole);
  const mapEntry = latestEntry(shownRole);
  const draftSummaryEntry = globeEntry(previewSnap.draft);
  const summary = draftSummaryEntry?.result.summary ?? null;
  const baseSummary = summary ? comparableBaseSummary(previewSnap.base, summary.faceLevel) : null;
  const baseDeferred = previewSnap.base.final.status === "deferred";
  const serverCheck: ServerCheck = { generatorVersion: definitions.generatorVersion, check: planet.check };
  const check = deviceCheck(serverCheck, GENERATOR_VERSION, previewSnap.base.quick);
  const block = exportBlock(check, draftDoc !== null);
  const report = globe && picked ? reportAt(globe, picked) : null;
  const heavyRunning = (previewSnap.lanes.final.running?.level ?? 0) >= HEAVY_PREVIEW_LEVEL;
  const error = roleError(shownRole);
  const running = runningText(previewSnap);

  const requestBase = (): void => confirmHeavy(finalLevel, () => preview.requestBaseFinal());
  const show = (role: ShownRole): void => {
    setShown(role);
    if (role === "base" && baseDeferred) requestBase();
  };
  const pickFromGlobe = (point: LatLon): void => {
    setPicked(point);
    setTab("cell");
  };
  const pickFromMap = (point: LatLon): void => {
    setPicked(point);
    setFocus(point);
  };
  const back = (): void => {
    if (!sync.getSnapshot().unsaved && pendingCount === 0) {
      onClose();
      return;
    }
    setConfirm({
      title: m.planet_editor_leave_title(),
      body: [m.planet_editor_leave_body()],
      confirmLabel: m.planet_editor_leave_confirm(),
      cancelLabel: m.planet_editor_stay(),
      onConfirm: () => {
        void sync.flush();
        onClose();
      },
    });
  };
  const blockText = (() => {
    switch (block) {
      case "generator_mismatch":
        return m.planet_editor_generator_mismatch({
          device: String(GENERATOR_VERSION),
          server: String(definitions.generatorVersion),
        });
      case "mismatch":
        return m.planet_editor_check_mismatch();
      case "pending":
        return m.planet_editor_check_pending();
      case "failed":
        return m.planet_editor_check_failed();
      case "no_draft":
        return m.planet_editor_export_no_draft();
      default:
        return null;
    }
  })();
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: -index,
      End: TABS.length - 1 - index,
    };
    const step = keys[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (!next) return;
    setTab(next.id);
    tabRefs.current.get(next.id)?.focus();
  };
  const estimate = globe ? memoryEstimate(globe.level) : null;
  const mapLabel = `${m.planet_editor_flat_map_label()} · ${
    shown === "draft" ? m.planet_editor_role_draft() : m.planet_editor_role_base()
  }`;
  const doneText = globe
    ? m.planet_editor_job_done({
        level: String(globe.level),
        seconds: formatNumber(globe.elapsedMs / 1000, 1),
        size: formatBytes(globe.result.outputBytes),
      })
    : null;

  return (
    <Frame
      heading={heading}
      onBack={back}
      saveLine={{ text: saveStatusText(syncSnap), status: syncSnap.status }}
    >
      {check === "generator_mismatch" || check === "mismatch" ? (
        <div className="message message-error pe-banner" role="alert" data-check={check}>
          <div className="message-body">
            <p>{blockText}</p>
            {check === "generator_mismatch" ? (
              <button type="button" className="button-small" onClick={() => void forceUpdate("manual")}>
                {m.planet_editor_reload()}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="pe-body">
        <div className="pe-stage" data-view={stageView}>
          <div className="pe-globe-area">
            <EditorGlobe
              entry={globe}
              definitionFaceLevel={faceLevel}
              biomeColors={biomeColors}
              onPick={pickFromGlobe}
              focus={focus}
              stale={globe !== null && !isCurrentEntry(shownRole, globe)}
            />
            <div className="pe-statusbar">
              <span className="pe-chip pe-job-chip" data-running={running !== null}>
                {running ?? doneText ?? m.planet_editor_idle()}
              </span>
              {estimate ? (
                <span className="pe-chip">
                  {m.planet_editor_memory_estimate({ size: formatBytes(estimate.workerPeakBytes) })}
                </span>
              ) : null}
              <span className="pe-chip pe-check-chip" data-check={check}>
                {check === "match"
                  ? m.planet_editor_check_match({ level: String(planet.check.faceLevel) })
                  : check === "pending"
                    ? m.planet_editor_check_pending()
                    : (blockText ?? "")}
              </span>
              {!previewSnap.available || error ? (
                <span className="pe-chip pe-chip-error" role="alert">
                  {previewErrorText(previewSnap.available ? (error ?? "failed") : "unavailable")}
                </span>
              ) : null}
            </div>
          </div>
          <div className="pe-stage-map">
            <FlatMap
              fields={mapEntry?.result.fields ?? null}
              biomeColors={biomeColors}
              selected={picked}
              onPick={pickFromMap}
              label={mapLabel}
            />
          </div>
          <div className="pe-segment pe-view-toggle" role="group" aria-label={m.planet_editor_stage_view()}>
            {(["globe", "flat"] as const).map((view) => (
              <button
                key={view}
                type="button"
                className="button-small"
                data-view={view}
                aria-pressed={stageView === view}
                onClick={() => setStageView(view)}
              >
                {view === "globe" ? m.planet_editor_view_globe() : m.planet_editor_view_flat()}
              </button>
            ))}
          </div>
        </div>
        <div className="pe-panel">
          <div className="pe-tabs" role="tablist" aria-label={m.planet_editor_tabs_label()}>
            {TABS.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  if (element) tabRefs.current.set(item.id, element);
                  else tabRefs.current.delete(item.id);
                }}
                type="button"
                role="tab"
                id={`${tabsId}-${item.id}`}
                className="pe-tab"
                data-tab={item.id}
                aria-selected={tab === item.id}
                aria-controls={`${tabsId}-${item.id}-panel`}
                tabIndex={tab === item.id ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                {item.label()}
                {item.id === "settings" && pendingCount > 0 ? (
                  <span className="pe-tab-badge">{formatNumber(pendingCount)}</span>
                ) : null}
              </button>
            ))}
          </div>
          {TABS.map((item) => (
            <div
              key={item.id}
              id={`${tabsId}-${item.id}-panel`}
              className="pe-tabpanel"
              role="tabpanel"
              aria-labelledby={`${tabsId}-${item.id}`}
              data-tabpanel={item.id}
              hidden={tab !== item.id}
            >
              {item.id === "settings" ? (
                <SettingsPanel
                  entry={activePending ?? draftEntry}
                  faceLevel={faceLevel}
                  biomeCount={Array.isArray(baseEntry.biomes) ? baseEntry.biomes.length : 0}
                  levels={previewSnap.levels}
                  finalLevel={finalLevel}
                  heavyRunning={heavyRunning}
                  deviceCap={deviceCap}
                  tripped={session.tripped}
                  onEdit={edit}
                  pendingCount={pendingCount}
                  onApply={apply}
                  onDiscard={() => setPending(null)}
                  onFinalLevel={(level) => confirmHeavy(level, () => preview.setFinalLevel(level))}
                  onCancelRun={() => preview.cancelFinal()}
                  onAllowAgain={() => {
                    sentinel.allowAgain();
                    preview.setDeviceMaxLevel(null);
                    setDeviceCap(null);
                  }}
                />
              ) : null}
              {item.id === "area" ? (
                <AreaPanel
                  shown={shown}
                  onShow={show}
                  mapEntry={mapEntry}
                  biomeColors={biomeColors}
                  picked={picked}
                  onPick={pickFromMap}
                  summary={summary}
                  seaLevelRealM={draftSummaryEntry?.result.seaLevelRealM ?? null}
                  rows={summary ? areaRows(summary, baseSummary) : []}
                  biomeEntries={biomesInPlanetOrder(baseEntry, biomes)}
                  baseMissingLevel={summary && !baseSummary && baseDeferred ? finalLevel : null}
                  onMakeBase={requestBase}
                />
              ) : null}
              {item.id === "cell" ? (
                <CellPanel
                  report={report}
                  entry={globe}
                  role={shown}
                  stale={globe !== null && !isCurrentEntry(shownRole, globe)}
                  biomeEntries={biomes}
                  contentVersion={definitions.contentVersion}
                  definitionHash={planet.definitionHash}
                />
              ) : null}
              {item.id === "draft" ? (
                <DraftPanel
                  planetId={planet.id}
                  sync={syncSnap}
                  pack={{ planetIds: definitions.planets.map((known) => known.id), biomes }}
                  baseEntry={baseEntry}
                  deviceGeneratorVersion={GENERATOR_VERSION}
                  exportBlocked={blockText}
                  buildExport={() => {
                    const current = sync.getSnapshot().document;
                    if (!current) return null;
                    const exportedAt = new Date();
                    const bundle = buildDraftExport({
                      planet: current.entry,
                      base: current.base,
                      checks: preview.checks(definitionOf(current.entry, biomes)),
                      generatorVersion: GENERATOR_VERSION,
                      exportedAt,
                    });
                    return {
                      text: serializeDraftExport(bundle),
                      fileName: draftExportFileName(planet.id, exportedAt),
                    };
                  }}
                  loadRevisions={() => sync.revisions()}
                  onRestore={(revision) =>
                    setConfirm({
                      title: m.planet_editor_restore_title({ revision: String(revision) }),
                      body: [
                        m.planet_editor_restore_body(),
                        ...(sync.getSnapshot().unsaved ? [m.planet_editor_restore_unsaved()] : []),
                      ],
                      confirmLabel: m.planet_editor_restore(),
                      onConfirm: () => void sync.restore(revision),
                    })
                  }
                  onImport={(draft: DraftImport, warnings) =>
                    setConfirm({
                      title: m.planet_editor_import_title(),
                      body: [m.planet_editor_import_body(), ...warnings],
                      confirmLabel: m.planet_editor_import_confirm(),
                      onConfirm: () => {
                        const current = sync.getSnapshot().document;
                        const base = draft.base ?? current?.base ?? null;
                        if (sync.edit({ entry: draft.planet, base })) void sync.flush();
                      },
                    })
                  }
                  onRemove={() =>
                    setConfirm({
                      title: m.planet_editor_remove_title(),
                      body: [m.planet_editor_remove_body()],
                      confirmLabel: m.planet_editor_remove_confirm(),
                      danger: true,
                      onConfirm: () => void sync.remove(),
                    })
                  }
                  onLoadTheirs={() => void sync.loadTheirs()}
                  onOverwrite={() => void sync.overwrite()}
                  onRetry={() => sync.retryNow()}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </Frame>
  );
}

/** 행성 biomes 순서(= 결과 바이옴 번호)의 바이옴 항목들. 없는 ID는 그 ID만 든 자리 */
function biomesInPlanetOrder(entry: DraftEntry, biomes: readonly unknown[]): unknown[] {
  const refs: readonly unknown[] = Array.isArray(entry.biomes) ? entry.biomes : [];
  return refs.map((ref) => {
    const found = biomes.find(
      (biome) => typeof biome === "object" && biome !== null && Reflect.get(biome, "id") === ref,
    );
    return found ?? { id: ref };
  });
}
