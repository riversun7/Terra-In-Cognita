// 미리 보기 판(설계안 3.7, 서버 items.preview가 셈한다 — 기기는 계산하지 않는다): 기준 유닛(종류·레벨·1차 6개, 기본 = 새 사이보그 평균),
// 장비 = 담은 초안을 범위 최소·가운데·최대 자리로 입힌 1차·2차 수치(입기 전 → 뒤, 바뀌는 행만), 장비 스킬 쓸 수 있나(D-490), 전투 칸
// (속성값·직접 값·쓰지 않은 장비, WP-5), 무기 = ItemPreviewParts(실효 계산식 값·셈한 적정치·효율), 소모품 = 효과 줄 문장과 기준 유닛으로
// 셈한 효과량 범위(D-496 286), 채집 = 추첨 시설 사다리의 아이템이면 시설 Lv마다 나올 확률과 확률표(D-506, ItemGatherPart),
// 값 = 레시피 원가(입력 시작 시세 합 ÷ 출력 수량)와 시작 시세 차이(BigInt).
import {
  ITEM_PRIMARY_CODES,
  type ItemEditorListResponse,
  type ItemEditorPreviewResponse,
  type ItemPreviewUnit,
} from "@terra/shared/itemEditor";
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { NumberField, SelectField } from "../content/contentEditorFields.tsx";
import { GatherPart } from "./ItemGatherPart.tsx";
import { GearPart, WeaponPart } from "./ItemPreviewParts.tsx";
import { amountText } from "./itemEffectsText.ts";
import { PRIMARY_TEXT, effectSentence, issueText } from "./itemMessages.ts";

type Preview = ItemEditorPreviewResponse;
type EquipPreview = NonNullable<Preview["equip"]>;

const PREVIEW_ERROR_TEXT: Readonly<Record<string, () => string>> = {
  stat_overflow: m.dev_items_preview_overflow,
  preview_failed: m.dev_items_preview_failed,
};

function UnitFields({
  unit,
  onUnit,
  list,
  locale,
}: {
  unit: ItemPreviewUnit;
  onUnit: (next: ItemPreviewUnit) => void;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
}) {
  const kinds = list.unitKinds.filter((kind) => kind.enabled || kind.id === unit.kind);
  const kindName = kinds.find((kind) => kind.id === unit.kind)?.name[locale] ?? unit.kind;
  const primaries = ITEM_PRIMARY_CODES.map((code) => `${PRIMARY_TEXT[code]()} ${unit.primaries[code]}`).join(
    " ",
  );
  return (
    <details className="ie-unit">
      <summary>{m.dev_items_preview_unit({ kind: kindName, level: unit.level, primaries })}</summary>
      <div className="ie-grid ie-grid-tight">
        <SelectField
          label={m.dev_items_preview_kind()}
          value={unit.kind}
          options={kinds.map((kind) => ({ value: kind.id, label: kind.name[locale] }))}
          onChange={(kind) => onUnit({ ...unit, kind })}
        />
        <NumberField
          label={m.dev_items_preview_level()}
          value={unit.level}
          min={1}
          max={999}
          onChange={(level) => onUnit({ ...unit, level: level ?? 1 })}
        />
        {ITEM_PRIMARY_CODES.map((code) => (
          <NumberField
            key={code}
            label={PRIMARY_TEXT[code]()}
            value={unit.primaries[code]}
            min={0}
            max={10_000_000}
            onChange={(value) => onUnit({ ...unit, primaries: { ...unit.primaries, [code]: value ?? 0 } })}
          />
        ))}
      </div>
    </details>
  );
}

const diffText = (value: number): string => (value > 0 ? `+${value}` : String(value));

