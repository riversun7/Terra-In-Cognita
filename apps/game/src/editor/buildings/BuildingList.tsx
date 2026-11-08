// 건물 편집기 왼쪽 시설 목록(공용 EntryList, 2026-11-08 화면 개편) — 옛 관리자 건물 편집기 표(건물·카테고리·티어·유닛)의 칸을 줄 하나에:
// 단계 표지 · 이름 · ID · 한 줄 요약(최고 레벨 · 레벨당 자리 · Lv1 재료) · 표지(담음·덮어씀·새로 만듦·되돌림). 시설은 늘 켜져 있어 꺼짐이 없다.
// 찾기(이름·ID·재료 이름), 거르기(단계 · 덮어쓴 것만 · 담은 것만 · 채집 시설만). docs/adr/2026-11-02-building-editor.md
import {
  type BuildingEditorFacility,
  type BuildingEditorListResponse,
  FACILITY_STAGE_IDS,
  type FacilityJson,
  type FacilityStageId,
} from "@terra/shared/buildingEditor";
import type { Ref } from "react";
import { m } from "../../paraglide/messages.js";
import {
  type EntryBadge,
  type EntryRow,
  EntryList,
  FilterChip,
  FilterSelect,
} from "../content/contentEditorList.tsx";
import { ORIGIN_TEXT, STAGE_TEXT } from "./buildingMessages.ts";
import { type BuildingStage, maxLevelOf } from "./buildingModel.ts";

/** 목록 찾기·거르기 */
export interface BuildingQuery {
  readonly text: string;
  readonly stage: FacilityStageId | "all";
  readonly editedOnly: boolean;
  readonly stagedOnly: boolean;
  readonly gatherOnly: boolean;
}

export const EMPTY_BUILDING_QUERY: BuildingQuery = {
  text: "",
  stage: "all",
  editedOnly: false,
  stagedOnly: false,
  gatherOnly: false,
};

/** 보이는 시설(담은 초안 값으로 거른다). 낱말 여럿이면 모두 맞는 것 */
export function filterFacilities(
  list: BuildingEditorListResponse,
  stage: BuildingStage,
  query: BuildingQuery,
  locale: "ko" | "en",
): { row: BuildingEditorFacility; shown: FacilityJson }[] {
  const nameOf = new Map(list.items.map((item) => [item.id, item.name[locale]]));
  const words = query.text
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  return list.facilities
    .map((row) => {
      const staged = stage.facilities.get(row.entry.id);
      return { row, shown: staged?.op === "put" ? staged.entry : row.entry };
    })
    .filter(({ row, shown }) => {
      if (query.stage !== "all" && shown.stage !== query.stage) return false;
      if (query.editedOnly && row.origin === "pack") return false;
      if (query.stagedOnly && !stage.facilities.has(row.entry.id)) return false;
      if (query.gatherOnly && shown.gather === undefined) return false;
      if (words.length === 0) return true;
      const materials = (shown.build?.levels ?? []).flatMap((band) =>
        band.materials.map((stack) => nameOf.get(stack.item) ?? stack.item),
      );
      const hay = [row.entry.id, shown.name.ko, shown.name.en, ...materials].join(" ").toLocaleLowerCase();
      return words.every((word) => hay.includes(word));
    });
}

export function BuildingList({
  list,
  rows,
  locale,
  selected,
  stage,
  query,
  onQuery,
  searchRef,
  onSelect,
}: {
  list: BuildingEditorListResponse;
  rows: readonly { row: BuildingEditorFacility; shown: FacilityJson }[];
  locale: "ko" | "en";
  selected: string | null;
  stage: BuildingStage;
  query: BuildingQuery;
  onQuery: (patch: Partial<BuildingQuery>) => void;
  searchRef: Ref<HTMLInputElement>;
  onSelect: (id: string) => void;
}) {
  const nameOf = new Map(list.items.map((item) => [item.id, item.name[locale]]));
  const active = [query.stage !== "all", query.editedOnly, query.stagedOnly, query.gatherOnly].filter(
    Boolean,
  ).length;
  const entries: EntryRow[] = rows.map(({ row, shown }) => {
    const staged = stage.facilities.get(row.entry.id);
    const first = shown.build?.levels[0]?.materials ?? [];
    const badges: EntryBadge[] = [];
    if (staged)
      badges.push({
        key: "staged",
        label: staged.op === "revert" ? m.dev_buildings_revert_staged() : m.dev_content_badge_staged(),
        tone: "staged",
      });
    if (row.origin !== "pack")
      badges.push({
        key: "origin",
        label: ORIGIN_TEXT[row.origin](),
        tone: row.origin === "created" ? "created" : "changed",
      });
    return {
      id: row.entry.id,
      name: shown.name[locale],
      tag: { label: STAGE_TEXT[shown.stage](), value: shown.stage },
      summary: m.dev_buildings_row_summary({
        levels: maxLevelOf(shown),
        slots: shown.slotsPerLevel,
        lv1:
          first.length === 0
            ? m.dev_content_value_none()
            : first.map((stack) => `${nameOf.get(stack.item) ?? stack.item} ${stack.qty}`).join(" · "),
      }),
      badges,
      staged: staged !== undefined,
      changed: row.origin !== "pack",
    };
  });
  return (
    <EntryList
      label={m.dev_buildings_list_label()}
      rows={entries}
      total={list.facilities.length}
      selected={selected}
      onSelect={onSelect}
      search={query.text}
      onSearch={(text) => onQuery({ text })}
      searchPlaceholder={m.dev_buildings_search_placeholder()}
      searchRef={searchRef}
      activeFilters={active}
      onReset={() => onQuery(EMPTY_BUILDING_QUERY)}
      itemClass="be-row-button"
      dataKey="facility"
      emptyText={m.dev_buildings_empty()}
      filters={
        <>
          <FilterChip
            label={m.dev_buildings_filter_edited()}
            pressed={query.editedOnly}
            onToggle={(editedOnly) => onQuery({ editedOnly })}
          />
          <FilterChip
            label={m.dev_content_filter_staged()}
            pressed={query.stagedOnly}
            onToggle={(stagedOnly) => onQuery({ stagedOnly })}
          />
          <FilterChip
            label={m.dev_buildings_filter_gather()}
            pressed={query.gatherOnly}
            onToggle={(gatherOnly) => onQuery({ gatherOnly })}
          />
          <FilterSelect
            label={m.dev_buildings_field_stage()}
            value={query.stage}
            options={[
              { value: "all" as const, label: m.dev_buildings_filter_stage_all() },
              ...FACILITY_STAGE_IDS.map((value) => ({ value, label: STAGE_TEXT[value]() })),
            ]}
            onChange={(next) => onQuery({ stage: next })}
          />
        </>
      }
    />
  );
}
