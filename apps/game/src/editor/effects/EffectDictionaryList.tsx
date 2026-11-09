// 효과 사전 왼쪽 목록(공용 EntryList) — 찾기(ID·이름)·거르기(고침·새로 만듦 · 꺼짐 · 쓰는 곳 없음 · 담은 것만 · 종류)·[새 효과].
// 줄마다 종류 표지·이름·ID·한 줄 요약(바꾸는 수치·지속·쓰는 곳 수)·표지(담음·고침·새로 만듦·꺼짐). docs/adr/2026-11-01-item-editor.md
// "바뀜 (2026-11-09)"
import { EFFECT_KIND_IDS, type EffectJson, type EffectUsage } from "@terra/shared/itemEditor";
import type { Ref } from "react";
import { m } from "../../paraglide/messages.js";
import { effectKindText } from "../content/contentEditorEffects.tsx";
import { type EntryBadge, EntryList, FilterChip, FilterSelect } from "../content/contentEditorList.tsx";
import {
  EMPTY_EFFECT_QUERY,
  type EffectFilter,
  type EffectQuery,
  type ListedEffect,
} from "./effectDictionaryModel.ts";
import { ORIGIN_TEXT, durationText, effectStatText, effectStatusText } from "./effectDictionaryText.ts";

const FILTER_TEXT: Readonly<Record<Exclude<EffectFilter, "all">, () => string>> = {
  changed: m.dev_effects_filter_changed,
  disabled: m.dev_effects_filter_disabled,
  unused: m.dev_effects_filter_unused,
};
const FILTERS = ["changed", "disabled", "unused"] as const;

/** 한 줄 요약: 바꾸는 수치(상태이상) · 지속 · 쓰는 곳 수 */
function summaryOf(entry: EffectJson, usage: EffectUsage | undefined): string {
  return m.dev_effects_row_summary({
    stat: entry.stat ? effectStatText(entry.stat) : entry.status ? effectStatusText(entry.status) : "-",
    duration: durationText(entry.durationMs),
    used: m.dev_effects_used({ items: usage?.items.length ?? 0, skills: usage?.skills.length ?? 0 }),
  });
}

export function EffectDictionaryList({
  shown,
  total,
  selected,
  staged,
  usage,
  locale,
  query,
  onQuery,
  searchRef,
  onSelect,
  onNew,
}: {
  /** 찾기·거르기를 거친 효과(화면이 거른다: Alt+↑↓ 이전·다음과 같은 차례) */
  shown: readonly ListedEffect[];
  total: number;
  selected: string | null;
  staged: ReadonlySet<string>;
  usage: Readonly<Record<string, EffectUsage>>;
  locale: "ko" | "en";
  query: EffectQuery;
  onQuery: (patch: Partial<EffectQuery>) => void;
  searchRef: Ref<HTMLInputElement>;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const active = [query.filter !== "all", query.kind !== "all", query.stagedOnly].filter(Boolean).length;
  const rows = shown.map(({ id, entry, row }) => {
    const origin = row?.origin ?? "created";
    const badges: EntryBadge[] = [];
    if (staged.has(id)) badges.push({ key: "staged", label: m.dev_content_badge_staged(), tone: "staged" });
    if (origin !== "pack")
      badges.push({
        key: "origin",
        label: ORIGIN_TEXT[origin](),
        tone: origin === "created" ? "created" : "changed",
        className: `fx-origin-${origin}`,
      });
    if (!entry.enabled) badges.push({ key: "off", label: m.dev_items_disabled(), tone: "off" });
    return {
      id,
      name: entry.name[locale],
      tag: { label: effectKindText(entry.kind), value: entry.kind },
      summary: summaryOf(entry, usage[id]),
      badges,
      staged: staged.has(id),
      changed: origin !== "pack",
      off: !entry.enabled,
    };
  });
  return (
    <EntryList
      label={m.dev_effects_list_label()}
      rows={rows}
      total={total}
      selected={selected}
      onSelect={onSelect}
      search={query.text}
      onSearch={(text) => onQuery({ text })}
      searchPlaceholder={m.dev_effects_search_placeholder()}
      searchRef={searchRef}
      activeFilters={active}
      onReset={() => onQuery(EMPTY_EFFECT_QUERY)}
      itemClass="fx-item"
      dataKey="effect"
      emptyText={m.dev_effects_empty()}
      actions={
        <button type="button" className="fx-new-button" onClick={onNew}>
          {m.dev_effects_new()}
        </button>
      }
      filters={
        <>
          {FILTERS.map((option) => (
            <FilterChip
              key={option}
              className="fx-filter"
              label={FILTER_TEXT[option]()}
              pressed={query.filter === option}
              onToggle={(on) => onQuery({ filter: on ? option : "all" })}
            />
          ))}
          <FilterChip
            label={m.dev_content_filter_staged()}
            pressed={query.stagedOnly}
            onToggle={(stagedOnly) => onQuery({ stagedOnly })}
          />
          <FilterSelect
            label={m.dev_effects_field_kind()}
            value={query.kind}
            options={[
              { value: "all" as const, label: m.dev_effects_kind_all() },
              ...EFFECT_KIND_IDS.map((value) => ({ value, label: effectKindText(value) })),
            ]}
            onChange={(kind) => onQuery({ kind })}
          />
        </>
      }
    />
  );
}
