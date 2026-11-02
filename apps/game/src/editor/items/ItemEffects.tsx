// [효과 사전] 탭(아이템 편집기 WP-6, docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-02)") — 스킬·아이템이 같이 쓰는 효과 사전
// (D-425)을 고치고 새로 만든다. 고친 것은 아이템과 같은 담은 변경 묶음에 들어가 [적용] 한 번에 간다(같은 덮어쓰기 층·판). 효과마다 그
// 효과를 쓰는 아이템·스킬을 보인다(D-425 도감). 1차 스탯 버프·배타 묶음(D-472)은 전투 판정이 아직 읽지 않는다고 칸에 적는다.
// 촘촘한 표 줄 + 아래 편집 칸(D-498 개발자 화면 촘촘하게). 토큰만 쓴다.
import {
  EFFECT_COMBAT_STAT_IDS,
  EFFECT_KIND_IDS,
  EFFECT_LIMITS,
  EFFECT_PRIMARY_STAT_IDS,
  EFFECT_STATUS_IDS,
  type EffectJson,
  type EffectStatId,
  ITEM_LIMITS,
  ITEM_PRIMARY_CODES,
  type ItemEditorListResponse,
  type TaxonomyRow,
} from "@terra/shared/itemEditor";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { effectKindText } from "../content/contentEditorEffects.tsx";
import { CheckField, NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { CONTENT_ID_PATTERN, sameJson } from "../content/contentEditorModel.ts";
import { NewEntryForm } from "./ItemTaxonomy.tsx";
import { effectStatText, effectStatusText, isPrimaryEffectStat } from "./itemEffectsText.ts";
import { ORIGIN_TEXT, PRIMARY_TEXT, milliText } from "./itemMessages.ts";
import type { Staged } from "./itemModel.ts";
import { effectRows } from "./itemRebase.ts";
import "./itemEditorTabs.css";

type OnStage = (id: string, next: Staged<EffectJson> | null) => void;

/** 새 효과 틀(꺼진 채로: 덜 만든 효과가 전투에 나오지 않게) */
const templateOf = (id: string, name: { ko: string; en: string }): EffectJson => ({
  id,
  name,
  kind: "buff",
  stat: "attack",
  valueMode: "permille",
  durationMs: 6000,
  tickMs: 0,
  stacking: "refresh",
  maxStacks: 1,
  enabled: false,
});

/** 종류를 바꾸면 그 종류에 맞춘다: 수치는 버프·디버프만, 상태이상 종류·저항은 상태이상만 */
function withKind(effect: EffectJson, kind: EffectJson["kind"]): EffectJson {
  const { stat, status, resist, ...rest } = effect;
  const buff = kind === "buff" || kind === "debuff";
  return {
    ...rest,
    kind,
    ...(buff ? { stat: stat ?? "attack" } : {}),
    ...(kind === "status" ? { status: status ?? "stun", ...(resist ? { resist } : {}) } : {}),
  };
}

/** 선택 칸(글): 빈 값이면 뺀다 */
function withText(effect: EffectJson, key: "capCode" | "exclusive", value: string): EffectJson {
  const { [key]: _drop, ...rest } = effect;
  return value.trim() === "" ? rest : { ...rest, [key]: value.trim() };
}

/** 코드 칸(배타 묶음·상한 코드)이 ID 형식이 아니면 문구 */
const badId = (value: string | undefined): string | undefined =>
  value !== undefined && !CONTENT_ID_PATTERN.test(value) ? m.dev_items_new_id_invalid() : undefined;

function EffectForm({
  draft,
  row,
  list,
  locale,
  onPut,
}: {
  draft: EffectJson;
  row: TaxonomyRow<EffectJson> | null;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  onPut: (next: EffectJson) => void;
}) {
  const L = EFFECT_LIMITS;
  const buff = draft.kind === "buff" || draft.kind === "debuff";
  const peers = effectRows(list)
    .filter(
      (other) => draft.exclusive && other.entry.exclusive === draft.exclusive && other.entry.id !== draft.id,
    )
    .map((other) => other.entry.name[locale]);
  return (
    <div className="ie-tab-form" data-effect={draft.id}>
      <div className="ie-grid">
        <TextField
          label={m.dev_items_field_name_ko()}
          value={draft.name.ko}
          maxLength={ITEM_LIMITS.nameMax}
          onChange={(ko) => onPut({ ...draft, name: { ...draft.name, ko } })}
        />
        <TextField
          label={m.dev_items_field_name_en()}
          value={draft.name.en}
          maxLength={ITEM_LIMITS.nameMax}
          onChange={(en) => onPut({ ...draft, name: { ...draft.name, en } })}
        />
        <SelectField
          label={m.dev_items_fx_field_kind()}
          value={draft.kind}
          options={EFFECT_KIND_IDS.map((value) => ({ value, label: effectKindText(value) }))}
          onChange={(kind) => onPut(withKind(draft, kind))}
        />
        {buff ? (
          <SelectField
            label={m.dev_items_fx_field_stat()}
            value={draft.stat ?? "attack"}
            options={[
              ...EFFECT_COMBAT_STAT_IDS.map((value) => ({ value, label: effectStatText(value) })),
              ...EFFECT_PRIMARY_STAT_IDS.map((value) => ({
                value,
                label: m.dev_items_fx_primary_suffix({ stat: effectStatText(value) }),
              })),
            ]}
            onChange={(stat: EffectStatId) => onPut({ ...draft, stat })}
          />
        ) : null}
        <SelectField
          label={m.dev_items_fx_field_value_mode()}
          value={draft.valueMode}
          options={[
            { value: "flat", label: m.dev_items_fx_value_flat() },
            { value: "permille", label: m.dev_items_fx_value_permille() },
          ]}
          onChange={(valueMode) => onPut({ ...draft, valueMode })}
        />
        <NumberField
          label={m.dev_items_fx_field_duration()}
          value={draft.durationMs}
          min={L.durationMs.min}
          max={L.durationMs.max}
          onChange={(durationMs) => onPut({ ...draft, durationMs: durationMs ?? 0 })}
        />
        <NumberField
          label={m.dev_items_fx_field_tick()}
          value={draft.tickMs}
          min={L.tickMs.min}
          max={L.tickMs.max}
          onChange={(tickMs) => onPut({ ...draft, tickMs: tickMs ?? 0 })}
        />
        <SelectField
          label={m.dev_items_fx_field_stacking()}
          value={draft.stacking}
          options={[
            { value: "refresh", label: m.dev_items_stacking_refresh() },
            { value: "stack", label: m.dev_items_stacking_stack() },
            { value: "ignore", label: m.dev_items_stacking_ignore() },
          ]}
          onChange={(stacking) => onPut({ ...draft, stacking })}
        />
        <NumberField
          label={m.dev_items_fx_field_max_stacks()}
          value={draft.maxStacks}
          min={L.maxStacks.min}
          max={L.maxStacks.max}
          onChange={(maxStacks) => onPut({ ...draft, maxStacks: maxStacks ?? 1 })}
        />
        {draft.kind === "status" ? (
          <SelectField
            label={m.dev_items_fx_field_status()}
            value={draft.status ?? "stun"}
            options={EFFECT_STATUS_IDS.map((value) => ({ value, label: effectStatusText(value) }))}
            onChange={(status) => onPut({ ...draft, status })}
          />
        ) : null}
        <TextField
          label={m.dev_items_fx_field_exclusive()}
          value={draft.exclusive ?? ""}
          maxLength={48}
          problem={badId(draft.exclusive)}
          onChange={(value) => onPut(withText(draft, "exclusive", value))}
        />
        <TextField
          label={m.dev_items_fx_field_cap_code()}
          value={draft.capCode ?? ""}
          maxLength={48}
          problem={badId(draft.capCode)}
          onChange={(value) => onPut(withText(draft, "capCode", value))}
        />
      </div>
      {buff && draft.stat && isPrimaryEffectStat(draft.stat) ? (
        <p className="field-hint ie-warn">{m.dev_items_fx_primary_hint()}</p>
      ) : null}
      <p className="field-hint">{m.dev_items_fx_exclusive_hint()}</p>
      {peers.length > 0 ? (
        <p className="field-hint">{m.dev_items_fx_exclusive_peers({ list: peers.join(", ") })}</p>
      ) : null}
      {draft.kind === "status" ? (
        <fieldset className="ie-sub">
          <legend className="field-label">{m.dev_items_fx_field_resist()}</legend>
          <CheckField
            label={m.dev_items_fx_resist_on()}
            checked={draft.resist !== undefined}
            onChange={(on) => {
              const { resist: _drop, ...rest } = draft;
              onPut(
                on ? { ...rest, resist: { cap: 500, halfConstant: 100, weights: [0, 0, 0, 0, 0, 0] } } : rest,
              );
            }}
          />
          {draft.resist ? (
            <div className="ie-grid ie-grid-tight">
              <NumberField
                label={m.dev_items_fx_field_resist_cap()}
                value={draft.resist.cap}
                min={L.resistCap.min}
                max={L.resistCap.max}
                onChange={(cap) =>
                  draft.resist && onPut({ ...draft, resist: { ...draft.resist, cap: cap ?? 0 } })
                }
              />
              <NumberField
                label={m.dev_items_fx_field_resist_half()}
                value={draft.resist.halfConstant}
                min={L.halfConstant.min}
                max={L.halfConstant.max}
                onChange={(halfConstant) =>
                  draft.resist &&
                  onPut({ ...draft, resist: { ...draft.resist, halfConstant: halfConstant ?? 1 } })
                }
              />
              {ITEM_PRIMARY_CODES.map((code, index) => (
                <NumberField
                  key={code}
                  label={m.dev_items_fx_field_resist_weight({ stat: PRIMARY_TEXT[code]() })}
                  value={draft.resist?.weights[index] ?? 0}
                  min={L.weight.min}
                  max={L.weight.max}
                  onChange={(value) => {
                    const resist = draft.resist;
                    if (!resist) return;
                    const weights = ITEM_PRIMARY_CODES.map((_, at) =>
                      at === index ? (value ?? 0) : (resist.weights[at] ?? 0),
                    );
                    onPut({ ...draft, resist: { ...resist, weights } });
                  }}
                />
              ))}
            </div>
          ) : null}
        </fieldset>
      ) : null}
      <CheckField
        label={m.dev_items_field_enabled()}
        checked={draft.enabled}
        onChange={(enabled) => onPut({ ...draft, enabled })}
      />
      {row && row.origin !== "pack" ? <p className="field-hint">{ORIGIN_TEXT[row.origin]()}</p> : null}
    </div>
  );
}

function UsageList({
  id,
  list,
  locale,
  onOpenItem,
}: {
  id: string;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  onOpenItem: (id: string) => void;
}) {
  const usage = list.effectUsage?.[id] ?? { items: [], skills: [] };
  const itemName = new Map(list.items.map((row) => [row.id, row.name[locale]]));
  const skillName = new Map(list.skills.map((skill) => [skill.id, skill.name[locale]]));
  if (usage.items.length + usage.skills.length === 0)
    return <p className="field-hint">{m.dev_items_fx_usage_none()}</p>;
  return (
    <dl className="ie-facts" data-part="effect-usage">
      <dt>{m.dev_items_fx_usage_items()}</dt>
      <dd>
        {usage.items.length === 0 ? "-" : null}
        {usage.items.map((item) => (
          <button key={item} type="button" className="ie-chip ie-fx-link" onClick={() => onOpenItem(item)}>
            {itemName.get(item) ?? item}
          </button>
        ))}
      </dd>
      <dt>{m.dev_items_fx_usage_skills()}</dt>
      <dd>
        {usage.skills.length === 0 ? "-" : null}
        {usage.skills.map((skill) => (
          <span key={skill} className="ie-chip">
            {skillName.get(skill) ?? skill}
          </span>
        ))}
        {usage.skills.length > 0 ? (
          <AppLink className="ie-link" to={{ route: "dev_skills" }}>
            {m.dev_items_open_skill_editor()}
          </AppLink>
        ) : null}
      </dd>
    </dl>
  );
}

/** 효과 한 줄 요약 칸(표) */
function summaryOf(effect: EffectJson): { stat: string; duration: string } {
  return {
    stat: effect.stat ? effectStatText(effect.stat) : effect.status ? effectStatusText(effect.status) : "-",
    duration: effect.durationMs === 0 ? m.dev_items_duration_battle() : `${milliText(effect.durationMs)}s`,
  };
}

export function ItemEffects({
  list,
  staged,
  locale,
  onStage,
  onOpenItem,
}: {
  list: ItemEditorListResponse;
  staged: ReadonlyMap<string, Staged<EffectJson>>;
  locale: "ko" | "en";
  onStage: OnStage;
  onOpenItem: (id: string) => void;
}) {
  const headingId = useId();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<EffectJson["kind"] | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = effectRows(list);
  const created = [...staged].filter(
    ([id, item]) => item.base === null && !rows.some((row) => row.entry.id === id),
  );
  const all = [
    ...rows.map((row) => ({ id: row.entry.id, row })),
    ...created.map(([id]) => ({ id, row: null as TaxonomyRow<EffectJson> | null })),
  ];
  const lower = text.trim().toLocaleLowerCase();
  const shown = all.filter(({ id, row }) => {
    const draft = staged.get(id)?.entry ?? row?.entry;
    if (!draft) return false;
    if (kind !== "all" && draft.kind !== kind) return false;
    return (
      lower === "" ||
      id.includes(lower) ||
      draft.name.ko.toLocaleLowerCase().includes(lower) ||
      draft.name.en.toLocaleLowerCase().includes(lower)
    );
  });
  const taken = new Set([...all.map((item) => item.id), ...(list.retired.effects ?? [])]);
  const put = (row: TaxonomyRow<EffectJson> | null, next: EffectJson) => {
    const base = row?.entry ?? null;
    onStage(
      next.id,
      base !== null && sameJson(next, base)
        ? null
        : { op: "put", entry: next, base, baseHash: row?.hash ?? null },
    );
  };
  const current = all.find((item) => item.id === selected) ?? null;
  const currentStaged = selected ? staged.get(selected) : undefined;
  const draft = currentStaged?.entry ?? current?.row?.entry ?? null;
  return (
    <section className="ie-panel ie-fx" aria-labelledby={headingId}>
      <h2 id={headingId} className="ie-heading">
        {m.dev_items_fx_title()} <span className="ie-dim">{all.length}</span>
      </h2>
      <p className="field-hint">{m.dev_items_fx_lead()}</p>
      <div className="ie-tab-tools">
        <TextField label={m.dev_items_fx_search()} value={text} maxLength={60} onChange={setText} />
        <SelectField
          label={m.dev_items_fx_field_kind()}
          value={kind}
          options={[
            { value: "all", label: m.dev_items_fx_kind_all() },
            ...EFFECT_KIND_IDS.map((value) => ({ value, label: effectKindText(value) })),
          ]}
          onChange={setKind}
        />
      </div>
      <div className="ie-table-wrap">
        <table className="ie-table ie-fx-table">
          <thead>
            <tr>
              <th scope="col">{m.dev_items_fx_col_name()}</th>
              <th scope="col">{m.dev_items_fx_field_kind()}</th>
              <th scope="col">{m.dev_items_fx_field_stat()}</th>
              <th scope="col">{m.dev_items_fx_col_duration()}</th>
              <th scope="col">{m.dev_items_fx_field_exclusive()}</th>
              <th scope="col">{m.dev_items_fx_usage()}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ id, row }) => {
              const entry = staged.get(id)?.entry ?? row?.entry;
              if (!entry) return null;
              const usage = list.effectUsage?.[id];
              const summary = summaryOf(entry);
              return (
                <tr
                  key={id}
                  data-entry={id}
                  data-selected={id === selected ? "" : undefined}
                  data-staged={staged.has(id) ? "" : undefined}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="ie-fx-pick"
                      aria-pressed={id === selected}
                      onClick={() => setSelected(id)}
                    >
                      {entry.name[locale]}
                    </button>{" "}
                    <span className="ie-dim">{id}</span>
                    {entry.enabled ? null : <span className="ie-chip">{m.dev_items_disabled()}</span>}
                    {staged.has(id) ? (
                      <span className="ie-chip ie-chip-staged">{m.dev_items_staged_chip()}</span>
                    ) : null}
                    {row && row.origin !== "pack" ? (
                      <span className={`ie-chip ie-origin-${row.origin}`}>{ORIGIN_TEXT[row.origin]()}</span>
                    ) : null}
                    {row ? null : <span className="ie-chip ie-origin-created">{ORIGIN_TEXT.created()}</span>}
                  </th>
                  <td>{effectKindText(entry.kind)}</td>
                  <td>{summary.stat}</td>
                  <td>{summary.duration}</td>
                  <td>{entry.exclusive ?? "-"}</td>
                  <td>
                    {m.dev_items_fx_used({
                      items: usage?.items.length ?? 0,
                      skills: usage?.skills.length ?? 0,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 ? <p className="field-hint">{m.dev_items_fx_empty()}</p> : null}
      {draft && selected ? (
        <section className="ie-sub" aria-label={draft.name[locale]}>
          <h3 className="ie-subheading">
            {draft.name[locale]} <span className="ie-dim">{selected}</span>
          </h3>
          {currentStaged?.op === "revert" ? (
            <p className="field-hint">{m.dev_items_revert_staged()}</p>
          ) : (
            <EffectForm
              draft={draft}
              row={current?.row ?? null}
              list={list}
              locale={locale}
              onPut={(next) => put(current?.row ?? null, next)}
            />
          )}
          <h4 className="ie-subheading">{m.dev_items_fx_usage()}</h4>
          <UsageList id={selected} list={list} locale={locale} onOpenItem={onOpenItem} />
          <div className="ie-inline-actions">
            {currentStaged ? (
              <button type="button" className="button-small" onClick={() => onStage(selected, null)}>
                {m.dev_items_unstage()}
              </button>
            ) : null}
            {current?.row && current.row.origin !== "pack" && currentStaged?.op !== "revert" ? (
              <button
                type="button"
                className="button-small"
                onClick={() => {
                  const row = current.row;
                  if (row)
                    onStage(selected, { op: "revert", entry: null, base: row.entry, baseHash: row.hash });
                }}
              >
                {current.row.origin === "created" ? m.dev_items_delete() : m.dev_items_revert()}
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="field-hint">{m.dev_items_fx_pick()}</p>
      )}
      <details className="ie-tax-new">
        <summary>{m.dev_items_fx_new()}</summary>
        <NewEntryForm
          taken={taken}
          onCreate={(id, name) => {
            onStage(id, { op: "put", entry: templateOf(id, name), base: null, baseHash: null });
            setSelected(id);
          }}
        />
      </details>
    </section>
  );
}
