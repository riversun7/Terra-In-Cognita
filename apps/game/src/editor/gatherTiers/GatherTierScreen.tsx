// 1차 생산 티어 확률(/dev/gather-tiers) — 기획 49 N43·M14·D-513, docs/adr/2026-11-02-building-editor.md "바뀜 (2026-11-09)".
// 건물 편집기의 탭이던 것을 따로 개발 도구로 옮겼다(사용자 2026-11-09 "건물편집기에 1차생산 티어확률이 왜 있냐 따로 존재해야한다").
// dev·admin, 틀 안, 촘촘(개발 화면 층). 서버는 건물 편집기와 같은 tRPC buildings.list·check·save·history(확률표 줄 = put_gather_band 등).
// - 위: 요약 칩·내보내기·최근 바꿈, 전체 구간 프리셋. 가운데: 행렬 표(GatherTierTable). 아래: 이 표를 쓰는 채집 시설.
// - 고친 칸은 바로 담기고(실효 값과 같아지면 빠진다) 막대의 [적용]이 묶음 하나로 보낸다. 입력이 1초 멈추면 buildings.check.
// - 2026-11-10(docs/adr/2026-11-10-editor-input-controls.md): 표 위에 구간 조절 판(GatherBandPanel — 분포 막대·잠금·균등·정규화),
//   표는 칸을 고치면 나머지가 따라 움직여 합이 늘 1000‰, 고른 칸 묶음 바꾸기·끌어 채우기, Ctrl+Z = 마지막 고침 되돌리기(기기 안).
// - entry_changed·revision_conflict면 목록을 다시 받는다(확률표 구간은 통째라 내 담음은 그대로 두고 다시 검사·적용).
// 조각 이름 GatherTierScreen-*(미리 캐시 규칙 [Gg]atherTier). 건물 편집기 조각(editor/buildings/)은 가져오지 않는다.
import {
  BUILDING_EDITOR_REASONS,
  type BuildingEditorCheckResponse,
  type BuildingEditorHistoryRow,
  type BuildingEditorListResponse,
  type BuildingEditorReason,
} from "@terra/shared/buildingEditor";
import type { TuningExportResponse } from "@terra/shared/tuning";
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
import { PendingBar, type PendingEntry, type PendingStatus } from "../content/contentEditorPending.tsx";
import { useUndoShortcut, useUndoStack } from "../content/contentEditorUndo.ts";
import { GatherBandPanel, bandRangeText } from "./GatherBandPanel.tsx";
import { GatherTierTable } from "./GatherTierTable.tsx";
import {
  BULK_PRESETS,
  EMPTY_GATHER_STAGE,
  type GatherStage,
  applyBulkPreset,
  bulkEditBands,
  editBand,
  gatherChangesOf,
  gatherStageKeys,
  revertBand,
  stageBand,
  stageGatherDiscard,
} from "./gatherTierModel.ts";
import { BULK_PRESET_TEXT, gatherErrorText } from "./gatherTierText.ts";
import "./gatherTier.css";

/** 막대 [열기]: 그 구간 줄의 첫 칸으로 */
const focusBand = (id: string): void => {
  document.querySelector<HTMLInputElement>(`tr[data-band-id="${id}"] input`)?.focus();
};

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: BuildingEditorListResponse }
  | { readonly status: "failed"; readonly message: string };

/** 검사 결과 → 막대 상태(오류가 있으면 [적용]을 막는다) */
function statusOf(keys: number, result: BuildingEditorCheckResponse | null | undefined): PendingStatus {
  if (keys === 0 || result === undefined)
    return { text: m.dev_buildings_checking(), tone: "busy", data: keys === 0 ? "idle" : "checking" };
  if (result === null) return { text: m.dev_buildings_check_failed(), tone: "failed", data: "failed" };
  const errors = result.issues.filter((issue) => issue.level === "error").length;
  return errors > 0
    ? { text: m.dev_buildings_check_blocked({ count: errors }), tone: "blocked", data: "blocked" }
    : {
        text: m.dev_buildings_check_ok({ advice: result.issues.length - errors }),
        tone: "ok",
        data: "ok",
      };
}

