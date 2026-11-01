// 아이템 편집 판(설계안 3.4·3.10) — 머리(이름·ID·출처·담김·꺼짐·코드 참조 칩, 덮어쓴 사람·때·메모, 팩과 다른 칸), 충돌 칸 고르기(양쪽이
// 같은 칸을 바꿨을 때 내 값·서버 값), 접히는 구역(기본·분류·값 → 장비·무기 → 사용 효과 → 신선도, 대분류별 안내 띠), 단추(복제·팩 값으로·
// 지우기·담은 것 빼기), 대분류를 바꿀 때 빠지는 묶음을 먼저 묻는 확인. 미리 보기·쓰이는 곳 판은 옆(넓은 화면)이나 아래(390px)에 둔다.
import type { ContentEditOrigin, ContentIssueView, ContentOverrideView } from "@terra/shared/contentEdit";
import type {
  ItemCategoryId,
  ItemEditorListResponse,
  ItemEditorPreviewResponse,
  ItemJson,
  ItemPreviewUnit,
  ItemUsage,
} from "@terra/shared/itemEditor";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { valueAt } from "../content/contentEditorModel.ts";
import { ItemEquipFields } from "./ItemEquipFields.tsx";
import { ItemBasicSections, Section } from "./ItemForm.tsx";
import { ItemPreview } from "./ItemPreview.tsx";
import { ItemSide } from "./ItemSide.tsx";
import { ItemPerishFields, ItemUseFields } from "./ItemUseFields.tsx";
import { ItemWeaponFields } from "./ItemWeaponFields.tsx";
import { CATEGORY_TEXT, ORIGIN_TEXT, issueText } from "./itemMessages.ts";
import { changedPaths, droppedBundles, issuesByPath, withCategory } from "./itemModel.ts";
import type { ItemConflict } from "./itemRebase.ts";

const BUNDLE_TEXT = {
  equip: m.dev_items_bundle_equip,
  perish: m.dev_items_bundle_perish,
  use: m.dev_items_bundle_use,
  subcategory: m.dev_items_bundle_subcategory,
} as const;

const shortJson = (value: unknown): string => {
  const text = value === undefined ? "—" : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};

export interface ItemDetailProps {
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  id: string;
  draft: ItemJson | null;
  /** 아직 세계에 없는 새 항목(담은 변경에만 있다) */
  isNew: boolean;
  /** [팩 값으로]·[지우기]가 담겼다 */
  reverting: boolean;
  staged: boolean;
  origin: ContentEditOrigin | null;
  override: ContentOverrideView | null;
  pack: ItemJson | null;
  codeRef: boolean;
  loading: boolean;
  issues: readonly ContentIssueView[];
  advice: readonly ContentIssueView[];
  cascade: { readonly recipes: readonly string[]; readonly necessities: readonly string[] } | null;
  checking: boolean;
  usage: ItemUsage | null;
  preview: ItemEditorPreviewResponse | null;
  previewPending: boolean;
  previewFailed: string | null;
  unit: ItemPreviewUnit;
  onUnit: (next: ItemPreviewUnit) => void;
  conflict: ItemConflict | null;
  onResolve: (path: string, useTheirs: boolean) => void;
  onEdit: (next: ItemJson) => void;
  onDuplicate: () => void;
  onRevert: () => void;
  onUnstage: () => void;
  onSelect: (id: string) => void;
  onBack: () => void;
}

