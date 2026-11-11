// 시작 국가 설정(/dev/nations) — 팩 국가 프리셋(이름·약어·색·국가 마크·화폐·시작 조건·국가마다 씨앗 값·도시 직무)을 고쳐 그 세계에 바로
// 든다(D-461). docs/adr/2026-11-10-nation-editor.md. 사용자 요청(2026-11-10): "시작 기본 npc국가세팅 에디터추가하고 반영하라".
// dev·admin, 틀 안, 촘촘(개발 화면 층). 서버는 tRPC nations.list·check·save·history·uploadEmblem·removeEmblem·applyToWorld.
// - 왼쪽: 국가 16줄(마크·색·이름·시작 수). 오른쪽: 편집 판(미리 보기 + 구역 다섯).
// - 고친 칸은 바로 담기고(실효 값과 같아지면 빠진다) 막대의 [적용]이 묶음 하나로 보낸다. 입력이 1초 멈추면 nations.check.
// - 올린 국가 마크는 담지 않고 바로 든다(그림은 팩에 넣지 못한다). [이 세계의 NPC 국가에 반영]은 미리 보기 → 반영.
// - entry_changed면 목록을 다시 받고 내 칸만 새 항목 위에 다시 얹는다. revision_conflict면 다시 받는다.
// 조각 이름 NationEditorScreen-*(미리 캐시 규칙 [Nn]ationEditor).
import {
  NATION_EDITOR_REASONS,
  type NationApplyResponse,
  type NationEditorCheckResponse,
  type NationEditorHistoryRow,
  type NationEditorListResponse,
  type NationEditorReason,
  type NationPresetJson,
} from "@terra/shared/nationEditor";
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
import {
  type ContentErrorInfo,
  contentErrorOf,
  sameJson,
  stableJson,
} from "../content/contentEditorModel.ts";
import { leafDiff } from "../content/contentEditorPaths.ts";
import { PendingBar, type PendingEntry, type PendingStatus } from "../content/contentEditorPending.tsx";
import { NationApplyWorld } from "./NationApplyWorld.tsx";
import { NationDetail } from "./NationDetail.tsx";
import { NationList } from "./NationList.tsx";
import { NationPowerSection, type PowerPanel, createdRowsOf, liveTiersOf } from "./NationPowerSection.tsx";
import {
  EMPTY_NATION_STAGE,
  type NationStage,
  cleanNation,
  nationBatchOf,
  nationChangesOf,
  nationStageKeys,
  rebaseNation,
  stageNation,
  stageNationDiscard,
  stageTier,
} from "./nationModel.ts";
import { nationErrorText } from "./nationText.ts";
import "./nationEditor.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: NationEditorListResponse }
  | { readonly status: "failed"; readonly message: string };

