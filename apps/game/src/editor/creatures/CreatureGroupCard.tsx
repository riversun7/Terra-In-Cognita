// 크리쳐 변종 그룹 카드(CreatureGroupCard) — docs/adr/2026-11-25-creature-codex-groups.md 2절.
// 비슷한 종(속성 변종·스탯 변종)을 따로 크리쳐로 두고 그룹 대표를 가리켜 묶는다(variantOf). 단독 크리쳐도 여기서 그룹으로 넓힌다.
// - 변종 추가: 지금 크리쳐를 복제해 새 ID로 담는다(그대로·주속성 바꿈·스탯 성향 바꿈). 만든 뒤 그 변종으로 넘어가 다듬는다.
// - 기존 크리쳐 넣기: 단독 크리쳐를 이 그룹의 변종으로. 그룹에서 빼기·대표로 지정(옛 대표와 다른 변종이 새 대표를 가리킨다).
import {
  CREATURE_PRIMARY_CODES,
  type CreatureEditorListResponse,
  type CreatureJson,
  type CreatureStatTendency,
  creatureGroupRootId,
  creatureStatShares,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { CreatureTokenBadge } from "./CreaturePortraitCropper.tsx";
import {
  ELEMENT_LABELS,
  STAT_LABELS,
  PRESET_TAG_LABELS,
  type VariantChange,
  mainElementIndex,
  promoteToRoot,
  variantFrom,
} from "./creatureModel.ts";

const TENDENCIES: readonly CreatureStatTendency[] = [
  "tendency_attack",
  "tendency_defense",
  "tendency_agile",
  "tendency_mount",
  "tendency_magic",
  "tendency_production",
];
const ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

export function CreatureGroupCard({
  list,
  draft,
  allCreatures,
  usedIds,
  locale,
  onOpen,
  onEditMany,
  onCreateVariant,
}: {
  readonly list: CreatureEditorListResponse;
  readonly draft: CreatureJson;
  /** 실효 크리쳐 전체(담은 바꿈·새 항목 포함) */
  readonly allCreatures: readonly CreatureJson[];
  /** 이미 쓰는 ID(실효 + 담은 새 항목) */
  readonly usedIds: ReadonlySet<string>;
  readonly locale: "ko" | "en";
  readonly onOpen: (id: string) => void;
  /** 여러 크리쳐를 한 번에 담는다(되돌리기 한 칸) */
  readonly onEditMany: (entries: readonly CreatureJson[]) => void;
  readonly onCreateVariant: (entry: CreatureJson) => void;
}) {
  const ko = locale !== "en";
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newKo, setNewKo] = useState("");
  const [newEn, setNewEn] = useState("");
  const [kind, setKind] = useState<VariantChange["kind"]>("element");
  const [element, setElement] = useState(1);
  const [tendency, setTendency] = useState<CreatureStatTendency>("tendency_magic");
  const [error, setError] = useState<string | null>(null);
  const [joinId, setJoinId] = useState("");
  const [moveTo, setMoveTo] = useState("");

  const nameOf = (entry: CreatureJson): string => (ko ? entry.name.ko : entry.name.en);
  const rootId = creatureGroupRootId(draft);
  const members = allCreatures.filter((entry) => creatureGroupRootId(entry) === rootId);
  const root = members.find((entry) => entry.id === rootId) ?? null;
  const variants = members.filter((entry) => entry.id !== rootId);
  const isVariant = draft.variantOf !== undefined;
  const isSingle = !isVariant && variants.length === 0;
  // 다른 크리쳐의 대표인 ID(변종을 거느린 크리쳐)
  const leads = new Set(allCreatures.flatMap((entry) => (entry.variantOf ? [entry.variantOf] : [])));
  // 이 그룹에 넣을 수 있는 것: 변종도 대표도 아닌 단독 크리쳐
  const joinable = allCreatures.filter(
    (entry) => entry.id !== draft.id && entry.variantOf === undefined && !leads.has(entry.id),
  );
  // 지금(단독) 크리쳐가 들어갈 수 있는 그룹 대표: 변종이 아닌 다른 크리쳐
  const targets = allCreatures.filter((entry) => entry.id !== draft.id && entry.variantOf === undefined);

  const describe = (entry: CreatureJson): string => {
    const main = mainElementIndex(entry.elements);
    const info = main === null ? undefined : ELEMENT_LABELS[main];
    const top = creatureStatShares(entry.primaries).top;
    const sum = CREATURE_PRIMARY_CODES.reduce((acc, code) => acc + entry.primaries[code], 0);
    const elementText = info ? (ko ? info.ko : info.en) : ko ? "무속성" : "No element";
    return `${elementText} · ${ko ? `주력 ${STAT_LABELS[top].ko}` : `Top ${STAT_LABELS[top].en}`} · Σ${sum}`;
  };

  const submit = (): void => {
    const id = newId.trim().toLowerCase();
    if (!ID_PATTERN.test(id)) {
      setError(ko ? "ID는 영문 소문자로 시작하는 소문자·숫자·_ 2~48자여야 합니다." : "Invalid ID format.");
      return;
    }
    if (usedIds.has(id)) {
      setError(ko ? "이미 있는 크리쳐 ID입니다." : "ID already exists.");
      return;
    }
    if (list.retired.includes(id)) {
      setError(ko ? "지운 적이 있는 ID는 다시 쓸 수 없습니다." : "Retired ID cannot be reused.");
      return;
    }
    const nameKo = newKo.trim() || id;
    const change: VariantChange =
      kind === "element" ? { kind, element } : kind === "stats" ? { kind, tendency } : { kind: "copy" };
    onCreateVariant(variantFrom(draft, rootId, id, { ko: nameKo, en: newEn.trim() || nameKo }, change));
    setAdding(false);
    setNewId("");
    setNewKo("");
    setNewEn("");
    setError(null);
  };

  return (
    <section className="be-card ce-group-card" data-root={rootId} data-members={members.length}>
      <div className="ce-card-head">
        <div>
          <h3 className="ce-section-title">
            {isSingle
              ? ko
                ? "변종 그룹 — 단독 크리쳐"
                : "Variant Group — Single Creature"
              : ko
                ? `변종 그룹 — 대표 ${root ? nameOf(root) : rootId} · 변종 ${variants.length}종`
                : `Variant Group — Lead ${root ? nameOf(root) : rootId} · ${variants.length} variants`}
          </h3>
          <p className="field-hint">
            {ko
              ? "비슷한 종을 속성·스탯만 달리해 그룹으로 묶습니다. 변종마다 자기 ID·그림·스탯·전리품을 가집니다."
              : "Group similar species that differ by element or stats. Each variant keeps its own ID, art, stats and loot."}
          </p>
        </div>
        <div className="be-actions">
          <button
            type="button"
            className="button-small ce-btn-accent"
            aria-expanded={adding}
            onClick={() => {
              setAdding(!adding);
              setError(null);
            }}
          >
            {adding ? (ko ? "취소" : "Cancel") : ko ? "+ 변종 추가" : "+ Add Variant"}
          </button>
          {isVariant ? (
            <>
              <button
                type="button"
                className="button-small"
                onClick={() => onEditMany(promoteToRoot(allCreatures, draft.id))}
              >
                {ko ? "대표로 지정" : "Make Lead"}
              </button>
              <button
                type="button"
                className="button-small"
                onClick={() => onEditMany([{ ...draft, variantOf: undefined }])}
              >
                {ko ? "그룹에서 빼기" : "Leave Group"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {adding ? (
        <div className="ce-create-box be-card">
          <div className="ce-grid-3">
            <div className="field ce-field">
              <label className="field-label" htmlFor="ce-variant-id">
                {ko ? "변종 ID (영문 snake_case)" : "Variant ID"}
              </label>
              <input
                id="ce-variant-id"
                className="input"
                placeholder={`${rootId}_fire`}
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>
            <div className="field ce-field">
              <label className="field-label" htmlFor="ce-variant-ko">
                {ko ? "한국어 이름" : "Korean Name"}
              </label>
              <input
                id="ce-variant-ko"
                className="input"
                value={newKo}
                onChange={(e) => setNewKo(e.target.value)}
              />
            </div>
            <div className="field ce-field">
              <label className="field-label" htmlFor="ce-variant-en">
                {ko ? "영어 이름" : "English Name"}
              </label>
              <input
                id="ce-variant-en"
                className="input"
                value={newEn}
                onChange={(e) => setNewEn(e.target.value)}
              />
            </div>
          </div>
          <div className="ce-grid-3">
            <div className="field ce-field">
              <label className="field-label" htmlFor="ce-variant-kind">
                {ko ? "무엇을 달리할까" : "What differs"}
              </label>
              <select
                id="ce-variant-kind"
                value={kind}
                onChange={(e) => {
                  const next = (["element", "stats", "copy"] as const).find((k) => k === e.target.value);
                  if (next) setKind(next);
                }}
              >
                <option value="element">{ko ? "속성 변종 (주속성 바꿈)" : "Element variant"}</option>
                <option value="stats">
                  {ko ? "스탯 변종 (성향 바꿈, 합은 그대로)" : "Stat variant (same total)"}
                </option>
                <option value="copy">{ko ? "그대로 복제 (직접 고침)" : "Plain copy"}</option>
              </select>
            </div>
            {kind === "element" ? (
              <div className="field ce-field">
                <label className="field-label" htmlFor="ce-variant-element">
                  {ko ? "새 주속성" : "New main element"}
                </label>
                <select
                  id="ce-variant-element"
                  value={element}
                  onChange={(e) => setElement(Number(e.target.value))}
                >
                  {ELEMENT_LABELS.map((info, index) => (
                    <option key={info.id} value={index}>
                      {ko ? info.ko : info.en}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {kind === "stats" ? (
              <div className="field ce-field">
                <label className="field-label" htmlFor="ce-variant-tendency">
                  {ko ? "새 스탯 성향" : "New stat tendency"}
                </label>
                <select
                  id="ce-variant-tendency"
                  value={tendency}
                  onChange={(e) => {
                    const next = TENDENCIES.find((t) => t === e.target.value);
                    if (next) setTendency(next);
                  }}
                >
                  {TENDENCIES.map((t) => (
                    <option key={t} value={t}>
                      {ko ? PRESET_TAG_LABELS[t].ko : PRESET_TAG_LABELS[t].en}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          {error ? <p className="field-error">{error}</p> : null}
          <div className="be-actions">
            <button type="button" className="button-small ce-btn-accent" onClick={submit}>
              {ko ? `${nameOf(draft)} 복제해 변종 만들기 →` : `Clone ${nameOf(draft)} as Variant →`}
            </button>
          </div>
        </div>
      ) : null}

      {isSingle ? null : (
        <ul className="ce-group-list">
          {[...(root ? [root] : []), ...variants].map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="ce-group-member"
                data-current={entry.id === draft.id ? "true" : undefined}
                aria-current={entry.id === draft.id ? "true" : undefined}
                onClick={() => onOpen(entry.id)}
              >
                <CreatureTokenBadge
                  image={entry.image}
                  crop={entry.portraitCrop}
                  grade={entry.grade}
                  sizePx={36}
                  alt=""
                />
                <span className="ce-group-member-text">
                  <strong>{nameOf(entry)}</strong>
                  <span className="dev-muted">
                    {entry.id === rootId ? (ko ? "대표 · " : "Lead · ") : ""}
                    {describe(entry)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="ce-grid-2">
        {isVariant ? null : (
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-group-join">
              {ko
                ? "기존 단독 크리쳐를 이 그룹의 변종으로 넣기"
                : "Add an existing single creature as a variant"}
            </label>
            <div className="ce-inline-controls">
              <select id="ce-group-join" value={joinId} onChange={(e) => setJoinId(e.target.value)}>
                <option value="">{ko ? "— 크리쳐 고르기 —" : "— Pick a creature —"}</option>
                {joinable.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {nameOf(entry)} ({entry.id})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button-small"
                disabled={joinId === ""}
                onClick={() => {
                  const picked = joinable.find((entry) => entry.id === joinId);
                  if (!picked) return;
                  onEditMany([{ ...picked, variantOf: draft.id }]);
                  setJoinId("");
                }}
              >
                {ko ? "넣기" : "Add"}
              </button>
            </div>
          </div>
        )}
        {isSingle ? (
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-group-move">
              {ko ? "이 크리쳐를 다른 크리쳐의 변종으로 넣기" : "Make this creature a variant of another"}
            </label>
            <div className="ce-inline-controls">
              <select id="ce-group-move" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">{ko ? "— 대표 고르기 —" : "— Pick a lead —"}</option>
                {targets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {nameOf(entry)} ({entry.id})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button-small"
                disabled={moveTo === ""}
                onClick={() => {
                  if (moveTo === "") return;
                  onEditMany([{ ...draft, variantOf: moveTo }]);
                  setMoveTo("");
                }}
              >
                {ko ? "넣기" : "Move"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
