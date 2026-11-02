// 건물 편집기 시설 표(공용 .dev-table) — 옛 관리자 건물 편집기의 표(건물·카테고리·티어·유닛·생산 타입)를 우리 자료 칸으로: 시설(이름·ID),
// 생산 단계, 최고 레벨, 레벨당 자리, Lv1(처음 짓기) 재료, 상태(출처·담김·꺼짐). 줄 이름 칸이 단추다(누르면 편집 판).
import type { BuildingEditorListResponse } from "@terra/shared/buildingEditor";
import { m } from "../../paraglide/messages.js";
import { ORIGIN_TEXT, STAGE_TEXT } from "./buildingMessages.ts";
import { type BuildingStage, maxLevelOf } from "./buildingModel.ts";

export function BuildingList({
  list,
  locale,
  selected,
  stage,
  onSelect,
}: {
  list: BuildingEditorListResponse;
  locale: "ko" | "en";
  selected: string | null;
  stage: BuildingStage;
  onSelect: (id: string) => void;
}) {
  const nameOf = new Map(list.items.map((item) => [item.id, item.name[locale]]));
  return (
    <div className="be-list-pane">
      <div className="dev-table-wrap">
        <table className="dev-table be-table" aria-label={m.dev_buildings_list_label()}>
          <thead>
            <tr>
              <th scope="col">{m.dev_buildings_col_facility()}</th>
              <th scope="col">{m.dev_buildings_col_stage()}</th>
              <th scope="col" className="dev-num">
                {m.dev_buildings_col_levels()}
              </th>
              <th scope="col" className="dev-num">
                {m.dev_buildings_col_slots()}
              </th>
              <th scope="col">{m.dev_buildings_col_lv1()}</th>
              <th scope="col">{m.dev_buildings_col_state()}</th>
            </tr>
          </thead>
          <tbody>
            {list.facilities.map((row) => {
              const entry = stage.facilities.get(row.entry.id);
              const shown = entry?.op === "put" ? entry.entry : row.entry;
              const first = shown.build?.levels[0]?.materials ?? [];
              return (
                <tr
                  key={row.entry.id}
                  data-facility={row.entry.id}
                  data-selected={selected === row.entry.id ? "" : undefined}
                  data-staged={entry ? "" : undefined}
                >
                  <td>
                    <button
                      type="button"
                      className="be-row-button"
                      aria-current={selected === row.entry.id ? "true" : undefined}
                      onClick={() => onSelect(row.entry.id)}
                    >
                      <span className="be-row-name">{shown.name[locale]}</span>
                      <span className="dev-code">{row.entry.id}</span>
                    </button>
                  </td>
                  <td>{STAGE_TEXT[shown.stage]()}</td>
                  <td className="dev-num">{maxLevelOf(shown)}</td>
                  <td className="dev-num">{shown.slotsPerLevel}</td>
                  <td className="be-lv1">
                    {first.map((stack) => `${nameOf.get(stack.item) ?? stack.item} ${stack.qty}`).join(" · ")}
                  </td>
                  <td>
                    <span className="be-badges">
                      <span className="dev-badge" data-origin={row.origin}>
                        {ORIGIN_TEXT[row.origin]()}
                      </span>
                      {entry ? (
                        <span className="dev-badge be-badge-staged">{m.dev_buildings_state_staged()}</span>
                      ) : null}
                      {shown.enabled ? null : (
                        <span className="dev-badge be-badge-off">{m.dev_content_disabled()}</span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