export default function GatherTierScreen() {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [stage, setStage] = useState<GatherStage>(EMPTY_GATHER_STAGE);
  const stageRef = useRef<GatherStage>(EMPTY_GATHER_STAGE);
  const [check, setCheck] = useState<{
    readonly key: string;
    readonly result: BuildingEditorCheckResponse | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly BuildingEditorHistoryRow[] | null>(null);
  // 구간 조절 판에 올린 구간(없으면 첫 구간)
  const [selected, setSelected] = useState<string | null>(null);
  const undoStack = useUndoStack<GatherStage>();
  const notice = useLiveLines();
  const problem = useLiveLines();

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  /** 담은 변경을 바꾼다. editKey가 같은 고침이 1초 안에 이어지면(끌기·치기) 되돌리기 한 칸으로 묶는다 */
  const push = (next: GatherStage, editKey?: string): void => {
    undoStack.record(stageRef.current, editKey);
    stageRef.current = next;
    setStage(next);
  };
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
  const sleeping = (list?.sleeping ?? []).filter((row) => row.category === "gather_tiers");
  const keys = gatherStageKeys(stage);
  const changes = gatherChangesOf(stage);
  const stageJson = stableJson(changes);
  const checked = check && check.key === stageJson ? check.result : undefined;
  const status = statusOf(keys.length, checked);
  const canApply = keys.length > 0 && status.tone === "ok" && !busy;

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
    const batch = gatherChangesOf(stageRef.current);
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
      stageRef.current = EMPTY_GATHER_STAGE;
      setStage(EMPTY_GATHER_STAGE);
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
    const index = bands.findIndex((band) => band.entry.id === id);
    return index < 0 ? id : bandRangeText(bands, index);
  };
  const pendingEntries: PendingEntry[] = [
    ...[...stage.bands].map(
      ([id, item]): PendingEntry => ({
        key: id,
        id,
        name: m.dev_gather_pending_name({ range: rangeOf(id) }),
        kind: item.op === "put_gather_band" ? "put" : "revert",
        fields: item.op === "put_gather_band" ? leafDiff(item.base, item.entry).length : null,
        onOpen: () => {
          setSelected(id);
          focusBand(id);
        },
        onRemove: () => push(stageBand(stageRef.current, id, null)),
      }),
    ),
    ...[...stage.discard].map(
      (id): PendingEntry => ({
        key: `sleeping/${id}`,
        id,
        name: m.dev_gather_sleeping_title(),
        kind: "discard",
        onRemove: () => push(stageGatherDiscard(stageRef.current, id, false)),
      }),
    ),
  ];
  const gatherFacilities = (list?.facilities ?? []).filter((row) => row.entry.gather !== undefined);

  return (
    <section
      className="screen screen-wide ce-screen gt-screen"
      aria-labelledby="gather-tiers-title"
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id="gather-tiers-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_gather_tiers()}
        </h1>
        <BackButton />
      </div>
      <p className="lead">{m.dev_gather_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_gather_loading()}</p> : null}
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
            label={m.dev_gather_summary_label()}
            className="gt-summary"
            chips={[
              { key: "pack", text: m.dev_buildings_pack({ version: list.contentVersion }) },
              { key: "revision", text: m.dev_buildings_revision({ revision: list.revision }) },
              { key: "count", text: m.dev_gather_count({ count: bands.length }) },
              {
                key: "changed",
                text: m.dev_gather_changed({ count: bands.filter((band) => band.origin !== "pack").length }),
                warn: bands.some((band) => band.origin !== "pack"),
              },
              { key: "bonus", text: m.dev_gather_rule({ bonus: list.gatherLevelBonus }) },
            ]}
            tools={
              <span className="ce-inline-actions gt-tools">
                <AppLink to={{ route: "dev_buildings" }} className="button-small">
                  {m.dev_gather_open_buildings()}
                </AppLink>
                <AppLink to={{ route: "dev_tuning" }} className="button-small">
                  {m.dev_gather_open_tuning()}
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
          {sleeping.length > 0 ? (
            <section className="ce-panel" aria-labelledby="gt-sleeping-title">
              <h2 id="gt-sleeping-title" className="ce-panel-title">
                {m.dev_gather_sleeping_title()}
              </h2>
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
                        push(stageGatherDiscard(stageRef.current, row.id, !stage.discard.has(row.id)))
                      }
                    >
                      {m.dev_buildings_discard()}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {exported ? (
            <ExportPanel exported={exported} textClass="gt-export-text" onClose={() => setExported(null)} />
          ) : null}
          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={m.dev_buildings_history()}
              className="ce-panel"
              headingId="gt-history-title"
            />
          ) : null}
          <div className="ce-messages">
            <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
            <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          </div>
          <div className="gt-bulk" role="group" aria-label={m.dev_gather_bulk_label()}>
            <span className="gt-bulk-label">{m.dev_gather_bulk_label()}</span>
            {BULK_PRESETS.map((kind) => (
              <button
                key={kind}
                type="button"
                className="button-small"
                data-preset={kind}
                onClick={() => push(applyBulkPreset(stageRef.current, bands, kind))}
              >
                {BULK_PRESET_TEXT[kind]()}
              </button>
            ))}
            <button
              type="button"
              className="button-small gt-undo"
              aria-disabled={!undoStack.canUndo || undefined}
              onClick={undo}
            >
              {m.dev_input_undo()}
            </button>
          </div>
          <GatherBandPanel
            bands={bands}
            stage={stage}
            selected={selected}
            onSelect={setSelected}
            onEdit={(row, weights) => push(editBand(stageRef.current, row, weights), `band:${row.entry.id}`)}
            onRevert={(row) => push(revertBand(stageRef.current, row))}
            onUnstage={(id) => push(stageBand(stageRef.current, id, null))}
          />
          <GatherTierTable
            bands={bands}
            stage={stage}
            selected={selected ?? bands[0]?.entry.id ?? null}
            onSelect={(id) => {
              setSelected(id);
              document.querySelector(".gt-panel")?.scrollIntoView({ block: "nearest" });
            }}
            onEdit={(row, weights) => push(editBand(stageRef.current, row, weights), `band:${row.entry.id}`)}
            onBulk={(picked, op) => push(bulkEditBands(stageRef.current, bands, picked, op))}
          />
          <section className="ce-panel gt-facilities" aria-labelledby="gt-facilities-title">
            <h2 id="gt-facilities-title" className="ce-panel-title">
              {m.dev_gather_facilities_title()}
            </h2>
            <ul className="gt-facility-list">
              {gatherFacilities.map((row) => {
                const gather = row.entry.gather;
                if (!gather) return null;
                return (
                  <li key={row.entry.id} data-mode={gather.mode ?? "roll"}>
                    <AppLink
                      to={{ route: "dev_buildings", search: { facility: row.entry.id } }}
                      className="gt-facility-link"
                    >
                      {row.entry.name[locale]}
                    </AppLink>{" "}
                    <code className="dev-code" translate="no">
                      {gather.primary.toUpperCase()}+{gather.secondary.toUpperCase()}
                    </code>{" "}
                    <span className="dev-badge">
                      {gather.mode === "select" ? m.dev_buildings_mode_select() : m.dev_buildings_mode_roll()}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="field-hint">{m.dev_gather_mode_note()}</p>
          </section>
          {keys.length > 0 ? (
            <PendingBar
              label={m.dev_gather_stage_label()}
              entries={pendingEntries}
              status={status}
              note={note}
              onNote={setNote}
              busy={busy}
              canApply={canApply}
              onApply={() => void apply()}
              onDiscard={() => push(EMPTY_GATHER_STAGE)}
              onCheck={runCheck}
              classes={{ bar: "gt-stagebar", note: "gt-note", apply: "gt-apply", discard: "gt-clear" }}
            />
          ) : null}
          {keys.length > 0 ? <CheckLater key={`check:${stageJson}`} delay={1000} run={runCheck} /> : null}
        </>
      ) : null}
    </section>
  );
}