/** 검사 결과 → 막대 상태(오류가 있으면 [적용]을 막는다) */
function statusOf(keys: number, result: NationEditorCheckResponse | null | undefined): PendingStatus {
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

export default function NationEditorScreen({ initialId }: { initialId?: string | undefined }) {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [stage, setStage] = useState<NationStage>(EMPTY_NATION_STAGE);
  const stageRef = useRef<NationStage>(EMPTY_NATION_STAGE);
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [view, setView] = useState<"list" | "detail">(initialId ? "detail" : "list");
  const [check, setCheck] = useState<{
    readonly key: string;
    readonly result: NationEditorCheckResponse | null;
  } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly NationEditorHistoryRow[] | null>(null);
  const [applied, setApplied] = useState<NationApplyResponse | null>(null);
  const [panel, setPanel] = useState<PowerPanel>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const pushStage = (next: NationStage): void => {
    stageRef.current = next;
    setStage(next);
  };

  const fail = (error: unknown): ContentErrorInfo<NationEditorReason> => {
    const info = contentErrorOf(error, NATION_EDITOR_REASONS);
    if (info.sessionEnded) void refreshSession();
    problem.show([nationErrorText(info.key), ...info.details]);
    return info;
  };

  const reload = (): Promise<NationEditorListResponse | null> =>
    api.nations.list.query().then(
      (list) => {
        setLoad({ status: "ready", list });
        return list;
      },
      (error: unknown) => {
        const info = contentErrorOf(error, NATION_EDITOR_REASONS);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: nationErrorText(info.key) });
        return null;
      },
    );

  // 처음 한 번 목록을 받는다(받은 뒤 setLoad는 비동기 콜백 안이다)
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void api.nations.list.query().then(
      (list) => setLoad({ status: "ready", list }),
      (error: unknown) => {
        const info = contentErrorOf(error, NATION_EDITOR_REASONS);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: nationErrorText(info.key) });
      },
    );
  }, []);

  const list = load.status === "ready" ? load.list : null;
  // 목록 = 서버 줄 + 이번에 새로 만드는 프리셋(랜덤 국가 추가 — 저장 전)
  const rows = [...(list?.nations ?? []), ...createdRowsOf(stage)];
  /** 국력 등급 표를 담은 값으로 바꿔 끼운 목록(등급 기본값·요약이 담은 값을 따른다) */
  const liveList = list
    ? (() => {
        const tiers = liveTiersOf(list, stage);
        return {
          ...list,
          tiers: list.tiers.map((item, index) => ({ ...item, entry: tiers[index] ?? item.entry })),
        };
      })()
    : null;
  const sleeping = list?.sleeping ?? [];
  const row = selected ? rows.find((item) => item.entry.id === selected) : undefined;
  const staged = selected ? stage.nations.get(selected) : undefined;
  const reverting = staged?.op === "revert";
  const draft: NationPresetJson | null =
    staged?.op === "put"
      ? staged.entry
      : reverting
        ? (row?.pack ?? row?.entry ?? null)
        : (row?.entry ?? null);
  const keys = nationStageKeys(stage);
  const changes = nationChangesOf(stage);
  const stageJson = stableJson(changes);
  const checked = check && check.key === stageJson ? check.result : undefined;
  const issues = checked?.issues ?? [];
  const status = statusOf(keys.length, checked);
  const canApply = keys.length > 0 && status.tone === "ok" && !busy;
  const ids = rows.map((item) => item.entry.id);
  const at = selected ? ids.indexOf(selected) : -1;

  const select = (id: string): void => {
    setSelected(id);
    setView("detail");
  };
  const step = (by: -1 | 1): void => {
    const next = ids[Math.max(0, Math.min(ids.length - 1, at + by))];
    if (next && next !== selected) select(next);
  };

  /** 편집 판이 고친 국가(실효 값과 같아지면 담음에서 뺀다). 빈 선택 칸은 보낼 때 뺀다(초안에는 글자 그대로 둔다) */
  const edit = (next: NationPresetJson): void => {
    if (!selected || !row) return;
    const current = stageRef.current.nations.get(selected);
    const base = current ? current.base : row.entry;
    const baseHash = current ? current.baseHash : row.hash;
    // 새로 만드는 프리셋은 처음 후보와 같아져도 담은 채로 둔다(빼면 만들기가 사라진다)
    const same = !stageRef.current.created.has(selected) && sameJson(cleanNation(next), cleanNation(base));
    pushStage(
      stageNation(stageRef.current, selected, same ? null : { op: "put", entry: next, base, baseHash }),
    );
  };
  const revert = (): void => {
    if (!selected || !row) return;
    const current = stageRef.current.nations.get(selected);
    pushStage(
      stageNation(stageRef.current, selected, {
        op: "revert",
        base: current ? current.base : row.entry,
        baseHash: current ? current.baseHash : row.hash,
      }),
    );
  };
  const unstage = (): void => {
    if (selected) pushStage(stageNation(stageRef.current, selected, null));
  };

  const runCheck = (): void => {
    const batch = nationBatchOf(stageRef.current);
    if (batch.length === 0) return;
    const key = stableJson(nationChangesOf(stageRef.current));
    api.nations.check.query({ changes: batch }).then(
      (result) => setCheck({ key, result }),
      (error: unknown) => {
        if (contentErrorOf(error, NATION_EDITOR_REASONS).sessionEnded) void refreshSession();
        setCheck({ key, result: null });
      },
    );
  };

  /** 그새 누가 같은 국가를 바꿨다(entry_changed): 목록을 다시 받고 내 칸만 새 항목 위에 다시 얹는다 */
  const rebase = async (changedKeys: readonly string[]): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    let next = stageRef.current;
    const lines: string[] = [];
    for (const key of changedKeys) {
      if (key.startsWith("nation_tiers/")) {
        // 등급 줄: 내 값을 새 줄 위에 그대로 얹는다(칸마다 합치지 않는다 — 줄이 작다)
        const id = key.slice("nation_tiers/".length);
        const mine = next.tiers.get(id);
        const latest = fresh.tiers.find((item) => item.entry.id === id);
        if (mine && latest)
          next = stageTier(next, id, { ...mine, base: latest.entry, baseHash: latest.hash });
        continue;
      }
      const id = key.startsWith("nation_presets/") ? key.slice("nation_presets/".length) : key;
      const mine = next.nations.get(id);
      const latest = fresh.nations.find((item) => item.entry.id === id);
      if (!mine || !latest) continue;
      const result = rebaseNation(mine, latest);
      next = stageNation(next, id, result.next);
      if (result.conflicts.length > 0)
        lines.push(m.dev_buildings_rebase_conflicts({ id, fields: result.conflicts.join(", ") }));
    }
    pushStage(next);
    problem.show([nationErrorText("entry_changed"), m.dev_nations_rebased(), ...lines]);
  };

  const apply = async (): Promise<void> => {
    if (!list || busy) return;
    const batch = nationBatchOf(stageRef.current);
    if (batch.length === 0) return;
    setBusy(true);
    problem.clear();
    try {
      const next = await api.nations.save.mutate({
        expectedRevision: list.revision,
        changes: batch,
        note: note.trim() === "" ? null : note,
      });
      setLoad({ status: "ready", list: next });
      pushStage(EMPTY_NATION_STAGE);
      setNote("");
      setHistory(null);
      setApplied(null);
      notice.show([m.dev_buildings_applied({ count: batch.length, revision: next.revision })]);
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") {
        await reload();
        problem.show([nationErrorText(info.key), m.dev_buildings_reloaded()]);
      }
      if (info.key === "entry_changed") await rebase(info.details);
    } finally {
      setBusy(false);
    }
  };

  /** 자른 그림을 올린다(바로 든다). 됐으면 참 */
  const upload = async (pngBase64: string): Promise<boolean> => {
    if (!selected) return false;
    setBusy(true);
    problem.clear();
    try {
      const next = await api.nations.uploadEmblem.mutate({ id: selected, pngBase64 });
      setLoad({ status: "ready", list: next });
      notice.show([m.dev_nations_emblem_uploaded_done()]);
      return true;
    } catch (error: unknown) {
      fail(error);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const removeUpload = (): void => {
    if (!selected || busy) return;
    setBusy(true);
    api.nations.removeEmblem
      .mutate({ id: selected })
      .then((next) => {
        setLoad({ status: "ready", list: next });
        notice.show([m.dev_nations_emblem_removed_done()]);
      }, fail)
      .finally(() => setBusy(false));
  };

  const applyToWorld = (dryRun: boolean): void => {
    if (busy) return;
    setBusy(true);
    problem.clear();
    api.nations.applyToWorld
      .mutate({ dryRun })
      .then((result) => {
        setApplied(result);
        if (!dryRun)
          notice.show([m.dev_nations_apply_done({ updated: result.updated, skipped: result.skipped })]);
      }, fail)
      .finally(() => setBusy(false));
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
  }, [latest]);
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent): void => {
      if (keys.length > 0) event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [keys.length]);

  const nameOf = (id: string): string => rows.find((item) => item.entry.id === id)?.entry.name[locale] ?? id;
  const pendingEntries: PendingEntry[] = [
    ...[...stage.nations].map(
      ([id, item]): PendingEntry => ({
        key: id,
        id,
        name: item.op === "put" ? item.entry.name[locale] : nameOf(id),
        kind: item.op === "put" ? "put" : "revert",
        fields: item.op === "put" ? leafDiff(cleanNation(item.base), cleanNation(item.entry)).length : null,
        onOpen: () => select(id),
        onRemove: () => pushStage(stageNation(stageRef.current, id, null)),
      }),
    ),
    ...[...stage.tiers].map(
      ([id, item]): PendingEntry => ({
        key: `tier/${id}`,
        id,
        name: m.dev_nations_tier_pending({
          tier: list?.tiers.find((tier) => tier.entry.id === id)?.entry.name[locale] ?? id,
        }),
        kind: item.op === "put" ? "put" : "revert",
        fields: item.op === "put" ? leafDiff(item.base, item.entry).length : null,
        onOpen: () => setPanel("power"),
        onRemove: () => pushStage(stageTier(stageRef.current, id, null)),
      }),
    ),
    ...[...stage.discard].map(
      (id): PendingEntry => ({
        key: `sleeping/${id}`,
        id,
        name: m.dev_nations_sleeping_title(),
        kind: "discard",
        onRemove: () => pushStage(stageNationDiscard(stageRef.current, id, false)),
      }),
    ),
  ];
  const changedCount = rows.filter((item) => item.origin !== "pack").length;

  return (
    <section
      className="screen screen-wide ce-screen ne-screen"
      aria-labelledby="nations-title"
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id="nations-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_nations()}
        </h1>
        <BackButton />
      </div>
      <p className="lead">{m.dev_nations_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_nations_loading()}</p> : null}
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
            label={m.dev_nations_summary_label()}
            className="ne-summary"
            chips={[
              { key: "pack", text: m.dev_buildings_pack({ version: list.contentVersion }) },
              { key: "revision", text: m.dev_buildings_revision({ revision: list.revision }) },
              { key: "count", text: m.dev_nations_count({ count: rows.length }) },
              {
                key: "changed",
                text: m.dev_nations_changed({ count: changedCount }),
                warn: changedCount > 0,
              },
              {
                key: "world",
                text:
                  list.testNations === null
                    ? m.dev_nations_world_off()
                    : m.dev_nations_world_nations({ count: list.testNations }),
              },
            ]}
            tools={
              <span className="ce-inline-actions ne-tools">
                <AppLink to={{ route: "dev_world_layout" }} className="button-small">
                  {m.dev_nations_open_world_layout()}
                </AppLink>
                <AppLink to={{ route: "dev_tuning" }} className="button-small">
                  {m.dev_nations_open_tuning()}
                </AppLink>
                <button
                  type="button"
                  className="ne-power-open"
                  aria-pressed={panel === "power"}
                  onClick={() => setPanel(panel === "power" ? null : "power")}
                >
                  {m.dev_nations_power_open()}
                </button>
                <button
                  type="button"
                  className="ne-random-open"
                  aria-pressed={panel === "random"}
                  onClick={() => setPanel(panel === "random" ? null : "random")}
                >
                  {m.dev_nations_random_open()}
                </button>
                {list.worldTools ? (
                  <button
                    type="button"
                    className="ne-apply-open"
                    aria-pressed={applied !== null}
                    onClick={() => {
                      if (applied) setApplied(null);
                      else applyToWorld(true);
                    }}
                  >
                    {m.dev_nations_apply_open()}
                  </button>
                ) : null}
                <button type="button" onClick={() => void api.tuning.export.query().then(setExported, fail)}>
                  {m.dev_buildings_export()}
                </button>
                <button
                  type="button"
                  aria-pressed={history !== null}
                  onClick={() => {
                    if (history) setHistory(null);
                    else void api.nations.history.query().then((result) => setHistory(result.rows), fail);
                  }}
                >
                  {m.dev_buildings_history()}
                </button>
              </span>
            }
          />
          {sleeping.length > 0 ? (
            <section className="ce-panel" aria-labelledby="ne-sleeping-title">
              <h2 id="ne-sleeping-title" className="ce-panel-title">
                {m.dev_nations_sleeping_title()}
              </h2>
              <ul className="ne-plain-list">
                {sleeping.map((item) => (
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
                      aria-pressed={stage.discard.has(item.id)}
                      onClick={() =>
                        pushStage(stageNationDiscard(stageRef.current, item.id, !stage.discard.has(item.id)))
                      }
                    >
                      {m.dev_buildings_discard()}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <NationPowerSection
            panel={panel}
            list={list}
            rows={rows.map((item) => {
              const mine = stage.nations.get(item.entry.id);
              return {
                entry:
                  mine?.op === "put"
                    ? mine.entry
                    : mine?.op === "revert"
                      ? (item.pack ?? item.entry)
                      : item.entry,
                uploaded: item.uploaded?.hash ?? null,
                slot: item.slot,
              };
            })}
            stage={stage}
            locale={locale}
            onStage={pushStage}
            onSelect={select}
            onClose={() => setPanel(null)}
          />
          {applied ? (
            <NationApplyWorld
              result={applied}
              busy={busy}
              dirty={keys.length > 0}
              onApply={() => applyToWorld(false)}
              onClose={() => setApplied(null)}
            />
          ) : null}
          {exported ? (
            <ExportPanel exported={exported} textClass="ne-export-text" onClose={() => setExported(null)} />
          ) : null}
          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={m.dev_buildings_history()}
              className="ce-panel"
              headingId="ne-history-title"
            />
          ) : null}
          <div className="ce-messages">
            <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
            <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          </div>
          <div className="ce-layout ne-split" data-view={view}>
            <aside className="ce-side">
              <NationList
                rows={rows}
                stage={stage}
                selected={selected}
                locale={locale}
                defaults={list.defaults}
                tiers={liveList?.tiers.map((item) => item.entry) ?? []}
                onSelect={select}
              />
            </aside>
            <div className="ce-detail ne-detail-pane">
              {selected && row && draft ? (
                <NationDetail
                  key={selected}
                  list={liveList ?? list}
                  row={row}
                  draft={draft}
                  locale={locale}
                  staged={staged !== undefined}
                  reverting={reverting}
                  issues={issues.filter((issue) => issue.id === null || issue.id === selected)}
                  busy={busy}
                  onEdit={edit}
                  onRevert={revert}
                  onUnstage={unstage}
                  onBack={() => setView("list")}
                  onPrev={at > 0 ? () => step(-1) : null}
                  onNext={at >= 0 && at < ids.length - 1 ? () => step(1) : null}
                  onUpload={upload}
                  onRemoveUpload={removeUpload}
                />
              ) : (
                <p className="ce-pick ne-pick">{m.dev_nations_pick()}</p>
              )}
            </div>
          </div>
          {keys.length > 0 ? (
            <PendingBar
              label={m.dev_buildings_stage_label()}
              entries={pendingEntries}
              status={status}
              note={note}
              onNote={setNote}
              busy={busy}
              canApply={canApply}
              onApply={() => void apply()}
              onDiscard={() => pushStage(EMPTY_NATION_STAGE)}
              onCheck={runCheck}
              classes={{ bar: "ne-stagebar", note: "ne-note", apply: "ne-apply-batch", discard: "ne-clear" }}
            />
          ) : null}
          {keys.length > 0 ? <CheckLater key={`check:${stageJson}`} delay={1000} run={runCheck} /> : null}
        </>
      ) : null}
    </section>
  );
}
