// 유닛 공통 경험치 테이블 편집기 화면 자료(/dev/exp-table) — 스냅숏 하나로 만든다.
import type { ExpTableEntry } from "@terra/content";
import { type ExpTableEntryJson, type ExpTableRowView, sortExpEntries } from "@terra/shared/expTable";
import { type ContentEditState, type ContentSnapshot, contentKey } from "../contentEdit/state.ts";
import { originOf, overrideViewOf } from "../contentEdit/views.ts";

/** 파싱한 경험치 표 항목 → 화면 JSON(팩 파일 한 줄 모양) */
export function expTableJsonOf(entry: ExpTableEntry): ExpTableEntryJson {
  return {
    id: entry.id,
    level: entry.level,
    requiredExp: entry.requiredExp,
  };
}

/** 스냅숏의 실효 경험치 표 줄 목록(레벨 오름차순) */
export function expTableViews(state: ContentEditState, snapshot: ContentSnapshot): ExpTableRowView[] {
  const packById = new Map(state.pack.expTable.map((entry) => [entry.id, expTableJsonOf(entry)]));
  const sorted = sortExpEntries(snapshot.effective.expTable.map(expTableJsonOf));
  return sorted.map((entry) => ({
    entry,
    pack: packById.get(entry.id) ?? null,
    origin: originOf(state, snapshot, "exp_table", entry.id),
    override: overrideViewOf(snapshot.overrides.get(contentKey("exp_table", entry.id))),
    hash: state.hashOf("exp_table", entry.id) ?? "",
  }));
}
