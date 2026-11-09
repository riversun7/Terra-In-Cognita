// 건물 편집기(/dev/buildings) — docs/adr/2026-11-02-building-editor.md("바뀜 (2026-11-08 화면 개편)"), 기획 D-508·49 M14·D-5044.
// dev·admin, 틀 안, 촘촘(개발 화면 층). 설정 칸 패널(/dev/tuning)과 한 가족인 공용 틀(editor/content/contentEditorShell.css).
// - 넓은 폭은 왼쪽 시설 목록(BuildingList: 찾기·거르기, 줄 = 단계·이름·ID·최고 레벨·자리·Lv1 재료·표지) + 오른쪽 편집 판(BuildingDetail:
//   기본·건설 재료 레벨 구간·레벨 표·채집·수리·레시피, 칸마다 팩 값·지금 값 견주기와 칸 되돌리기, 검사 문제는 칸 옆에도).
//   휴대폰은 목록 → 편집이 한 칸씩(data-view). ?facility=<ID>는 그 시설을 바로 연다. 키: "/" 찾기, Alt+↑↓ 이전·다음, Ctrl/⌘+S 적용.
// - 고친 칸은 바로 담은 변경에 든다(실효 값과 같아지면 빠진다). 막대의 [적용]이 서버 묶음(buildings.save) 하나로 보낸다. 서버가 팩 검사기로
//   본 뒤 그 세계에 바로 넣는다(D-461). 입력이 1초 멈추면 buildings.check(코드가 붙은 문제 → 편집 판 아래 문구).
// - 묶음에 고치기 시작할 때의 실효 항목 해시(baseHash)를 싣는다. entry_changed면 목록을 다시 받고 내 칸만 새 항목 위에 다시 얹는다(3방향).
// - 옛 프로젝트 관리자 건물 편집기(terra-client/src/app/admin/editor/buildings)의 표 + 편집 판 모양을 따르고, 우리 자료에 있는 칸만 둔다.
// 조각 이름 BuildingEditorScreen-*([Bb]uildingEditor). 입력 칸·최근 바꿈은 editor/content/ 공용 부품.
import {
  BUILDING_EDITOR_REASONS,
  type BuildingEditorChange,
  type BuildingEditorCheckResponse,
  type BuildingEditorHistoryRow,
  type BuildingEditorListResponse,
  type BuildingEditorReason,
  type FacilityJson,
} from "@terra/shared/buildingEditor";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { CheckLater } from "../content/contentEditorCheckLater.tsx";
import { ContentHistory } from "../content/contentEditorHistory.tsx";
import { EditorSummary, ExportPanel, KeyHelp, useEditorKeys } from "../content/contentEditorLayout.tsx";
import {
  type ContentErrorInfo,
  contentErrorOf,
  sameJson,
  stableJson,
} from "../content/contentEditorModel.ts";
import { leafDiff } from "../content/contentEditorPaths.ts";
import { PendingBar, type PendingEntry } from "../content/contentEditorPending.tsx";
import { BuildingDetail } from "./BuildingDetail.tsx";
import { BuildingList, type BuildingQuery, EMPTY_BUILDING_QUERY, filterFacilities } from "./BuildingList.tsx";
import { BuildingSleeping, type CheckState, checkStatus } from "./BuildingPanels.tsx";
import { errorText } from "./buildingMessages.ts";
import {
  type BuildingStage,
  EMPTY_STAGE,
  type StagedFacility,
  changesOf,
  cleanFacility,
  mergeFacility,
  stageDiscard,
  stageFacility,
  stageKeys,
} from "./buildingModel.ts";
import "./buildingEditor.css";

type ErrorInfo = ContentErrorInfo<BuildingEditorReason>;
type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: BuildingEditorListResponse }
  | { readonly status: "failed"; readonly message: string };

