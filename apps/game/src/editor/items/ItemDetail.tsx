// 아이템 편집 판(설계안 3.4·3.10, 2026-11-08 화면 개편: 공용 머리·구역·칸 견주기) — 머리(이름·ID·출처·담김·꺼짐·코드 참조 표지,
// 덮어쓴 사람·때·메모, 이전/다음, [복제]·[담기 취소]·[팩 값으로]/[지우기]), 칸마다 팩 값·지금 값 견주기와 칸 되돌리기(CompareProvider),
// 충돌 칸 고르기(양쪽이
// 같은 칸을 바꿨을 때 내 값·서버 값), 접히는 구역(기본·분류·값 → 장비·무기 → 사용 효과 → 신선도, 대분류별 안내 띠), 단추(복제·팩 값으로·
// 지우기·담은 것 빼기), 대분류를 바꿀 때 빠지는 묶음을 먼저 묻는 확인. 미리 보기·쓰이는 곳 판은 옆(넓은 화면)이나 아래(390px)에 둔다.
import type { ContentEditOrigin, ContentIssueView, ContentOverrideView } from "@terra/shared/contentEdit";
import type {
  ItemCategoryId,
  ItemEditorListResponse,
  ItemEditorPreviewResponse,
  ItemJson,
  ItemMarketPrice,
  ItemPreviewUnit,
  ItemUsage,
} from "@terra/shared/itemEditor";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { type CompareSource, CompareProvider } from "../content/contentEditorCompare.tsx";
import { Badge, ConfirmLine, EntryHead, SectionJump } from "../content/contentEditorLayout.tsx";
import { valueAt } from "../content/contentEditorModel.ts";
import { ItemEquipFields } from "./ItemEquipFields.tsx";
import { ItemBasicSections, Section } from "./ItemForm.tsx";
import { ItemPreview } from "./ItemPreview.tsx";
import { ItemSide } from "./ItemSide.tsx";
import { ItemPerishFields, ItemUseFields } from "./ItemUseFields.tsx";
import { ItemWeaponFields } from "./ItemWeaponFields.tsx";
import { CATEGORY_TEXT, ORIGIN_TEXT, issueText } from "./itemMessages.ts";
import { droppedBundles, isItemJson, issuesByPath, withCategory } from "./itemModel.ts";
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
  /** 지금 세계 시세(서버 items.get, 없으면 null) */
  markets: readonly ItemMarketPrice[] | null;
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
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  /** 지금 세계의 실효 항목(새 항목이면 null) */
  current: ItemJson | null;
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
  if (!draft) {
    return (
      <div className="ie-detail-body">
        <button type="button" className="ce-back-list ie-back-list" onClick={props.onBack}>
          {m.dev_content_back_list()}
        </button>
        <p className="field-hint">{props.loading ? m.dev_items_loading() : m.dev_items_pick()}</p>
      </div>
    );
  }
  const created = props.origin === "created" || props.isNew;
  const onCategory = (category: ItemCategoryId) => {
    if (droppedBundles(draft, category).length > 0) setAskCategory(category);
    else props.onEdit(withCategory(draft, category));
  };
  const equip = draft.equip;
  const source: CompareSource = {
    draft,
    current: props.current,
    pack: props.reverting ? null : props.pack,
    locked: props.reverting,
    apply: (next) => {
      if (isItemJson(next)) props.onEdit(next);
    },
    problemOf: problem,
  };
  const perishable =
    draft.category === "raw" || draft.category === "processed" || draft.category === "consumable";
  const sections = [
    { name: "basic", label: m.dev_items_section_basic() },
    { name: "class", label: m.dev_items_section_class() },
    { name: "value", label: m.dev_items_section_value() },
    ...(equip ? [{ name: "equip", label: m.dev_items_section_equip() }] : []),
    ...(equip?.weapon ? [{ name: "weapon", label: m.dev_items_section_weapon() }] : []),
    ...(draft.category === "consumable" ? [{ name: "use", label: m.dev_items_section_use() }] : []),
    ...(perishable ? [{ name: "perish", label: m.dev_items_section_perish() }] : []),
  ];
  return (
    <div className="ie-detail-body" data-item={id} data-staged={props.staged ? "" : undefined}>
      <article className="ie-editing" aria-labelledby="ie-entry-title">
        <EntryHead
          headingId="ie-entry-title"
          name={draft.name[locale]}
          id={id}
          backClass="ie-back-list"
          onBack={props.onBack}
          onPrev={props.onPrev}
          onNext={props.onNext}
          badges={
            <>
              <span className="ie-cat" data-category={draft.category}>
                {CATEGORY_TEXT[draft.category]()}
              </span>
              {props.staged ? (
                <Badge tone="staged">
                  {props.reverting ? m.dev_items_revert_staged() : m.dev_items_staged_chip()}
                </Badge>
              ) : null}
              {props.origin && props.origin !== "pack" ? (
                <Badge
                  tone={props.origin === "created" ? "created" : "changed"}
                  className={`ie-origin-${props.origin}`}
                >
                  {ORIGIN_TEXT[props.origin]()}
                </Badge>
              ) : null}
              {props.isNew ? (
                <Badge tone="created" className="ie-origin-created">
                  {m.dev_items_new_chip()}
                </Badge>
              ) : null}
              {draft.enabled ? null : <Badge tone="off">{m.dev_items_disabled()}</Badge>}
              {props.codeRef ? <Badge tone="plain">{m.dev_items_code_ref_chip()}</Badge> : null}
            </>
          }
          info={
            props.override ? (
              <p>
                {m.dev_items_override_by({
                  who: props.override.updatedBy ?? m.dev_content_history_system(),
                  when: new Date(props.override.updatedAt).toLocaleString(locale),
                })}
                {props.override.note ? ` · ${props.override.note}` : ""}
              </p>
            ) : null
          }
          actions={
            <>
              <button type="button" className="ie-duplicate" onClick={props.onDuplicate}>
                {m.dev_items_duplicate()}
              </button>
              {props.staged ? (
                <button type="button" className="ie-unstage" onClick={props.onUnstage}>
                  {props.isNew ? m.dev_items_discard_new() : m.dev_items_unstage()}
                </button>
              ) : null}
              {!props.isNew && !props.reverting && props.origin !== null && props.origin !== "pack" ? (
                <button type="button" className="ie-revert" onClick={() => setAskRevert(true)}>
                  {props.origin === "created" ? m.dev_items_delete() : m.dev_items_revert()}
                </button>
              ) : null}
            </>
          }
        />

        {askRevert ? (
          <ConfirmLine
            yesClass="ie-confirm-yes"
            text={created ? m.dev_items_confirm_delete({ id }) : m.dev_items_confirm_revert({ id })}
            onYes={() => {
              setAskRevert(false);
              props.onRevert();
            }}
            onNo={() => setAskRevert(false)}
          />
        ) : null}

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
                  <button type="button" onClick={() => props.onResolve(path, false)}>
                    {m.dev_items_conflict_keep()}
                  </button>
                  <button type="button" onClick={() => props.onResolve(path, true)}>
                    {m.dev_items_conflict_take()}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {props.reverting ? (
          <p className="ce-confirm ie-band">
            {created ? m.dev_items_delete_staged_note() : m.dev_items_revert_staged_note()}
          </p>
        ) : (
          <>
            <SectionJump sections={sections} />
            <CompareProvider source={source}>
              <fieldset className="ie-form" disabled={props.reverting}>
                <legend className="visually-hidden">{draft.name[locale]}</legend>
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
                  markets={props.markets}
                />
                {askCategory ? (
                  <ConfirmLine
                    text={m.dev_items_confirm_category({
                      category: CATEGORY_TEXT[askCategory](),
                      bundles: droppedBundles(draft, askCategory)
                        .map((bundle) => BUNDLE_TEXT[bundle]())
                        .join(", "),
                    })}
                    onYes={() => {
                      props.onEdit(withCategory(draft, askCategory));
                      setAskCategory(null);
                    }}
                    onNo={() => setAskCategory(null)}
                  />
                ) : null}
                {equip ? (
                  <Section
                    title={m.dev_items_section_equip()}
                    name="equip"
                    desc={m.dev_items_section_equip_desc()}
                    source="D-421 · D-423 · D-450 · D-494"
                    paths={[
                      "equip.slot",
                      "equip.weaponType",
                      "equip.maxDurability",
                      "equip.kinds",
                      "equip.creature",
                      "equip.stats",
                      "equip.elements",
                      "equip.combat",
                      "equip.skills",
                    ]}
                  >
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
                  <Section
                    title={m.dev_items_section_weapon()}
                    name="weapon"
                    desc={m.dev_items_section_weapon_desc()}
                    source="D-502 · D-491"
                    paths={["equip.weapon"]}
                  >
                    <ItemWeaponFields
                      weapon={equip.weapon}
                      onChange={(weapon) => props.onEdit({ ...draft, equip: { ...equip, weapon } })}
                      list={list}
                      locale={locale}
                      problem={problem}
                      parts={props.preview?.weapon?.parts}
                    />
                  </Section>
                ) : null}
                {draft.category === "consumable" ? (
                  <Section
                    title={m.dev_items_section_use()}
                    name="use"
                    desc={m.dev_items_section_use_desc()}
                    source="D-425 · D-501"
                    paths={["use"]}
                  >
                    <ItemUseFields
                      draft={draft}
                      onChange={props.onEdit}
                      list={list}
                      locale={locale}
                      problem={problem}
                    />
                  </Section>
                ) : null}
                {perishable ? (
                  <Section
                    title={m.dev_items_section_perish()}
                    name="perish"
                    open={draft.perish !== undefined}
                    desc={m.dev_items_section_perish_desc()}
                    paths={["perish"]}
                  >
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
            </CompareProvider>
          </>
        )}
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