export function ItemDetail(props: ItemDetailProps) {
  const { list, locale, draft, id } = props;
  const [askCategory, setAskCategory] = useState<ItemCategoryId | null>(null);
  const [askRevert, setAskRevert] = useState(false);
  const byPath = issuesByPath(props.issues, id);
  const problem = (path: string): string | undefined => {
    const found = byPath.get(path)?.[0];
    return found ? issueText(found) : undefined;
  };
  const back = (
    <button type="button" className="button-small ie-back-list" onClick={props.onBack}>
      {m.dev_items_back_to_list()}
    </button>
  );
  if (!draft) {
    return (
      <div className="ie-detail-body">
        {back}
        <p className="field-hint">{props.loading ? m.dev_items_loading() : m.dev_items_pick()}</p>
      </div>
    );
  }
  const created = props.origin === "created" || props.isNew;
  const changed = props.pack && !props.reverting ? changedPaths(props.pack, draft) : [];
  const onCategory = (category: ItemCategoryId) => {
    if (droppedBundles(draft, category).length > 0) setAskCategory(category);
    else props.onEdit(withCategory(draft, category));
  };
  const equip = draft.equip;
  return (
    <div className="ie-detail-body" data-item={id} data-staged={props.staged ? "" : undefined}>
      {back}
      <article className="ie-panel ie-editing">
        <header className="ie-editing-head">
          <h2 className="ie-heading">
            {draft.name[locale]} <span className="ie-dim">{id}</span>
          </h2>
          <div className="ie-chips">
            <span className="ie-cat" data-category={draft.category}>
              {CATEGORY_TEXT[draft.category]()}
            </span>
            {props.origin && props.origin !== "pack" ? (
              <span className={`ie-chip ie-origin-${props.origin}`}>{ORIGIN_TEXT[props.origin]()}</span>
            ) : null}
            {props.isNew ? <span className="ie-chip ie-origin-created">{m.dev_items_new_chip()}</span> : null}
            {props.staged ? (
              <span className="ie-chip ie-chip-staged">
                {props.reverting ? m.dev_items_revert_staged() : m.dev_items_staged_chip()}
              </span>
            ) : null}
            {draft.enabled ? null : <span className="ie-chip">{m.dev_items_disabled()}</span>}
            {props.codeRef ? <span className="ie-chip">{m.dev_items_code_ref_chip()}</span> : null}
          </div>
          {props.override ? (
            <p className="field-hint">
              {m.dev_items_override_by({
                who: props.override.updatedBy ?? m.dev_content_history_system(),
                when: new Date(props.override.updatedAt).toLocaleString(locale),
              })}
              {props.override.note ? ` · ${props.override.note}` : ""}
            </p>
          ) : null}
          {changed.length > 0 ? (
            <p className="field-hint" data-part="changed">
              {m.dev_items_changed_from_pack({ fields: changed.join(", ") })}
            </p>
          ) : null}
        </header>

        {props.conflict && props.conflict.paths.length > 0 ? (
          <div className="ie-conflict" role="alert">
            <p>{m.dev_items_conflict_title()}</p>
            <ul className="ie-plain">
              {props.conflict.paths.map((path) => (
                <li key={path} className="ie-conflict-row">
                  <span className="ie-dim">{path}</span>
                  <span>{m.dev_items_conflict_mine({ value: shortJson(valueAt(draft, path)) })}</span>
                  <span>
                    {m.dev_items_conflict_theirs({ value: shortJson(valueAt(props.conflict?.theirs, path)) })}
                  </span>
                  <button type="button" className="button-small" onClick={() => props.onResolve(path, false)}>
                    {m.dev_items_conflict_keep()}
                  </button>
                  <button type="button" className="button-small" onClick={() => props.onResolve(path, true)}>
                    {m.dev_items_conflict_take()}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {props.reverting ? (
          <p className="ie-band">
            {created ? m.dev_items_delete_staged_note() : m.dev_items_revert_staged_note()}
          </p>
        ) : (
          <fieldset className="ie-form" disabled={props.reverting}>
            {draft.category === "gem" || draft.category === "document" ? (
              <p className="ie-band">{m.dev_items_band_undecided()}</p>
            ) : null}
            <ItemBasicSections
              draft={draft}
              onChange={props.onEdit}
              onCategory={onCategory}
              list={list}
              locale={locale}
              categoryLocked={!created}
              problem={problem}
            />
            {askCategory ? (
              <div className="ie-confirm" role="alertdialog" aria-labelledby="ie-ask-category">
                <p id="ie-ask-category">
                  {m.dev_items_confirm_category({
                    category: CATEGORY_TEXT[askCategory](),
                    bundles: droppedBundles(draft, askCategory)
                      .map((bundle) => BUNDLE_TEXT[bundle]())
                      .join(", "),
                  })}
                </p>
                <div className="ie-inline-actions">
                  <button
                    type="button"
                    className="button-small button-primary"
                    onClick={() => {
                      props.onEdit(withCategory(draft, askCategory));
                      setAskCategory(null);
                    }}
                  >
                    {m.dev_items_confirm_yes()}
                  </button>
                  <button type="button" className="button-small" onClick={() => setAskCategory(null)}>
                    {m.dev_items_confirm_no()}
                  </button>
                </div>
              </div>
            ) : null}
            {equip ? (
              <Section title={m.dev_items_section_equip()} name="equip">
                <ItemEquipFields
                  equip={equip}
                  onChange={(next) => props.onEdit({ ...draft, equip: next })}
                  list={list}
                  locale={locale}
                  problem={problem}
                />
              </Section>
            ) : null}
            {equip?.weapon ? (
              <Section title={m.dev_items_section_weapon()} name="weapon">
                <ItemWeaponFields
                  weapon={equip.weapon}
                  onChange={(weapon) => props.onEdit({ ...draft, equip: { ...equip, weapon } })}
                  list={list}
                  locale={locale}
                  problem={problem}
                />
              </Section>
            ) : null}
            {draft.category === "consumable" ? (
              <Section title={m.dev_items_section_use()} name="use">
                <ItemUseFields
                  draft={draft}
                  onChange={props.onEdit}
                  list={list}
                  locale={locale}
                  problem={problem}
                />
              </Section>
            ) : null}
            {draft.category === "raw" || draft.category === "processed" || draft.category === "consumable" ? (
              <Section title={m.dev_items_section_perish()} name="perish" open={draft.perish !== undefined}>
                <ItemPerishFields
                  draft={draft}
                  onChange={props.onEdit}
                  list={list}
                  locale={locale}
                  problem={problem}
                />
              </Section>
            ) : null}
          </fieldset>
        )}

        {askRevert ? (
          <div className="ie-confirm" role="alertdialog" aria-labelledby="ie-ask-revert">
            <p id="ie-ask-revert">
              {created ? m.dev_items_confirm_delete({ id }) : m.dev_items_confirm_revert({ id })}
            </p>
            <div className="ie-inline-actions">
              <button
                type="button"
                className="button-small button-primary ie-confirm-yes"
                onClick={() => {
                  setAskRevert(false);
                  props.onRevert();
                }}
              >
                {m.dev_items_confirm_yes()}
              </button>
              <button type="button" className="button-small" onClick={() => setAskRevert(false)}>
                {m.dev_items_confirm_no()}
              </button>
            </div>
          </div>
        ) : null}
        <div className="ie-actions" role="group" aria-label={draft.name[locale]}>
          <button type="button" className="button-small ie-duplicate" onClick={props.onDuplicate}>
            {m.dev_items_duplicate()}
          </button>
          {props.staged ? (
            <button type="button" className="button-small ie-unstage" onClick={props.onUnstage}>
              {props.isNew ? m.dev_items_discard_new() : m.dev_items_unstage()}
            </button>
          ) : null}
          {!props.isNew && !props.reverting && props.origin !== null && props.origin !== "pack" ? (
            <button type="button" className="button-small ie-revert" onClick={() => setAskRevert(true)}>
              {props.origin === "created" ? m.dev_items_delete() : m.dev_items_revert()}
            </button>
          ) : null}
        </div>
      </article>
      <div className="ie-aside">
        <ItemPreview
          preview={props.preview}
          pending={props.previewPending}
          failed={props.previewFailed}
          unit={props.unit}
          onUnit={props.onUnit}
          list={list}
          locale={locale}
        />
        <ItemSide
          usage={props.usage}
          errors={props.issues}
          advice={props.advice}
          cascade={props.cascade}
          checking={props.checking}
          list={list}
          locale={locale}
          onSelect={props.onSelect}
        />
      </div>
    </div>
  );
}
