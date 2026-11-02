// [대량 도구] 탭(아이템 편집기 WP-7, 설계안 3.8) — JSON·CSV 내보내기·가져오기와 여러 개 고치기.
// - 내보내기: 서버 실효 아이템 통째(items.export) → 팩 파일 모양 JSON 또는 평평한 공통 칸 CSV. 글 칸과 내려받기.
// - 가져오기: 붙여 넣거나 파일을 고르면 기기에서 읽어(@terra/shared parseItemsJson·parseItemsCsv) 틀린 머리·값을 줄 번호로 보이고,
//   새로 / 고침 / 같음 차이를 보인 뒤 [담기]로 담은 변경(초안)에만 넣는다(PLAN 6.4). 묶음 검사는 서버가 한 번 한다(300개까지).
// - 여러 개 고치기: 고른 아이템에 켜기·끄기, 티어, 중분류, 태그 더하기·빼기, 시작 시세 ‰를 서버 patch 명령 하나로 바로 적용한다(서버가
//   지금 실효 항목에 그 칸만 얹고 시작 시세는 BigInt로 반올림 — 낡은 초안이 다른 칸을 덮지 않는다). 촘촘한 줄·작은 입력(D-498).
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  ITEM_BULK_LIMITS,
  ITEM_CATEGORY_IDS,
  ITEM_LIMITS,
  type ItemCategoryId,
  type ItemEditorListResponse,
  type ItemImportProblem,
  type ItemImportResult,
  type ItemJson,
  type ItemPatch,
  importDiff,
  itemsToCsv,
  itemsToJson,
  parseItemsCsv,
  parseItemsJson,
  scaleStartPrice,
} from "@terra/shared/itemEditor";
import { useId, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { CheckField, NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { CATEGORY_TEXT, issueText } from "./itemMessages.ts";
import "./itemEditorTabs.css";

type Format = "json" | "csv";

const PROBLEM_TEXT: Readonly<Record<ItemImportProblem["code"], () => string>> = {
  too_large: m.dev_items_bulk_err_too_large,
  too_many_rows: m.dev_items_bulk_err_too_many_rows,
  empty: m.dev_items_bulk_err_empty,
  bad_json: m.dev_items_bulk_err_bad_json,
  not_entries: m.dev_items_bulk_err_not_entries,
  bad_entry: m.dev_items_bulk_err_bad_entry,
  entry_too_large: m.dev_items_bulk_err_entry_too_large,
  unknown_column: m.dev_items_bulk_err_unknown_column,
  missing_column: m.dev_items_bulk_err_missing_column,
  duplicate_column: m.dev_items_bulk_err_duplicate_column,
  bad_quote: m.dev_items_bulk_err_bad_quote,
  column_count: m.dev_items_bulk_err_column_count,
  duplicate_id: m.dev_items_bulk_err_duplicate_id,
  bad_id: m.dev_items_bulk_err_bad_id,
  not_int: m.dev_items_bulk_err_not_int,
  bad_bool: m.dev_items_bulk_err_bad_bool,
  bad_category: m.dev_items_bulk_err_bad_category,
  missing_value: m.dev_items_bulk_err_missing_value,
};

/** 가져오기 문제 한 줄(줄 번호·열·값) */
function problemText(problem: ItemImportProblem): string {
  const what = PROBLEM_TEXT[problem.code]();
  const where = [problem.column, problem.value].filter((part) => part !== null).join(" · ");
  return problem.row === 0
    ? what
    : m.dev_items_bulk_row({ row: problem.row, text: where === "" ? what : `${what} (${where})` });
}

/** 글 → 형식(첫 글자가 { 또는 [면 JSON) */
const formatOf = (text: string): Format => (/^\s*[[{]/.test(text) ? "json" : "csv");

function ExportPart({ list }: { list: ItemEditorListResponse }) {
  const [category, setCategory] = useState<ItemCategoryId | "all">("all");
  const [result, setResult] = useState<{ format: Format; text: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const run = (format: Format) => {
    setFailed(false);
    api.items.export.query().then(
      (data) => {
        const entries = data.entries.filter((entry) => category === "all" || entry.category === category);
        setResult({ format, text: format === "json" ? itemsToJson(entries) : itemsToCsv(entries) });
      },
      () => setFailed(true),
    );
  };
  const href = result
    ? `data:${result.format === "json" ? "application/json" : "text/csv"};charset=utf-8,${encodeURIComponent(result.text)}`
    : null;
  return (
    <section className="ie-sub" data-part="bulk-export">
      <h3 className="ie-subheading">{m.dev_items_bulk_export()}</h3>
      <div className="ie-tab-tools">
        <SelectField
          label={m.dev_items_field_category()}
          value={category}
          options={[
            { value: "all", label: m.dev_items_bulk_all() },
            ...ITEM_CATEGORY_IDS.map((value) => ({ value, label: CATEGORY_TEXT[value]() })),
          ]}
          onChange={setCategory}
        />
        <button type="button" className="button-small" onClick={() => run("json")}>
          {m.dev_items_bulk_export_json()}
        </button>
        <button type="button" className="button-small" onClick={() => run("csv")}>
          {m.dev_items_bulk_export_csv()}
        </button>
      </div>
      <p className="field-hint">{m.dev_items_bulk_export_hint({ count: list.items.length })}</p>
      {failed ? <p className="field-error">{m.dev_items_err_unknown()}</p> : null}
      {result && href ? (
        <>
          <textarea
            className="input ie-bulk-text"
            readOnly
            value={result.text}
            aria-label={m.dev_items_bulk_export()}
          />
          <a className="ie-link" href={href} download={`items.${result.format}`}>
            {m.dev_items_bulk_download()}
          </a>
        </>
      ) : null}
    </section>
  );
}

function ImportPart({
  issues,
  onStage,
}: {
  /** 지금 담은 변경의 서버 검사 문제(가져온 줄로 보인다) */
  issues: readonly ContentIssueView[];
  onStage: (entries: readonly ItemJson[], current: ReadonlyMap<string, ItemJson>) => void;
}) {
  const textId = useId();
  const [text, setText] = useState("");
  const [read, setRead] = useState<{ result: ItemImportResult; current: Map<string, ItemJson> } | null>(null);
  const [staged, setStaged] = useState(false);
  const parse = () => {
    setStaged(false);
    api.items.export.query().then(
      (data) => {
        const current = new Map(data.entries.map((entry) => [entry.id, entry]));
        const result = formatOf(text) === "json" ? parseItemsJson(text) : parseItemsCsv(text, current);
        setRead({ result, current });
      },
      () => setRead(null),
    );
  };
  const diff = read ? importDiff(read.result.entries, read.current) : null;
  const rowOf = (id: string | null) => (id === null ? undefined : read?.result.rows[id]);
  const rowIssues = staged ? issues.filter((issue) => rowOf(issue.id) !== undefined) : [];
  const ok = read !== null && read.result.problems.length === 0 && diff !== null;
  return (
    <section className="ie-sub" data-part="bulk-import">
      <h3 className="ie-subheading">{m.dev_items_bulk_import()}</h3>
      <p className="field-hint">
        {m.dev_items_bulk_import_hint({
          rows: ITEM_BULK_LIMITS.rowsMax,
          kib: ITEM_BULK_LIMITS.importBytesMax / 1024,
        })}
      </p>
      <label className="field-label" htmlFor={textId}>
        {m.dev_items_bulk_paste()}
      </label>
      <textarea
        id={textId}
        className="input ie-bulk-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="ie-tab-tools">
        <input
          type="file"
          accept=".json,.csv,application/json,text/csv"
          aria-label={m.dev_items_bulk_file()}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void file.text().then(setText);
          }}
        />
        <button
          type="button"
          className="button-small"
          aria-disabled={text.trim() === ""}
          onClick={text.trim() === "" ? undefined : parse}
        >
          {m.dev_items_bulk_read()}
        </button>
      </div>
      {read && read.result.problems.length > 0 ? (
        <ul className="ie-plain ie-errors ie-bulk-errors" data-part="bulk-problems">
          {read.result.problems.slice(0, 100).map((problem, index) => (
            <li key={`${problem.row}-${index}`} className="field-error">
              {problemText(problem)}
            </li>
          ))}
        </ul>
      ) : null}
      {diff && read && read.result.problems.length === 0 ? (
        <p className="field-hint" data-part="bulk-diff">
          {m.dev_items_bulk_diff({
            added: diff.added.length,
            changed: diff.changed.length,
            same: diff.same.length,
          })}
        </p>
      ) : null}
      {ok && diff.added.length + diff.changed.length > 0 ? (
        <button
          type="button"
          className="button-small button-primary"
          onClick={() => {
            const ids = new Set([...diff.added, ...diff.changed]);
            onStage(
              read.result.entries.filter((entry) => ids.has(entry.id)),
              read.current,
            );
            setStaged(true);
          }}
        >
          {m.dev_items_bulk_stage({ count: diff.added.length + diff.changed.length })}
        </button>
      ) : null}
      {staged ? <p className="field-hint">{m.dev_items_bulk_staged()}</p> : null}
      {rowIssues.length > 0 ? (
        <ul className="ie-plain ie-errors ie-bulk-errors" data-part="bulk-check">
          {rowIssues.slice(0, 100).map((issue, index) => (
            <li key={`${issue.id ?? ""}-${index}`} className="field-error">
              {m.dev_items_bulk_row({
                row: rowOf(issue.id) ?? 0,
                text: `${issue.id ?? ""} ${issue.path ?? ""}: ${issueText(issue)}`,
              })}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="field-hint">{m.dev_items_bulk_columns()}</p>
    </section>
  );
}

/** 여러 개 고치기 입력(빈 칸 = 그대로) */
interface PatchForm {
  readonly enabled: "keep" | "on" | "off";
  readonly tier: number | undefined;
  readonly subcategory: string;
  readonly tagsAdd: string;
  readonly tagsRemove: string;
  readonly startPricePm: number | undefined;
}

const EMPTY_FORM: PatchForm = {
  enabled: "keep",
  tier: undefined,
  subcategory: "keep",
  tagsAdd: "",
  tagsRemove: "",
  startPricePm: undefined,
};

const tagList = (text: string): string[] =>
  text
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");

function patchOf(form: PatchForm): ItemPatch {
  return {
    ...(form.enabled === "keep" ? {} : { enabled: form.enabled === "on" }),
    ...(form.tier === undefined ? {} : { tier: form.tier }),
    ...(form.subcategory === "keep"
      ? {}
      : { subcategory: form.subcategory === "none" ? null : form.subcategory }),
    ...(tagList(form.tagsAdd).length > 0 ? { tagsAdd: tagList(form.tagsAdd) } : {}),
    ...(tagList(form.tagsRemove).length > 0 ? { tagsRemove: tagList(form.tagsRemove) } : {}),
    ...(form.startPricePm === undefined || form.startPricePm === 0
      ? {}
      : { startPricePm: form.startPricePm }),
  };
}

function PatchPart({
  list,
  locale,
  onApply,
}: {
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  onApply: (ids: readonly string[], patch: ItemPatch) => Promise<boolean>;
}) {
  const [category, setCategory] = useState<ItemCategoryId | "all">("all");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [form, setForm] = useState<PatchForm>(EMPTY_FORM);
  const [asking, setAsking] = useState(false);
  const shown = list.items.filter((row) => category === "all" || row.category === category);
  const patch = patchOf(form);
  const empty = Object.keys(patch).length === 0;
  const ids = [...picked];
  const ready = !empty && ids.length > 0 && ids.length <= ITEM_BULK_LIMITS.patchIdsMax;
  const sample = list.items.find((row) => picked.has(row.id));
  return (
    <section className="ie-sub" data-part="bulk-patch">
      <h3 className="ie-subheading">{m.dev_items_bulk_patch()}</h3>
      <p className="field-hint">{m.dev_items_bulk_patch_hint()}</p>
      <div className="ie-tab-tools">
        <SelectField
          label={m.dev_items_field_category()}
          value={category}
          options={[
            { value: "all", label: m.dev_items_bulk_all() },
            ...ITEM_CATEGORY_IDS.map((value) => ({ value, label: CATEGORY_TEXT[value]() })),
          ]}
          onChange={setCategory}
        />
        <button
          type="button"
          className="button-small"
          onClick={() => setPicked(new Set([...picked, ...shown.map((row) => row.id)]))}
        >
          {m.dev_items_bulk_pick_all({ count: shown.length })}
        </button>
        <button type="button" className="button-small" onClick={() => setPicked(new Set())}>
          {m.dev_items_bulk_pick_none()}
        </button>
      </div>
      <ul className="ie-plain ie-bulk-pick" aria-label={m.dev_items_bulk_patch()}>
        {shown.map((row) => (
          <li key={row.id}>
            <CheckField
              label={`${row.name[locale]} · ${row.id}`}
              checked={picked.has(row.id)}
              onChange={(on) => {
                const next = new Set(picked);
                if (on) next.add(row.id);
                else next.delete(row.id);
                setPicked(next);
              }}
            />
          </li>
        ))}
      </ul>
      <div className="ie-grid ie-grid-tight">
        <SelectField
          label={m.dev_items_field_enabled()}
          value={form.enabled}
          options={[
            { value: "keep", label: m.dev_items_bulk_keep() },
            { value: "on", label: m.dev_items_bulk_on() },
            { value: "off", label: m.dev_items_bulk_off() },
          ]}
          onChange={(enabled) => setForm({ ...form, enabled })}
        />
        <NumberField
          label={m.dev_items_field_tier()}
          value={form.tier}
          min={ITEM_LIMITS.tier.min}
          max={ITEM_LIMITS.tier.max}
          optional
          onChange={(tier) => setForm({ ...form, tier })}
        />
        <SelectField
          label={m.dev_items_field_subcategory()}
          value={form.subcategory}
          options={[
            { value: "keep", label: m.dev_items_bulk_keep() },
            { value: "none", label: m.dev_items_none() },
            ...list.subcategories.map((row) => ({
              value: row.entry.id,
              label: `${CATEGORY_TEXT[row.entry.major]()} · ${row.entry.name[locale]}`,
            })),
          ]}
          onChange={(subcategory) => setForm({ ...form, subcategory })}
        />
        <TextField
          label={m.dev_items_bulk_tags_add()}
          value={form.tagsAdd}
          maxLength={400}
          onChange={(tagsAdd) => setForm({ ...form, tagsAdd })}
        />
        <TextField
          label={m.dev_items_bulk_tags_remove()}
          value={form.tagsRemove}
          maxLength={400}
          onChange={(tagsRemove) => setForm({ ...form, tagsRemove })}
        />
        <NumberField
          label={m.dev_items_bulk_value_pm()}
          value={form.startPricePm}
          min={ITEM_BULK_LIMITS.startPricePm.min}
          max={ITEM_BULK_LIMITS.startPricePm.max}
          optional
          hint={
            sample && form.startPricePm
              ? m.dev_items_bulk_value_example({
                  id: sample.id,
                  before: sample.startPrice,
                  after: scaleStartPrice(sample.startPrice, form.startPricePm),
                })
              : m.dev_items_bulk_value_hint()
          }
          onChange={(startPricePm) => setForm({ ...form, startPricePm })}
        />
      </div>
      <p className="field-hint">
        {m.dev_items_bulk_picked({ count: ids.length, max: ITEM_BULK_LIMITS.patchIdsMax })}
      </p>
      {asking ? (
        <div className="ie-confirm" role="alertdialog" aria-labelledby="ie-bulk-ask">
          <p id="ie-bulk-ask">{m.dev_items_bulk_confirm({ count: ids.length })}</p>
          <div className="ie-inline-actions">
            <button
              type="button"
              className="button-small button-primary ie-bulk-confirm"
              onClick={() =>
                void onApply(ids, patch).then((done) => {
                  setAsking(false);
                  if (done) {
                    setForm(EMPTY_FORM);
                    setPicked(new Set());
                  }
                })
              }
            >
              {m.dev_items_confirm_yes()}
            </button>
            <button type="button" className="button-small" onClick={() => setAsking(false)}>
              {m.dev_items_confirm_no()}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button-small button-primary"
          aria-disabled={!ready}
          onClick={ready ? () => setAsking(true) : undefined}
        >
          {m.dev_items_bulk_patch_apply({ count: ids.length })}
        </button>
      )}
    </section>
  );
}

export function ItemBulk({
  list,
  locale,
  issues,
  onStage,
  onPatch,
}: {
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  issues: readonly ContentIssueView[];
  onStage: (entries: readonly ItemJson[], current: ReadonlyMap<string, ItemJson>) => void;
  onPatch: (ids: readonly string[], patch: ItemPatch) => Promise<boolean>;
}) {
  const headingId = useId();
  return (
    <section className="ie-panel ie-bulk" aria-labelledby={headingId}>
      <h2 id={headingId} className="ie-heading">
        {m.dev_items_tab_bulk()}
      </h2>
      <ExportPart list={list} />
      <ImportPart issues={issues} onStage={onStage} />
      <PatchPart list={list} locale={locale} onApply={onPatch} />
    </section>
  );
}
