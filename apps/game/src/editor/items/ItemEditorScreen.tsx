// 아이템 편집기(/dev/items) — docs/adr/2026-11-01-item-editor.md, 설계안 docs/research/2026-11-01-item-editor-design.md 3장. dev·admin, 틀 안, 촘촘.
// - [아이템] 칸: 왼쪽 목록(ItemList: 대분류 타일·찾기·거르기·정렬), 오른쪽 편집 판(ItemDetail: 접히는 구역·미리 보기·쓰이는 곳). 390px에서는
//   목록 → 편집이 한 칸씩 쌓인다(data-view). [아이템 분류] 칸: 중분류·태그·무기 종류(ItemTaxonomy).
// - 고친 칸은 바로 담은 변경(Stage)에 든다(팩·실효 값과 같아지면 빠진다). 막대(ItemStageBar)의 [적용]이 서버 묶음(items.save) 하나로 보낸다.
//   서버가 팩 검사기로 본 뒤 그 세계에 바로 넣는다(D-461). 입력이 1초 멈추면 items.check(코드가 붙은 문제 → 칸 아래 문구), 600ms 멈추면
//   items.preview(그 세계의 실효 자료·계산식). 되돌리기·다시하기는 담은 변경 안에서만(기기 안).
// - 묶음에 고치기 시작할 때의 실효 항목 해시(baseHash)를 싣는다. entry_changed면 바뀐 칸만 새 항목 위에 다시 얹고(itemRebase), 코드가
//   ID로 쓰는 아이템을 끄거나 칸·무기 공격 칸을 바꾸면 [적용] 전에 묻는다(설계안 3.6). 조각 이름 ItemEditorScreen-*([Ii]temEditor).
import type { ContentHistoryRow } from "@terra/shared/contentEdit";
import {
  DEFAULT_PREVIEW_UNIT,
  ITEM_EDITOR_REASONS,
  ITEM_EDIT_CATEGORIES,
  type EffectJson,
  type ItemCategoryId,
  type ItemEditorCheckResponse,
  type ItemEditorHistoryRow,
  type ItemEditorPreviewResponse,
  type ItemJson,
  type ItemPatch,
  type ItemPreviewUnit,
  type ItemEditorReason,
} from "@terra/shared/itemEditor";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { useId, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { ContentHistory } from "../content/contentEditorHistory.tsx";
import {
  type ContentErrorInfo,
  contentErrorOf,
  freeCopyId,
  sameJson,
  stableJson,
} from "../content/contentEditorModel.ts";
import { ItemBulk } from "./ItemBulk.tsx";
import { ItemDetail } from "./ItemDetail.tsx";
import { ItemEffects } from "./ItemEffects.tsx";
import { ExportPanel, ItemSummary, ItemTabs, RiskyConfirm, SleepingPanel } from "./ItemEditorPanels.tsx";
import { ItemList } from "./ItemList.tsx";
import { ItemNewForm } from "./ItemNewForm.tsx";
import { type CheckState, ItemStageBar } from "./ItemStageBar.tsx";
import { ItemTaxonomy } from "./ItemTaxonomy.tsx";
import { errorText } from "./itemMessages.ts";
import {
  EMPTY_STAGE,
  type Staged,
  type TaxonomyCategory,
  type TaxonomyJson,
  changesOf,
  codeRefRisks,
  cleanItem,
  duplicateItem,
  newItemTemplate,
  stageEffect,
  stageItem,
  stageKeys,
  stageTaxonomy,
} from "./itemModel.ts";
import {
  type ItemConflict,
  changedKeysOf,
  rebaseStage,
  resolveConflict,
  splitKey,
  stageDiscard,
} from "./itemRebase.ts";
import { restageFromHistory } from "./itemRestage.ts";
import { useItemStage } from "./useItemStage.ts";
import { DebouncedTask } from "./DebouncedTask.tsx";
import { useItemEditorData } from "./useItemEditorData.ts";
import "./itemEditor.css";

type Tab = "items" | "taxonomy" | "effects" | "bulk";
const TABS: readonly Tab[] = ["items", "taxonomy", "effects", "bulk"];
const TAB_TEXT: Readonly<Record<Tab, () => string>> = {
  items: m.dev_items_tab_items,
  taxonomy: m.dev_items_tab_taxonomy,
  effects: m.dev_items_tab_effects,
  bulk: m.dev_items_tab_bulk,
};
type ErrorInfo = ContentErrorInfo<ItemEditorReason>;

/** 사본 이름 꼬리: 팩 이름 칸은 두 언어를 함께 적는 콘텐츠 값이라 화면 언어와 상관없이 둘 다 붙인다(설계안 3.8) */
const COPY_SUFFIX = { ko: "(복사)", en: "(Copy)" } as const;

const toRecord = (value: object): Record<string, unknown> => Object.fromEntries(Object.entries(value));

export default function ItemEditorScreen({ initialId }: { initialId?: string | undefined }) {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const tabsId = useId();
  const store = useItemEditorData(initialId ?? null);
  const { load, list, reload } = store;
  const [tab, setTab] = useState<Tab>("items");
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [view, setView] = useState<"list" | "detail">(initialId ? "detail" : "list");
  const staging = useItemStage();
  const stage = staging.stage;
  const [check, setCheck] = useState<{
    readonly key: string;
    readonly result: ItemEditorCheckResponse | null;
  } | null>(null);
  const [preview, setPreview] = useState<{
    readonly key: string;
    readonly id: string;
    readonly result: ItemEditorPreviewResponse | null;
    readonly failed: string | null;
  } | null>(null);
  const [unit, setUnit] = useState<ItemPreviewUnit>(DEFAULT_PREVIEW_UNIT);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [askRisky, setAskRisky] = useState<readonly string[] | null>(null);
  const [conflicts, setConflicts] = useState<ReadonlyMap<string, ItemConflict>>(new Map());
  const [exported, setExported] = useState<TuningExportResponse | null>(null);
  const [history, setHistory] = useState<readonly ItemEditorHistoryRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const fail = (error: unknown): ErrorInfo => {
    const info = contentErrorOf(error, ITEM_EDITOR_REASONS);
    if (info.sessionEnded) void refreshSession();
    problem.show([errorText(info.key), ...info.details]);
    return info;
  };

  const loadDetail = (id: string): void => store.loadDetail(id, fail);

  const rows = list?.items ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const takenItems = new Set([...byId.keys(), ...(list?.retired.items ?? []), ...stage.items.keys()]);
  const keys = stageKeys(stage);
  const changes = changesOf(stage);
  const stageJson = stableJson(changes);
  const checked = check && check.key === stageJson ? check : null;
  const checkState: CheckState =
    keys.length === 0
      ? { status: "idle" }
      : checked === null
        ? { status: "checking" }
        : checked.result === null
          ? { status: "failed" }
          : {
              status: "done",
              errors: checked.result.issues.length,
              advice: Object.values(checked.result.advice).reduce((sum, lines) => sum + lines.length, 0),
            };

  const stagedItem = selected ? stage.items.get(selected) : undefined;
  const got = store.detailOf(selected);
  const row = selected ? byId.get(selected) : undefined;
  const isNew = selected !== null && row === undefined && stagedItem !== undefined;
  const reverting = stagedItem?.op === "revert";
  const draft: ItemJson | null =
    stagedItem?.op === "put" && stagedItem.entry
      ? stagedItem.entry
      : reverting
        ? (got?.pack ?? got?.entry ?? null)
        : (got?.entry ?? null);
  const itemIssues =
    selected && checked?.result
      ? checked.result.issues.filter(
          (issue) =>
            (issue.file === null || issue.file.startsWith("items")) &&
            (issue.id === null || issue.id === selected),
        )
      : [];
  const itemAdvice = selected ? (checked?.result?.advice[`items/${selected}`] ?? got?.advice ?? []) : [];
  const cascade = selected ? (checked?.result?.cascade[`items/${selected}`] ?? null) : null;
  const cleanDraft = draft && !reverting ? cleanItem(draft) : null;
  const previewKey = cleanDraft ? stableJson({ entry: cleanDraft, unit }) : "";
  const shownPreview = preview && preview.id === selected ? preview : null;
  const sleeping =
    list?.sleeping.filter((line) => ITEM_EDIT_CATEGORIES.some((item) => item === line.category)) ?? [];

  const runPreview = (key: string, id: string, entry: ItemJson, at: ItemPreviewUnit): void => {
    api.items.preview.query({ entry: toRecord(entry), unit: at }).then(
      (result) => setPreview({ key, id, result, failed: null }),
      (error: unknown) =>
        setPreview({
          key,
          id,
          result: null,
          failed: errorText(contentErrorOf(error, ITEM_EDITOR_REASONS).key),
        }),
    );
  };

  /** 아이템 하나를 연다(withDetail: 목록에 있으면 서버에서 받는다) */
  const select = (id: string, withDetail = true): void => {
    setSelected(id);
    setView("detail");
    setCreating(false);
    setTab("items");
    if (withDetail && byId.has(id)) loadDetail(id);
  };

  const edit = (next: ItemJson): void => {
    if (!selected) return;
    const staged = staging.current().items.get(selected);
    const base = staged ? staged.base : (got?.entry ?? null);
    const baseHash = staged ? staged.baseHash : (got?.hash ?? null);
    const same = base !== null && sameJson(cleanItem(next), base);
    staging.push(
      stageItem(staging.current(), selected, same ? null : { op: "put", entry: next, base, baseHash }),
      `items/${selected}`,
    );
  };

  const create = (id: string, category: ItemCategoryId, name: { ko: string; en: string }): void => {
    staging.push(
      stageItem(staging.current(), id, {
        op: "put",
        entry: newItemTemplate(id, category, name),
        base: null,
        baseHash: null,
      }),
    );
    select(id, false);
  };

  const duplicate = (): void => {
    if (!draft) return;
    const id = freeCopyId(draft.id, takenItems);
    const entry = duplicateItem(cleanItem(draft), id, COPY_SUFFIX);
    staging.push(stageItem(staging.current(), id, { op: "put", entry, base: null, baseHash: null }));
    setSelected(id);
    notice.show([m.dev_items_duplicated({ id })]);
  };

  const revert = (): void => {
    if (!selected || !got?.entry) return;
    staging.push(
      stageItem(staging.current(), selected, {
        op: "revert",
        entry: null,
        base: got.entry,
        baseHash: got.hash,
      }),
    );
  };

  const unstage = (): void => {
    if (!selected) return;
    staging.push(stageItem(staging.current(), selected, null));
    if (isNew) {
      setSelected(null);
      setView("list");
    }
  };

  const stageTax = (category: TaxonomyCategory, id: string, next: Staged<TaxonomyJson> | null): void => {
    staging.push(stageTaxonomy(staging.current(), category, id, next), `${category}/${id}`);
  };

  const discardSleeping = (category: string, id: string): void =>
    staging.push(stageDiscard(staging.current(), category, id));

  const resolve = (path: string, useTheirs: boolean): void => {
    if (!selected) return;
    const done = resolveConflict(staging.current(), conflicts, selected, path, useTheirs);
    const staged = done.stage.items.get(selected);
    // 고른 끝에 실효 값과 같아졌으면 담김에서 뺀다
    const same = staged?.entry && staged.base && sameJson(cleanItem(staged.entry), staged.base);
    if (done.stage !== staging.current() || same)
      staging.push(same ? stageItem(done.stage, selected, null) : done.stage);
    setConflicts(done.conflicts);
  };

  /** 같은 항목을 누가 먼저 바꿨다(entry_changed): 바뀐 칸만 새 항목 위에 다시 얹는다(3방향) */
  const rebase = async (changedKeys: readonly string[]): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    const itemIds = changedKeys
      .map(splitKey)
      .filter((item) => item.category === "items")
      .map((item) => item.id);
    const fetched = await Promise.all(itemIds.map((id) => api.items.get.query({ id }).catch(() => null)));
    const latest = new Map(itemIds.map((id, index) => [id, fetched[index] ?? null]));
    const rebased = rebaseStage(staging.current(), changedKeys, latest, fresh);
    const found = new Map([...conflicts, ...rebased.conflicts]);
    staging.push(rebased.stage);
    setConflicts(found);
    problem.show([
      errorText("entry_changed"),
      m.dev_items_rebased({ count: changedKeys.length }),
      ...[...found].map(([key, conflict]) =>
        m.dev_items_rebase_conflicts({ id: key, fields: conflict.paths.join(", ") }),
      ),
    ]);
    if (selected && byId.has(selected)) loadDetail(selected);
  };

  /** 서버 검사. 고치는 사이 누가 같은 항목을 바꿨으면(entry_changed) 바로 다시 얹는다(새 해시로 다시 검사된다) */
  const runCheck = (key: string, batch: ReturnType<typeof changesOf>): void => {
    if (batch.length === 0) return;
    api.items.check.query({ changes: batch }).then(
      (result) => {
        setCheck({ key, result });
        const changed = changedKeysOf(result.issues);
        if (changed.length > 0) void rebase(changed);
      },
      (error: unknown) => {
        if (contentErrorOf(error, ITEM_EDITOR_REASONS).sessionEnded) void refreshSession();
        setCheck({ key, result: null });
      },
    );
  };

  const apply = async (confirmed: boolean): Promise<void> => {
    if (!list || busy) return;
    const batch = changesOf(staging.current());
    if (batch.length === 0) return;
    const risky = codeRefRisks(staging.current(), (id) => byId.get(id)?.codeRef === true);
    if (!confirmed && risky.length > 0) {
      setAskRisky(risky);
      return;
    }
    setAskRisky(null);
    setBusy(true);
    problem.clear();
    try {
      const next = await api.items.save.mutate({
        expectedRevision: list.revision,
        changes: batch,
        note: note.trim() === "" ? null : note,
      });
      store.setList(next);
      staging.reset();
      setNote("");
      setConflicts(new Map());
      setHistory(null);
      notice.show([m.dev_items_applied({ count: batch.length, revision: next.revision })]);
      if (selected && next.items.some((item) => item.id === selected)) loadDetail(selected);
      else if (selected) {
        setSelected(null);
        setView("list");
      }
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") {
        await reload();
        problem.show([m.dev_items_reloaded()]);
      }
      if (info.key === "entry_changed") await rebase(info.details);
    } finally {
      setBusy(false);
    }
  };

  const pick = (key: string): void => {
    const { category, id } = splitKey(key);
    if (category !== "items") {
      setTab(category === "effects" ? "effects" : "taxonomy");
      return;
    }
    select(id);
  };

  const onExport = (): void => {
    api.tuning.export.query().then(setExported, fail);
  };
  const onHistory = (): void => {
    if (history) {
      setHistory(null);
      return;
    }
    api.items.history.query().then((result) => setHistory(result.rows), fail);
  };

  const restage = (line: ContentHistoryRow, change: ContentHistoryRow["changes"][number]): void => {
    if (!list) return;
    void restageFromHistory(
      {
        list,
        current: staging.current,
        push: (next) => staging.push(next),
        setDetail: store.setDetail,
        openItem: (id) => select(id, false),
        openTab: setTab,
        notice: notice.show,
        problem: problem.show,
        fail,
      },
      line,
      change,
    );
  };

  const stageEff = (id: string, next: Staged<EffectJson> | null): void =>
    staging.push(stageEffect(staging.current(), id, next), `effects/${id}`);

  /** 가져온 항목을 담는다(새로 = 바탕 없음, 고침 = 지금 항목·해시가 바탕, WP-7) */
  const stageImport = (entries: readonly ItemJson[], current: ReadonlyMap<string, ItemJson>): void => {
    let next = staging.current();
    for (const entry of entries) {
      const base = current.get(entry.id) ?? null;
      next = stageItem(next, entry.id, {
        op: "put",
        entry,
        base,
        baseHash: byId.get(entry.id)?.hash ?? null,
      });
    }
    staging.push(next);
    notice.show([m.dev_items_bulk_staged_count({ count: entries.length })]);
  };

  /** 여러 개 고치기를 바로 적용한다(서버 patch 명령 하나, WP-7) */
  const applyPatch = async (ids: readonly string[], patch: ItemPatch): Promise<boolean> => {
    if (!list) return false;
    try {
      const next = await api.items.save.mutate({
        expectedRevision: list.revision,
        changes: [{ op: "patch", category: "items", ids: [...ids], patch }],
        note: note.trim() === "" ? null : note,
      });
      store.setList(next);
      notice.show([m.dev_items_applied({ count: ids.length, revision: next.revision })]);
      return true;
    } catch (error: unknown) {
      const info = fail(error);
      if (info.key === "revision_conflict") await reload();
      return false;
    }
  };

  return (
    <section
      className="screen screen-wide ie-screen"
      aria-labelledby="items-title"
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      <div className="screen-header">
        <h1 id="items-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_items()}
        </h1>
        <BackButton />
      </div>
      <p className="lead ie-lead">{m.dev_items_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_items_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="ie-failed">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.dev_items_retry()}
          </button>
        </div>
      ) : null}
      {list ? (
        <>
          <ItemSummary
            list={list}
            sleeping={sleeping.length}
            historyOpen={history !== null}
            onExport={onExport}
            onHistory={onHistory}
          />
          {sleeping.length > 0 ? <SleepingPanel rows={sleeping} onDiscard={discardSleeping} /> : null}
          {exported ? <ExportPanel exported={exported} onClose={() => setExported(null)} /> : null}
          {history ? (
            <ContentHistory
              rows={history}
              locale={locale}
              title={m.dev_items_history()}
              className="ie-panel ie-history"
              headingId="ie-history-title"
              onRestage={restage}
            />
          ) : null}
          <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
          <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          <ItemTabs
            id={tabsId}
            tabs={TABS.map((value) => ({ value, label: TAB_TEXT[value]() }))}
            selected={tab}
            label={m.dev_items_tabs_label()}
            onSelect={setTab}
          />
          {tab === "items" ? (
            <div
              className="ie-split"
              data-view={view}
              role="tabpanel"
              id={`${tabsId}-items-panel`}
              aria-labelledby={`${tabsId}-items`}
            >
              <ItemList
                list={list}
                selected={selected}
                staged={new Set(stage.items.keys())}
                locale={locale}
                onSelect={select}
                onCreate={() => {
                  setCreating(true);
                  setView("detail");
                }}
              />
              <div className="ie-detail-pane">
                {creating ? (
                  <ItemNewForm
                    taken={takenItems}
                    onCreate={create}
                    onCancel={() => {
                      setCreating(false);
                      if (!selected) setView("list");
                    }}
                  />
                ) : selected ? (
                  <ItemDetail
                    list={list}
                    locale={locale}
                    id={selected}
                    draft={draft}
                    isNew={isNew}
                    reverting={reverting}
                    staged={stagedItem !== undefined}
                    origin={row?.origin ?? (isNew ? "created" : null)}
                    override={got?.override ?? null}
                    pack={got?.pack ?? null}
                    codeRef={row?.codeRef ?? false}
                    loading={!isNew && got === null && row !== undefined}
                    issues={itemIssues}
                    advice={itemAdvice}
                    cascade={cascade}
                    checking={stagedItem !== undefined && checked === null}
                    usage={got?.usage ?? null}
                    preview={shownPreview?.result ?? null}
                    previewPending={previewKey !== "" && shownPreview?.key !== previewKey}
                    previewFailed={shownPreview?.failed ?? null}
                    unit={unit}
                    onUnit={setUnit}
                    conflict={conflicts.get(`items/${selected}`) ?? null}
                    onResolve={resolve}
                    onEdit={edit}
                    onDuplicate={duplicate}
                    onRevert={revert}
                    onUnstage={unstage}
                    onSelect={select}
                    onBack={() => setView("list")}
                  />
                ) : (
                  <p className="field-hint ie-pick">{m.dev_items_pick()}</p>
                )}
              </div>
            </div>
          ) : (
            <div role="tabpanel" id={`${tabsId}-${tab}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
              {tab === "taxonomy" ? (
                <ItemTaxonomy list={list} stage={stage} locale={locale} onStage={stageTax} />
              ) : tab === "effects" ? (
                <ItemEffects
                  list={list}
                  staged={stage.effects}
                  locale={locale}
                  onStage={stageEff}
                  onOpenItem={(id) => select(id)}
                />
              ) : (
                <ItemBulk
                  list={list}
                  locale={locale}
                  issues={checked?.result?.issues ?? []}
                  onStage={stageImport}
                  onPatch={applyPatch}
                />
              )}
            </div>
          )}
          {askRisky ? (
            <RiskyConfirm ids={askRisky} onYes={() => void apply(true)} onNo={() => setAskRisky(null)} />
          ) : null}
          <ItemStageBar
            keys={keys}
            check={checkState}
            conflicts={conflicts.size}
            note={note}
            onNote={setNote}
            busy={busy}
            canUndo={staging.canUndo}
            canRedo={staging.canRedo}
            onUndo={staging.undo}
            onRedo={staging.redo}
            onCheck={() => runCheck(stageJson, changes)}
            onApply={() => void apply(false)}
            onClear={() => {
              staging.push(EMPTY_STAGE);
              setConflicts(new Map());
            }}
            onPick={pick}
          />
          {keys.length > 0 ? (
            <DebouncedTask key={`check:${stageJson}`} delay={1000} run={() => runCheck(stageJson, changes)} />
          ) : null}
          {selected && cleanDraft ? (
            <DebouncedTask
              key={`preview:${previewKey}`}
              delay={600}
              run={() => runPreview(previewKey, selected, cleanDraft, unit)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