function EquipTable({
  equip,
  list,
  locale,
}: {
  equip: EquipPreview;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
}) {
  const captionId = useId();
  const names = new Map(list.statRows.map((row) => [row.id, row.name[locale]]));
  const skills = new Map(list.skills.map((skill) => [skill.id, skill.name[locale]]));
  if (equip.error !== null) {
    return (
      <p className="field-error">{PREVIEW_ERROR_TEXT[equip.error]?.() ?? m.dev_items_preview_failed()}</p>
    );
  }
  const rows = [
    ...equip.primaries.map((row) => ({
      key: row.stat,
      name: PRIMARY_TEXT[row.stat](),
      before: row.before,
      after: row.after,
    })),
    ...equip.rows
      .filter((row) => row.after.some((value) => value !== row.before))
      .map((row) => ({
        key: row.id,
        name: names.get(row.id) ?? row.id,
        before: row.before,
        after: row.after,
      })),
  ];
  return (
    <>
      {equip.slotIndex === null ? <p className="field-hint">{m.dev_items_preview_no_slot()}</p> : null}
      {equip.wearable ? null : <p className="field-hint">{m.dev_items_preview_not_wearable()}</p>}
      {equip.replaced ? (
        <p className="field-hint">{m.dev_items_preview_replaced({ id: equip.replaced })}</p>
      ) : null}
      <div className="ie-table-wrap">
        <table className="ie-table" aria-describedby={captionId}>
          <thead>
            <tr>
              <th scope="col">{m.dev_items_preview_stat()}</th>
              <th scope="col">{m.dev_items_preview_before()}</th>
              <th scope="col">{m.dev_items_preview_min()}</th>
              <th scope="col">{m.dev_items_preview_mid()}</th>
              <th scope="col">{m.dev_items_preview_max()}</th>
              <th scope="col">{m.dev_items_preview_diff()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mid = row.after[1] ?? row.before;
              return (
                <tr key={row.key} data-changed={mid === row.before ? undefined : ""}>
                  <th scope="row">{row.name}</th>
                  <td>{row.before}</td>
                  {[0, 1, 2].map((index) => (
                    <td key={index}>{row.after[index] ?? row.before}</td>
                  ))}
                  <td className="ie-diff">{mid === row.before ? "" : diffText(mid - row.before)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p id={captionId} className="field-hint">
        {m.dev_items_preview_rows_hint()}
      </p>
      <GearPart equip={equip} names={new Map(list.items.map((item) => [item.id, item.name[locale]]))} />
      {equip.skills.length > 0 ? (
        <ul className="ie-plain">
          {equip.skills.map((skill) => (
            <li key={skill.id} data-usable={skill.usable ? "" : undefined}>
              {skill.usable
                ? m.dev_items_preview_skill_ok({ skill: skills.get(skill.id) ?? skill.id })
                : m.dev_items_preview_skill_no({ skill: skills.get(skill.id) ?? skill.id })}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function ValuePart({ value }: { value: Preview["value"] }) {
  return (
    <>
      <p>{m.dev_items_preview_start_price({ value: value.startPrice })}</p>
      {value.recipes.length === 0 ? <p className="field-hint">{m.dev_items_preview_no_recipe()}</p> : null}
      <ul className="ie-plain">
        {value.recipes.map((recipe) => {
          const diff = BigInt(value.startPrice) - BigInt(recipe.cost);
          return (
            <li key={recipe.id}>
              {m.dev_items_preview_recipe({
                recipe: recipe.id,
                cost: recipe.cost,
                qty: recipe.outputQty,
                diff: diff > 0n ? `+${diff}` : String(diff),
              })}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function ItemPreview({
  preview,
  pending,
  failed,
  unit,
  onUnit,
  list,
  locale,
}: {
  preview: Preview | null;
  /** 초안이 바뀌어 새 값을 기다린다 */
  pending: boolean;
  failed: string | null;
  unit: ItemPreviewUnit;
  onUnit: (next: ItemPreviewUnit) => void;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
}) {
  const statNames = new Map(list.statRows.map((row) => [row.id, row.name[locale]]));
  const effects = new Map(list.effects.map((effect) => [effect.id, effect.name[locale]]));
  return (
    <section
      className="ie-panel ie-preview"
      aria-labelledby="ie-preview-title"
      aria-busy={pending || undefined}
    >
      <h2 id="ie-preview-title" className="ie-heading">
        {m.dev_items_preview_title()}{" "}
        {pending ? <span className="ie-chip">{m.dev_items_preview_pending()}</span> : null}
      </h2>
      <UnitFields unit={unit} onUnit={onUnit} list={list} locale={locale} />
      {failed ? <p className="field-error">{failed}</p> : null}
      {preview && !preview.ok ? (
        <>
          <p className="field-hint">{m.dev_items_preview_blocked()}</p>
          <ul className="ie-plain ie-errors">
            {preview.issues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.path ?? ""}-${index}`}>
                {issue.path ? `${issue.path}: ` : ""}
                {issueText(issue)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {preview?.equip ? (
        <div className="ie-preview-part" data-part="equip">
          <h3 className="ie-subheading">{m.dev_items_preview_equip()}</h3>
          <EquipTable equip={preview.equip} list={list} locale={locale} />
        </div>
      ) : null}
      {preview?.weapon ? (
        <div className="ie-preview-part" data-part="weapon">
          <h3 className="ie-subheading">{m.dev_items_preview_weapon()}</h3>
          <WeaponPart weapon={preview.weapon} />
        </div>
      ) : null}
      {preview?.use ? (
        <div className="ie-preview-part" data-part="use">
          <h3 className="ie-subheading">{m.dev_items_preview_use()}</h3>
          <ul className="ie-plain">
            {preview.use.lines.map((line, index) => (
              <li key={`${index}-${line.effect}`} data-line={index}>
                {effectSentence(line, effects.get(line.effect) ?? line.effect, statNames)}
                {line.amount ? (
                  <>
                    <br />
                    <span className="ie-dim" data-part="amount">
                      {amountText(line.amount)}
                    </span>
                  </>
                ) : null}
                {line.exclusive ? (
                  <span className="ie-chip">{m.dev_items_preview_exclusive({ group: line.exclusive })}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="field-hint">{m.dev_items_preview_use_runtime()}</p>
        </div>
      ) : null}
      {preview?.gather ? (
        <div className="ie-preview-part" data-part="gather">
          <h3 className="ie-subheading">{m.dev_items_preview_gather()}</h3>
          <GatherPart gather={preview.gather} locale={locale} />
        </div>
      ) : null}
      {preview?.ok ? (
        <div className="ie-preview-part" data-part="value">
          <h3 className="ie-subheading">{m.dev_items_preview_value()}</h3>
          <ValuePart value={preview.value} />
        </div>
      ) : null}
    </section>
  );
}