/** 3방향 다시 얹기(entry_changed 뒤): 내 담음을 새 실효 항목 위로. 같아지면 담음에서 뺀다 */
function rebaseStaged(
  staged: StagedFacility,
  fresh: { readonly entry: FacilityJson; readonly hash: string },
): { next: StagedFacility | null; conflicts: readonly string[] } {
  if (staged.op === "revert")
    return { next: { ...staged, base: fresh.entry, baseHash: fresh.hash }, conflicts: [] };
  const merged = mergeFacility(staged.base, staged.entry, fresh.entry);
  if (sameJson(merged.entry, fresh.entry)) return { next: null, conflicts: merged.conflicts };
  return {
    next: { op: "put", entry: merged.entry, base: fresh.entry, baseHash: fresh.hash },
    conflicts: merged.conflicts,
  };
}

export default function BuildingEditorScreen({ initialId }: { initialId?: string | undefined }) {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [view, setView] = useState<"list" | "detail">(initialId ? "detail" : "list");
  const [stage, setStage] = useState<BuildingStage>(EMPTY_STAGE);
  const stageRef = useRef<BuildingStage>(EMPTY_STAGE);
  const [check, setCheck] = useState<{
    readonly key: string;
    readonly result: BuildingEditorCheckResponse | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly BuildingEditorHistoryRow[] | null>(null);
  const [query, setQueryState] = useState<BuildingQuery>(EMPTY_BUILDING_QUERY);
  const searchRef = useRef<HTMLInputElement>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const text = useDeferredValue(query.text);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const fail = (error: unknown): ErrorInfo => {
    const info = contentErrorOf(error, BUILDING_EDITOR_REASONS);
    if (info.sessionEnded) void refreshSession();
    problem.show([errorText(info.key), ...info.details]);
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
        setLoad({ status: "failed", message: errorText(info.key) });
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
        setLoad({ status: "failed", message: errorText(info.key) });
      },
    );
  }, []);

  const pushStage = (next: BuildingStage): void => {
    stageRef.current = next;
    setStage(next);
  };

  const list = load.status === "ready" ? load.list : null;
  const rows = list?.facilities ?? [];
  // 확률표 잠든 줄은 1차 생산 티어 확률 화면(/dev/gather-tiers)이 보인다
  const sleeping = (list?.sleeping ?? []).filter((item) => item.category !== "gather_tiers");
  const row = selected ? rows.find((item) => item.entry.id === selected) : undefined;
  const staged = selected ? stage.facilities.get(selected) : undefined;
  const reverting = staged?.op === "revert";
  const draft: FacilityJson | null =
    staged?.op === "put"
      ? staged.entry
      : reverting
        ? (row?.pack ?? row?.entry ?? null)
        : (row?.entry ?? null);
  const keys = stageKeys(stage);
  const changes = changesOf(stage);
  const stageJson = stableJson(changes);
  const checked = check && check.key === stageJson ? check : null;
  const issues = checked?.result?.issues ?? [];
  const errors = issues.filter((issue) => issue.level === "error").length;
  const checkState: CheckState =
    keys.length === 0
      ? { status: "idle" }
      : checked === null
        ? { status: "checking" }
        : checked.result === null
          ? { status: "failed" }
          : { status: "done", errors, advice: issues.length - errors };

  const select = (id: string): void => {
    setSelected(id);
    setView("detail");
  };

  const setQuery = (patch: Partial<BuildingQuery>): void =>
    setQueryState((previous) => ({ ...previous, ...patch }));
  const shown = list ? filterFacilities(list, stage, { ...query, text }, locale) : [];
  const shownIds = shown.map((item) => item.row.entry.id);
  const at = selected ? shownIds.indexOf(selected) : -1;

  /** 보이는 차례로 이전·다음 시설 */
  const step = (by: -1 | 1): void => {
    if (shownIds.length === 0) return;
    const next = shownIds[at < 0 ? 0 : Math.max(0, Math.min(shownIds.length - 1, at + by))];
    if (next && next !== selected) select(next);
  };

  /** 편집 판이 고친 시설(실효 값과 같아지면 담음에서 뺀다) */
  const edit = (next: FacilityJson): void => {
    if (!selected || !row) return;
    const current = stageRef.current.facilities.get(selected);
    const base = current ? current.base : row.entry;
    const baseHash = current ? current.baseHash : row.hash;
    const clean = cleanFacility(next);
    pushStage(
      stageFacility(
        stageRef.current,
        selected,
        sameJson(clean, base) ? null : { op: "put", entry: clean, base, baseHash },
      ),
    );
  };

  const revert = (): void => {
    if (!selected || !row) return;
    const current = stageRef.current.facilities.get(selected);
    pushStage(
      stageFacility(stageRef.current, selected, {
        op: "revert",
        base: current ? current.base : row.entry,
        baseHash: current ? current.baseHash : row.hash,
      }),
    );
  };

  const unstage = (): void => {
    if (selected) pushStage(stageFacility(stageRef.current, selected, null));
  };

  const runCheck = (key: string, batch: readonly BuildingEditorChange[]): void => {
    if (batch.length === 0) return;
    api.buildings.check.query({ changes: [...batch] }).then(
      (result) => setCheck({ key, result }),
      (error: unknown) => {
        if (contentErrorOf(error, BUILDING_EDITOR_REASONS).sessionEnded) void refreshSession();
        setCheck({ key, result: null });
      },
    );
  };

  /** 그새 누가 같은 시설을 바꿨다(entry_changed): 목록을 다시 받고 내 칸만 새 항목 위에 다시 얹는다 */
  const rebase = async (changedKeys: readonly string[]): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    let next = stageRef.current;
    const lines: string[] = [];
    for (const key of changedKeys) {
      const id = key.startsWith("facilities/") ? key.slice("facilities/".length) : key;
      const mine = next.facilities.get(id);
      const latest = fresh.facilities.find((item) => item.entry.id === id);
      if (!mine || !latest) continue;
      const result = rebaseStaged(mine, latest);
      next = stageFacility(next, id, result.next);
      if (result.conflicts.length > 0)
        lines.push(m.dev_buildings_rebase_conflicts({ id, fields: result.conflicts.join(", ") }));
    }
    pushStage(next);
    problem.show([
      errorText("entry_changed"),
      m.dev_buildings_rebased({ count: changedKeys.length }),
      ...lines,
    ]);
  };

  const apply = async (): Promise<void> => {
    if (!list || busy) return;
    const batch = changesOf(stageRef.current);
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
      pushStage(EMPTY_STAGE);
      setNote("");
      setHistory(null);
      notice.show([m.dev_buildings_applied({ count: batch.length, revision: next.revision })]);
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") {
        await reload();
        problem.show([m.dev_buildings_reloaded()]);
      }
      if (info.key === "entry_changed") await rebase(info.details);
    } finally {
      setBusy(false);
    }
  };

  const onExport = (): void => {
    api.tuning.export.query().then(setExported, fail);
  };
  const onHistory = (): void => {
    if (history) {
      setHistory(null);
      return;
    }
    api.buildings.history.query().then((result) => setHistory(result.rows), fail);
  };

  const pick = (key: string): void => {
    if (!key.startsWith("sleeping/")) select(key);
  };

  const canApply = keys.length > 0 && checkState.status === "done" && checkState.errors === 0 && !busy;
  useEditorKeys({
    searchRef,
    dirty: keys.length > 0,
    onSave: () => {
      if (canApply) void apply();
    },
    onStep: step,
  });

  const facilityName = (id: string): string =>
    rows.find((item) => item.entry.id === id)?.entry.name[locale] ?? id;
  const pendingEntries: PendingEntry[] = [
    ...[...stage.facilities].map(
      ([id, item]): PendingEntry => ({
        key: id,
        id,
        name: item.op === "put" ? item.entry.name[locale] : facilityName(id),
        kind: item.op === "put" ? "put" : "revert",
        fields: item.op === "put" ? leafDiff(item.base, item.entry).length : null,
        onOpen: () => pick(id),
        onRemove: () => pushStage(stageFacility(stageRef.current, id, null)),
      }),
    ),
    ...[...stage.discard].map(
      (id): PendingEntry => ({
        key: `sleeping/${id}`,
        id,
        name: m.dev_buildings_sleeping_title(),
        kind: "discard",
        onRemove: () => pushStage(stageDiscard(stageRef.current, id, false)),
      }),
    ),
  ];

  return (
    <section
      className="screen screen-wide ce-screen be-screen"
      aria-labelledby="buildings-title"
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id="buildings-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_buildings()}
        </h1>
        <BackButton />
      </div>
      <p className="lead">{m.dev_buildings_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_buildings_loading()}</p> : null}
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
            label={m.dev_buildings_summary_label()}
            className="be-summary"
            chips={[
              { key: "pack", text: m.dev_buildings_pack({ version: list.contentVersion }) },
              { key: "revision", text: m.dev_buildings_revision({ revision: list.revision }) },
              { key: "count", text: m.dev_buildings_count({ count: list.facilities.length }) },
              {
                key: "changed",
                text: m.dev_buildings_changed({
                  count: list.facilities.filter((item) => item.origin !== "pack").length,
                }),
                warn: list.facilities.some((item) => item.origin !== "pack"),
              },
            ]}
            tools={
              <span className="be-summary-tools ce-inline-actions">
                <button type="button" onClick={onExport}>
                  {m.dev_buildings_export()}
                </button>
                <button type="button" aria-pressed={history !== null} onClick={onHistory}>
                  {m.dev_buildings_history()}
                </button>
              </span>
            }
          />
          {sleeping.length > 0 ? (
            <BuildingSleeping
              rows={sleeping}
              discard={stage.discard}
              onToggle={(id, on) => pushStage(stageDiscard(stageRef.current, id, on))}
            />
          ) : null}
          {exported ? (
            <ExportPanel exported={exported} textClass="be-export-text" onClose={() => setExported(null)} />
          ) : null}
          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={m.dev_buildings_history()}
              className="ce-panel be-history"
              headingId="be-history-title"
            />
          ) : null}
          <div className="ce-messages">
            <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
            <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          </div>
          <div className="ce-layout be-split" data-view={view}>
            <aside className="ce-side">
              <BuildingList
                list={list}
                rows={shown}
                locale={locale}
                selected={selected}
                stage={stage}
                query={query}
                onQuery={setQuery}
                searchRef={searchRef}
                onSelect={select}
              />
              <KeyHelp />
            </aside>
            <div className="ce-detail be-detail-pane">
              {selected && row && draft ? (
                <BuildingDetail
                  key={selected}
                  list={list}
                  row={row}
                  draft={draft}
                  locale={locale}
                  staged={staged !== undefined}
                  reverting={reverting}
                  issues={issues.filter((issue) => issue.id === null || issue.id === selected)}
                  checking={staged !== undefined && checked === null}
                  onEdit={edit}
                  onRevert={revert}
                  onUnstage={unstage}
                  onBack={() => setView("list")}
                  onPrev={at > 0 ? () => step(-1) : null}
                  onNext={at >= 0 && at < shownIds.length - 1 ? () => step(1) : null}
                />
              ) : (
                <p className="ce-pick be-pick">{m.dev_buildings_pick()}</p>
              )}
            </div>
          </div>
          {keys.length > 0 ? (
            <PendingBar
              label={m.dev_buildings_stage_label()}
              entries={pendingEntries}
              status={checkStatus(checkState)}
              note={note}
              onNote={setNote}
              busy={busy}
              canApply={canApply}
              onApply={() => void apply()}
              onDiscard={() => pushStage(EMPTY_STAGE)}
              onCheck={() => runCheck(stageJson, changes)}
              classes={{ bar: "be-stagebar", note: "be-note", apply: "be-apply", discard: "be-clear" }}
            />
          ) : null}
          {keys.length > 0 ? (
            <CheckLater key={`check:${stageJson}`} delay={1000} run={() => runCheck(stageJson, changes)} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
