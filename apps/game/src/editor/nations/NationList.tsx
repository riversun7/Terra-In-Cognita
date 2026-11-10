// 시작 국가 설정 편집기 왼쪽 목록 — 국가 16줄: 국가 마크 · 색 표지 · 이름 · 약어 · 시작 수(도시·인구·시설) · 표지(담음·덮어씀·서는 차례·올린 마크).
// 목록이 짧아(프리셋 16개) 찾기·거르기 없이 다 보인다. 줄 단추 = .ne-item[data-nation=<ID>](시험이 고른다).
import type { NationEditorRow, NationSeedDefaults } from "@terra/shared/nationEditor";
import { m } from "../../paraglide/messages.js";
import { NationEmblem } from "../../ui/NationEmblem.tsx";
import { Badge } from "../content/contentEditorLayout.tsx";
import { type NationStage, colorOf, emblemOf, startCountsOf } from "./nationModel.ts";

export function NationList({
  rows,
  stage,
  selected,
  locale,
  defaults,
  onSelect,
}: {
  rows: readonly NationEditorRow[];
  stage: NationStage;
  selected: string | null;
  locale: "ko" | "en";
  defaults: NationSeedDefaults;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="ne-list" aria-label={m.dev_nations_list_label()}>
      <p className="ne-list-count">{m.dev_nations_count({ count: rows.length })}</p>
      <ul className="ne-list-rows">
        {rows.map((row) => {
          const staged = stage.nations.get(row.entry.id);
          // 담은 초안이 있으면 그 모습으로 보인다(되돌리기를 담았으면 팩 값)
          const entry =
            staged?.op === "put"
              ? staged.entry
              : staged?.op === "revert"
                ? (row.pack ?? row.entry)
                : row.entry;
          const counts = startCountsOf(entry, defaults);
          return (
            <li key={row.entry.id}>
              <button
                type="button"
                className="ne-item"
                data-nation={row.entry.id}
                data-staged={staged ? "" : undefined}
                data-changed={row.origin !== "pack" ? "" : undefined}
                aria-current={selected === row.entry.id ? "true" : undefined}
                onClick={() => onSelect(row.entry.id)}
              >
                <NationEmblem
                  spec={emblemOf(entry)}
                  color={colorOf(entry)}
                  uploaded={row.uploaded?.hash}
                  size={32}
                />
                <span className="ne-item-main">
                  <span className="ne-item-name">
                    <span className="ne-chip" style={{ background: colorOf(entry) }} aria-hidden="true" />
                    <span className="ne-item-name-text">{entry.name[locale]}</span>
                    {entry.shortName ? (
                      <code className="dev-code" translate="no">
                        {entry.shortName}
                      </code>
                    ) : null}
                  </span>
                  <span className="ne-item-summary">
                    {m.dev_nations_row_summary({
                      cities: counts.cities,
                      people: counts.totalPopulation,
                      currency: entry.currency.ticker ?? entry.currency.code,
                    })}
                  </span>
                  <span className="ne-item-badges">
                    {row.slot === null ? null : (
                      <Badge tone="plain">{m.dev_nations_slot({ slot: row.slot })}</Badge>
                    )}
                    {staged ? <Badge tone="staged">{m.dev_nations_badge_staged()}</Badge> : null}
                    {row.origin === "pack" ? null : (
                      <Badge tone="changed">{m.dev_nations_badge_changed()}</Badge>
                    )}
                    {row.uploaded ? <Badge tone="advice">{m.dev_nations_badge_uploaded()}</Badge> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
