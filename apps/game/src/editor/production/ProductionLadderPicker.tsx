// 띠 표 고르기 — 기획 D-540 1217 나(채집 티어 띠 표를 사다리(중분류)마다 따로). 확률 분포·예상 확률 탭 위에서 기본 표(전용 표가 없는 사다리
// 모두)와 사다리 전용 표(지금 팩은 광석) 가운데 하나를 고른다. 표가 하나뿐이면 그리지 않는다. 새 사다리 표 만들기는 없다(팩 gather_tiers).
import type { BuildingEditorSubcategory } from "@terra/shared/buildingEditor";
import { m } from "../../paraglide/messages.js";

export function ProductionLadderPicker({
  ladders,
  value,
  subcategories,
  locale,
  onChange,
}: {
  /** 표가 있는 사다리(undefined = 기본 표 먼저) */
  ladders: readonly (string | undefined)[];
  value: string | undefined;
  subcategories: readonly BuildingEditorSubcategory[];
  locale: "ko" | "en";
  onChange: (ladder: string | undefined) => void;
}) {
  if (ladders.length < 2) return null;
  const nameOf = (id: string): string => subcategories.find((sub) => sub.id === id)?.name[locale] ?? id;
  return (
    <div className="gt-bulk pd-ladders" role="group" aria-label={m.dev_gather_ladder_label()}>
      <span className="gt-bulk-label">{m.dev_gather_ladder_label()}</span>
      {ladders.map((ladder) => (
        <button
          key={ladder ?? ""}
          type="button"
          className="button-small"
          data-ladder={ladder ?? "default"}
          aria-pressed={ladder === value}
          onClick={() => onChange(ladder)}
        >
          {ladder === undefined ? m.dev_gather_ladder_default() : nameOf(ladder)}
        </button>
      ))}
    </div>
  );
}
