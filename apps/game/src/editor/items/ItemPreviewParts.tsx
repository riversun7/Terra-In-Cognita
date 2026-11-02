// 미리 보기 판의 무기·전투 칸 부분(아이템 편집기 WP-5) — ItemPreview.tsx가 쓴다(파일 크기).
// 무기 = 공격 칸마다 그 세계의 실효 계산식 값(덮어쓴 식 표시), 1차 적정 스탯으로 셈한 2차 적정치와 풀이(D-496, 전투가 이 값을 쓴다),
// 기준 유닛 효율(유닛 값 ÷ 적정치, 상한 N10). 전투 칸 = 쓰지 않은 장비(양손 무기의 보조 칸·입을 수 없는 종류), 속성값·저항·고정 방어·관통
// (입기 전 → 뒤). 서버가 셈하고 기기는 보이기만 한다.
import type {
  AppropriateRowId,
  AppropriateTerms,
  ItemEditorListResponse,
  ItemEditorPreviewResponse,
} from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { PRIMARY_TEXT, elementAt, formulaName, milliText } from "./itemMessages.ts";

type Weapon = NonNullable<ItemEditorPreviewResponse["weapon"]>;
type Equip = NonNullable<ItemEditorPreviewResponse["equip"]>;

/** ‰ → % 글자(한 자리) */
const pctText = (pm: number): string => `${(pm / 10).toFixed(pm % 10 === 0 ? 0 : 1)}%`;
/** 가중치‰ → 배수 글자(STR × 2.0) */
const weightText = (pm: number): string => (pm / 1000).toFixed(pm % 100 === 0 ? 1 : 3).replace(/0+$/, "0");

/** 적정 행 이름(가중치 표 행 이름, 없으면 ID) */
const rowName = (row: AppropriateRowId, names: ReadonlyMap<string, string>): string => names.get(row) ?? row;

/** 풀이 한 줄: "물리 공격력 = STR 25 × 2.0 + DEX 15 × 0.6 = 59" */
function termsText(line: AppropriateTerms, names: ReadonlyMap<string, string>): string {
  const parts = [
    ...(line.base !== 0 ? [String(line.base)] : []),
    ...line.terms.map((term) => `${PRIMARY_TEXT[term.stat]()} ${term.value} × ${weightText(term.weightPm)}`),
  ];
  const body = line.formula ?? (parts.length > 0 ? parts.join(" + ") : "0");
  return m.dev_items_preview_term_row({ row: rowName(line.row, names), terms: body, value: line.value });
}

export function WeaponPart({
  weapon,
  list,
  locale,
}: {
  weapon: Weapon;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
}) {
  const names = new Map(list.statRows.map((row) => [row.id, row.name[locale]]));
  return (
    <>
      {weapon.fields.map((field) => (
        <div key={field.kind} className="ie-table-wrap">
          <table className="ie-table" data-field={field.kind}>
            <caption>
              {field.kind === "physical" ? m.dev_items_attack_physical() : m.dev_items_attack_elemental()}
            </caption>
            <tbody>
              {field.values.map((value) => (
                <tr key={value.id}>
                  <th scope="row">{formulaName(value.id)}</th>
                  <td>{value.result === "fixed" ? milliText(value.value) : value.value}</td>
                  <td>
                    {value.overridden ? (
                      <span className="ie-chip">{m.dev_items_formula_overridden()}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {weapon.derived ? (
        <div data-part="derived">
          <p className="field-hint">
            {m.dev_items_preview_derived({
              physical: weapon.derived.physicalAttack,
              elemental: weapon.derived.elementalAttack,
              hit: weapon.derived.hit,
              crit: weapon.derived.crit,
              speed: weapon.derived.speed,
            })}
          </p>
          {weapon.derivedTerms && weapon.derivedTerms.length > 0 ? (
            <ul className="ie-plain" data-part="derived-terms">
              {weapon.derivedTerms.map((line) => (
                <li key={line.row}>{termsText(line, names)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {weapon.efficiency && weapon.efficiency.length > 0 ? (
        <div className="ie-table-wrap">
          <table className="ie-table" data-part="efficiency">
            <caption>{m.dev_items_preview_efficiency({ cap: pctText(weapon.capPm ?? 2000) })}</caption>
            <thead>
              <tr>
                <th scope="col">{m.dev_items_preview_eff_row()}</th>
                <th scope="col">{m.dev_items_preview_eff_stat()}</th>
                <th scope="col">{m.dev_items_preview_eff_appropriate()}</th>
                <th scope="col">{m.dev_items_preview_eff_ratio()}</th>
              </tr>
            </thead>
            <tbody>
              {weapon.efficiency.map((row) => (
                <tr key={row.row} data-row={row.row} data-changed={row.ratioPm < 1000 ? "" : undefined}>
                  <th scope="row">{rowName(row.row, names)}</th>
                  <td>{row.stat}</td>
                  <td>{row.appropriate <= 0 ? m.dev_items_preview_eff_none() : row.appropriate}</td>
                  <td>{pctText(row.ratioPm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/** 0이 아닌 칸만 "이름 값" 글자로(속성값·저항) */
const cellsText = (values: readonly number[], suffix = ""): string =>
  values
    .map((value, index) => (value === 0 ? null : `${elementAt(index)} ${value}${suffix}`))
    .filter((text) => text !== null)
    .join(" · ");

/** 쓰지 않은 장비와 전투 직접 값(입기 전 → 뒤, 바뀐 것만) */
export function GearPart({ equip, names }: { equip: Equip; names: ReadonlyMap<string, string> }) {
  const gear = equip.gear;
  const lines: string[] = [];
  if (gear) {
    const before = cellsText(gear.elements.before);
    const after = cellsText(gear.elements.after);
    if (before !== after)
      lines.push(m.dev_items_preview_gear_elements({ before: before || "-", after: after || "-" }));
    const resistBefore = cellsText(gear.resistPm.before, "‰");
    const resistAfter = cellsText(gear.resistPm.after, "‰");
    if (resistBefore !== resistAfter)
      lines.push(m.dev_items_preview_gear_resist({ before: resistBefore || "-", after: resistAfter || "-" }));
    if (gear.defenseFlat.before !== gear.defenseFlat.after)
      lines.push(m.dev_items_preview_gear_defense({ ...gear.defenseFlat }));
    if (gear.penetrationPm.before !== gear.penetrationPm.after)
      lines.push(m.dev_items_preview_gear_penetration({ ...gear.penetrationPm }));
  }
  const ignored = equip.ignored ?? [];
  if (lines.length === 0 && ignored.length === 0) return null;
  return (
    <ul className="ie-plain" data-part="gear">
      {ignored.map((entry) => (
        <li key={`${entry.index}-${entry.item}`} className="ie-warn" data-ignored={entry.reason}>
          {entry.reason === "two_handed"
            ? m.dev_items_preview_ignored_two_handed({ item: names.get(entry.item) ?? entry.item })
            : m.dev_items_preview_ignored_kind({ item: names.get(entry.item) ?? entry.item })}
        </li>
      ))}
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
