// 보관함 행성 하나의 편집 화면 — 지구본 + 판(설정·면적·칸·행성 탭). ADR 38 2~13절, "바뀜: 행성 보관함"
// 흐름: 미리보기 세션(꺼짐 감지·미리보기) + 보관함 문서(useLibraryDocument: 저장한 정의 + 이 기기의 작업 사본)
// → 미리보기를 연다(기준 팩 행성 F5 → 작업 사본 F7 → 기준 F7)
// → 슬라이더 변경은 적용 전 변경으로 모으고, [적용]이나 누르는 조작(프리셋·시드·[되돌리기])을 쓸 때 작업 사본을 바꾸고
//   미리보기(빠른 F5 → 미니맵, 본 레벨 → 지구본)를 다시 만든다. 서버에는 [저장]·[다른 이름으로 저장]만 쓴다(사용자 결정 2026-10-31).
// 밖에서 작업 사본이 바뀌면(저장 판 불러오기·가져오기) 본 레벨로 다시 만든다(lastSent로 내 편집과 가른다).
// - 휴대폰 세로: 지구본 + 아래 판, 가로·넓은 화면: 옆 판(폭 경계 37.5em, planetEditor.css). 판은 탭 넷이고 모두 그려 둔다(숨김).
// - 평면 미니맵: 넓고 높은 화면(37.5em 이상 × 높이 40em 이상)은 지구본 아래에 늘 보인다. 그 밖(휴대폰)은 지구본 자리 위
//   [지구본·평면] 단추로 바꿔 본다.
// - 열 때 확인(editorView deviceCheck): 생성기 판이 다르거나 기준 팩 행성 F5 해시가 서버와 다르면 알리고 내보내기를 막는다.
// - 저장하지 않은 변경(작업 사본·적용 전 변경)이 있으면 [뒤로]에서 묻고, 창을 닫을 때(beforeunload) 브라우저가 묻게 한다.
//   작업 사본은 이 기기에 남아 다시 열면 이어서 고친다.
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
import { useSession } from "../../auth/session.ts";
import { m } from "../../paraglide/messages.js";
import { forceUpdate } from "../../pwa/updates.ts";
import { AreaPanel, type ShownRole } from "./AreaPanel.tsx";
import { CellPanel, reportAt } from "./CellPanel.tsx";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog.tsx";
import { EditorGlobe } from "./EditorGlobe.tsx";
import { FlatMap } from "./FlatMap.tsx";
import { LibraryPanel } from "./LibraryPanel.tsx";
import { type PromptRequest, PromptDialog } from "./PromptDialog.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { buildDraftExport, draftExportFileName, serializeDraftExport } from "./draftExport.ts";
import type { DraftImport } from "./draftExport.ts";
import { docStatusText, formatBytes, formatNumber, localName, previewErrorText } from "./editorMessages.ts";
import { type DraftEntry, pendingChangeCount } from "./editorModel.ts";
import {
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
import { biomeColoursOf } from "./previewTiles.ts";
import { type EditorSession, useEditorSession, useStore } from "./useEditorSession.ts";
import { useSecondMapPreview } from "./useSecondMapPreview.tsx";
import {
  type LibraryDocActions,
  type LibraryDocDeps,
  type LibraryDocState,
  type OpenedPlanet,
  useLibraryDocument,
} from "./useLibraryDocument.ts";
import {
  type EditorDefinitions,
  type EditorPlanet,
  Frame,
  biomesInPlanetOrder,
  definitionOf,
  heavyConfirm,
  runningText,
} from "./workspaceParts.tsx";

export type { EditorDefinitions, EditorPlanet } from "./workspaceParts.tsx";
export { startPlanetOf } from "./workspaceParts.tsx";

interface WorkspaceProps {
  /** 연 행성(보관함 행성 또는 저장하지 않은 새 행성) */
  readonly opened: OpenedPlanet;
  /** 시작한 팩 행성(미리보기 기준·열 때 확인·바이옴 색) */
  readonly basePlanet: EditorPlanet;
  readonly definitions: EditorDefinitions;
  /** 보관함 호출·작업 사본·목록 갱신 */
  readonly library: LibraryDocDeps;
  /** [새 행성](이름·시작점을 묻는 창은 부모가 연다) */
  readonly onNewPlanet: () => void;
  readonly onClose: () => void;
  /** 머리 줄 앞쪽(제목·행성 고르기) */
  readonly heading: ReactNode;
}

type TabId = "settings" | "area" | "cell" | "planet";
const TABS: readonly { id: TabId; label: () => string }[] = [
  { id: "settings", label: m.planet_editor_tab_settings },
  { id: "area", label: m.planet_editor_tab_area },
  { id: "cell", label: m.planet_editor_tab_cell },
  { id: "planet", label: m.planet_editor_tab_planet },
];

export function EditorWorkspace(props: WorkspaceProps) {
  const session = useEditorSession();
  const [doc, actions] = useLibraryDocument(props.opened, props.library);
  return session ? (
    <Workspace {...props} session={session} doc={doc} actions={actions} />
  ) : (
    <Frame heading={props.heading} onBack={props.onClose} save={null}>
      <p className="status pe-loading" role="status">
        {m.planet_editor_loading()}
      </p>
    </Frame>
  );
}

function Workspace({
  session,
  doc,
  actions,
  basePlanet: planet,
  definitions,
  onNewPlanet,
  onClose,
  heading,
}: WorkspaceProps & { session: EditorSession; doc: LibraryDocState; actions: LibraryDocActions }) {
  const { preview, sentinel } = session;
  const { biomes } = definitions;
  const previewSnap = useStore(preview);
  const viewer = useSession();
  const [prompt, setPrompt] = useState<PromptRequest | null>(null);
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
  const draftEntry = doc.working;
  const faceLevel = typeof baseEntry.faceLevel === "number" ? baseEntry.faceLevel : 0;
  const activePending = pending !== null && pending.base === draftEntry ? pending.entry : null;
  const pendingCount = activePending && draftEntry ? pendingChangeCount(draftEntry, activePending) : 0;

  // 미리보기를 연다(한 번). 그 뒤 밖에서 바뀐 작업 사본은 본 레벨로 다시 만든다
  useEffect(() => {
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

  // 저장하지 않은 변경(작업 사본·적용 전 변경)이 있으면 창을 닫을 때 브라우저가 묻는다
  const unsaved = doc.dirty || pendingCount > 0;
  useEffect(() => {
    if (!unsaved) return () => undefined;
    const ask = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsaved]);

  /** 슬라이더 변경은 적용 전 변경에만 둔다(미리보기 없음) */
  const edit = useCallback((next: DraftEntry) => setPending({ base: draftEntry, entry: next }), [draftEntry]);
  /**
   * 바로 적용: 작업 사본(이 기기)을 바꾸고 미리보기(빠른 F5 → 미니맵, 본 레벨 → 지구본)를 다시 만들고 적용 전 변경을 비운다.
   * [적용]과 누르는 조작(프리셋·시드·[되돌리기])이 쓴다. 누르는 조작의 항목은 적용 전 슬라이더 변경을 이미 담고 있다
   */
  const { setWorking } = actions;
  const commitEntry = useCallback(
    (next: DraftEntry) => {
      setWorking(next);
      lastSentRef.current = next;
      const definition = definitionOf(next, biomes);
      preview.setDraft(definition, "quick");
      preview.setDraft(definition, "final");
      setPending(null);
    },
    [setWorking, preview, biomes],
  );
  const apply = (): void => {
    if (activePending) commitEntry(activePending);
  };

  /** F9 이상은 확인 창 뒤에 한다(ADR 38 4절, workspaceParts.tsx heavyConfirm) */
  const confirmHeavy = (level: number, run: () => void): void => {
    const request = heavyConfirm(level, run);
    if (request) setConfirm(request);
    else run();
  };

  // 칸 정보창 [2차맵 미리보기]: 보이는 쪽 정의의 진짜 면 레벨 칸(useSecondMapPreview.tsx)
  const secondMap = useSecondMapPreview({
    entry: shown === "base" ? baseEntry : draftEntry,
    biomes,
    picked,
    mapProps: definitions.mapProps,
    deviceCap,
    confirmHeavy,
  });

  if (!previewSnap) return null;
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
  const block = exportBlock(check, true);
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
    if (!unsaved) {
      onClose();
      return;
    }
    setConfirm({
      title: m.planet_editor_leave_title(),
      body: [m.planet_editor_leave_body()],
      confirmLabel: m.planet_editor_leave_confirm(),
      cancelLabel: m.planet_editor_stay(),
      onConfirm: onClose,
    });
  };
  const askName = (
    title: string,
    initialName: string,
    confirmLabel: string,
    run: (name: string) => void,
  ): void => setPrompt({ title, initialName, confirmLabel, onConfirm: (name) => run(name) });
  const saveAs = (): void =>
    askName(
      m.planet_editor_library_save_as(),
      m.planet_editor_library_copy_name({ name: doc.name }),
      m.planet_editor_library_save(),
      (name) => void actions.saveAs(name),
    );
  /** [저장]: 충돌이면 [덮어쓰기]·[다른 이름으로 저장]·[취소]를 묻는다 */
  const save = (): void => {
    void actions.save().then((outcome) => {
      if (outcome !== "conflict") return;
      setConfirm({
        title: m.planet_editor_conflict_title(),
        body: [m.planet_editor_conflict_body()],
        confirmLabel: m.planet_editor_conflict_overwrite(),
        extra: { label: m.planet_editor_library_save_as(), onClick: saveAs },
        onConfirm: () => void actions.overwrite(),
      });
    });
  };
  const viewerUser = viewer.kind === "signed_in" ? viewer.user : null;
  const canRemove =
    doc.saved === null ||
    (viewerUser !== null && (viewerUser.roles.includes("admin") || doc.saved.author?.id === viewerUser.id));
  const status = docStatusText(doc);
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
      save={{ ...status, canSave: (doc.dirty || doc.saved === null) && !doc.busy, onSave: save }}
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
              // 2차맵 미리보기 창이 열린 동안은 지구본 엔진을 내린다(렌더러 하나를 같이 쓴다)
              entry={secondMap.open ? null : globe}
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
          {/* 적용 줄: 슬라이더 목록 밖(지구본·미니맵 아래, 휴대폰은 아래 판 바로 위)에 한 줄로 둔다. 판을 가리지 않는다 */}
          {pendingCount > 0 ? (
            <div className="pe-apply-bar" data-pending={pendingCount}>
              <p className="pe-apply-count" role="status">
                {m.planet_editor_pending({ count: formatNumber(pendingCount) })}
              </p>
              <button type="button" className="button-small pe-discard" onClick={() => setPending(null)}>
                {m.planet_editor_cancel()}
              </button>
              <button type="button" className="button-small button-primary pe-apply" onClick={apply}>
                {m.planet_editor_apply()}
              </button>
            </div>
          ) : null}
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
                  onCommit={commitEntry}
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
                  secondMap={secondMap.opener}
                />
              ) : null}
              {item.id === "planet" ? (
                <LibraryPanel
                  doc={doc}
                  baseName={localName(planet.entry.name, planet.id)}
                  canRemove={canRemove}
                  loadVersions={actions.versions}
                  onLoadVersion={(revision) =>
                    setConfirm({
                      title: m.planet_editor_library_load_title({ revision: String(revision) }),
                      body: [m.planet_editor_library_load_body()],
                      confirmLabel: m.planet_editor_library_load_version(),
                      onConfirm: () => void actions.loadVersion(revision),
                    })
                  }
                  onSaveAs={saveAs}
                  onRename={() =>
                    askName(
                      m.planet_editor_library_rename(),
                      doc.name,
                      m.planet_editor_library_rename(),
                      (name) => void actions.rename(name),
                    )
                  }
                  onNewPlanet={onNewPlanet}
                  onRemove={() =>
                    setConfirm({
                      title: doc.saved
                        ? m.planet_editor_library_remove_title({ name: doc.name })
                        : m.planet_editor_library_discard_title(),
                      body: [
                        doc.saved
                          ? m.planet_editor_library_remove_body()
                          : m.planet_editor_library_discard_body(),
                      ],
                      confirmLabel: doc.saved
                        ? m.planet_editor_library_remove()
                        : m.planet_editor_library_discard_new(),
                      danger: true,
                      onConfirm: () => void actions.remove(),
                    })
                  }
                  transfer={{
                    planetId: planet.id,
                    // 가져오기 검사의 "알려진 행성 ID": 팩 행성 + 행성 표본(표본에서 시작한 행성의 정의 ID는 표본 ID다)
                    pack: {
                      planetIds: [...definitions.planets, ...definitions.templates].map((known) => known.id),
                      biomes,
                    },
                    baseEntry,
                    deviceGeneratorVersion: GENERATOR_VERSION,
                    exportBlocked: blockText,
                    buildExport: () => {
                      const exportedAt = new Date();
                      const bundle = buildDraftExport({
                        planet: doc.working,
                        base: {
                          contentVersion: definitions.contentVersion,
                          definitionHash: planet.definitionHash,
                          generatorVersion: definitions.generatorVersion,
                        },
                        checks: preview.checks(definitionOf(doc.working, biomes)),
                        generatorVersion: GENERATOR_VERSION,
                        exportedAt,
                        library: doc.saved
                          ? { id: doc.saved.id, name: doc.name, revision: doc.saved.revision }
                          : null,
                      });
                      return {
                        text: serializeDraftExport(bundle),
                        fileName: draftExportFileName(planet.id, exportedAt),
                      };
                    },
                    onImport: (draft: DraftImport, warnings) =>
                      setConfirm({
                        title: m.planet_editor_import_title(),
                        body: [m.planet_editor_import_body(), ...warnings],
                        confirmLabel: m.planet_editor_import_confirm(),
                        onConfirm: () => actions.setWorking(draft.planet),
                      }),
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <PromptDialog request={prompt} onClose={() => setPrompt(null)} />
      {secondMap.dialog}
    </Frame>
  );
}
