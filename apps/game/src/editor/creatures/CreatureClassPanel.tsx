// 크리쳐 분류(대·중·소) 고르기 띠와 분류 편집기 — docs/adr/2026-11-25-creature-codex-groups.md 6절.
// - 고르기 띠(CreatureClassBar): 대분류 카드(그림 글자·이름·종 수) → 고르면 그 아래 중분류 칩 → 소분류 칩. 고른 분류와 그 아래 분류의 크리쳐만 보인다.
// - 편집기(CreatureClassEditor): 트리를 한 줄씩. 이름(한·영)·그림 글자 고치기, 하위 분류 더하기(셋째 단계까지), 위 분류 바꾸기(옮기기 —
//   옮긴 뒤 깊이가 대·중·소를 넘지 않는 자리만), 지우기(그 세계에서 만든 분류이고 아래 분류·크리쳐가 없을 때), 팩 원본으로 되돌리기.
//   바꿈은 크리쳐와 같은 묶음에 담겨 한 번에 적용된다.
import {
  CREATURE_CLASS_MAX_DEPTH,
  type CreatureClassJson,
  type CreatureEditorListResponse,
  type CreatureJson,
  canMoveCreatureClass,
  creatureClassPath,
  creatureClassSubtree,
  flattenCreatureClasses,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import type { CombinedClass } from "./creatureModel.ts";

const ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

/** 분류마다 크리쳐 수(직접·아래 분류 포함) */
function countsOf(
  classes: readonly CreatureClassJson[],
  creatures: readonly CreatureJson[],
): { direct: Map<string, number>; total: Map<string, number> } {
  const direct = new Map<string, number>();
  for (const creature of creatures) direct.set(creature.category, (direct.get(creature.category) ?? 0) + 1);
  const total = new Map<string, number>();
  for (const entry of classes) {
    let sum = 0;
    for (const id of creatureClassSubtree(classes, entry.id)) sum += direct.get(id) ?? 0;
    total.set(entry.id, sum);
  }
  return { direct, total };
}

export function CreatureClassBar({
  classes,
  creatures,
  selected,
  locale,
  onSelect,
}: {
  readonly classes: readonly CreatureClassJson[];
  readonly creatures: readonly CreatureJson[];
  /** 고른 분류(어느 단계든). null = 전체 */
  readonly selected: string | null;
  readonly locale: "ko" | "en";
  readonly onSelect: (id: string | null) => void;
}) {
  const ko = locale !== "en";
  const nameOf = (entry: CreatureClassJson): string => (ko ? entry.name.ko : entry.name.en);
  const { total } = countsOf(classes, creatures);
  const path = selected === null ? [] : creatureClassPath(classes, selected);
  const ids = new Set(classes.map((entry) => entry.id));
  const childrenOf = (parent: string | undefined): CreatureClassJson[] =>
    classes.filter(
      (entry) => (entry.parent !== undefined && ids.has(entry.parent) ? entry.parent : undefined) === parent,
    );
  const large = path[0];
  const mid = path[1];
  const mids = large ? childrenOf(large.id) : [];
  const smalls = mid ? childrenOf(mid.id) : [];

  return (
    <div className="ce-class-bar" role="group" aria-label={ko ? "분류로 거르기" : "Filter by class"}>
      <div className="ce-class-cards">
        <button
          type="button"
          className="ce-class-card"
          aria-pressed={selected === null}
          data-active={selected === null ? "true" : undefined}
          onClick={() => onSelect(null)}
        >
          <span className="ce-class-icon" aria-hidden="true">
            ◎
          </span>
          <span className="ce-class-name">{ko ? "전체" : "All"}</span>
          <span className="ce-class-count">{ko ? `${creatures.length}종` : creatures.length}</span>
        </button>
        {childrenOf(undefined).map((entry) => {
          const active = large?.id === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              className="ce-class-card"
              data-class={entry.id}
              aria-pressed={active}
              data-active={active ? "true" : undefined}
              onClick={() => onSelect(active && selected === entry.id ? null : entry.id)}
            >
              <span className="ce-class-icon" aria-hidden="true">
                {entry.icon ?? "·"}
              </span>
              <span className="ce-class-name">{nameOf(entry)}</span>
              <span className="ce-class-count">
                {ko ? `${total.get(entry.id) ?? 0}종` : (total.get(entry.id) ?? 0)}
              </span>
            </button>
          );
        })}
      </div>
      {[
        { level: ko ? "중분류" : "Mid", parent: large, rows: mids, picked: mid },
        { level: ko ? "소분류" : "Small", parent: mid, rows: smalls, picked: path[2] },
      ].map(({ level, parent, rows, picked }) =>
        parent && rows.length > 0 ? (
          <div key={level} className="ce-class-chips">
            <span className="field-label">
              {nameOf(parent)} › {level}
            </span>
            <button
              type="button"
              className="ce-tag-chip"
              aria-pressed={picked === undefined}
              data-active={picked === undefined ? "true" : undefined}
              onClick={() => onSelect(parent.id)}
            >
              {ko ? "전체" : "All"} {total.get(parent.id) ?? 0}
            </button>
            {rows.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="ce-tag-chip"
                data-class={entry.id}
                aria-pressed={picked?.id === entry.id}
                data-active={picked?.id === entry.id ? "true" : undefined}
                onClick={() => onSelect(entry.id)}
              >
                {entry.icon ? `${entry.icon} ` : ""}
                {nameOf(entry)} {total.get(entry.id) ?? 0}
              </button>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}

/** 새 분류 넣기 칸(ID·한국어·영어·그림 글자) */
function AddClassForm({
  parent,
  usedIds,
  retired,
  locale,
  onAdd,
  onCancel,
}: {
  readonly parent: CreatureClassJson | null;
  readonly usedIds: ReadonlySet<string>;
  readonly retired: readonly string[];
  readonly locale: "ko" | "en";
  readonly onAdd: (entry: CreatureClassJson) => void;
  readonly onCancel: () => void;
}) {
  const ko = locale !== "en";
  const [id, setId] = useState("");
  const [nameKo, setNameKo] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const key = parent?.id ?? "root";

  const submit = (): void => {
    const code = id.trim().toLowerCase();
    if (!ID_PATTERN.test(code)) {
      setError(ko ? "ID는 영문 소문자로 시작하는 소문자·숫자·_ 2~48자여야 합니다." : "Invalid ID format.");
      return;
    }
    if (usedIds.has(code)) {
      setError(ko ? "이미 있는 분류 ID입니다." : "Class ID already exists.");
      return;
    }
    if (retired.includes(code)) {
      setError(ko ? "지운 적이 있는 ID는 다시 쓸 수 없습니다." : "Retired ID cannot be reused.");
      return;
    }
    const korean = nameKo.trim();
    if (korean === "") {
      setError(ko ? "한국어 이름을 적으세요." : "Enter a Korean name.");
      return;
    }
    onAdd({
      id: code,
      name: { ko: korean, en: nameEn.trim() || korean },
      ...(parent ? { parent: parent.id } : {}),
      ...(icon.trim() === "" ? {} : { icon: icon.trim() }),
    });
  };

  return (
    <div className="ce-class-add" data-parent={key}>
      <div className="ce-grid-4">
        <div className="field ce-field">
          <label className="field-label" htmlFor={`ce-class-new-id-${key}`}>
            {ko ? "분류 ID (영문 snake_case)" : "Class ID"}
          </label>
          <input
            id={`ce-class-new-id-${key}`}
            className="input"
            placeholder={parent ? `${parent.id}_fox` : "reptile"}
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </div>
        <div className="field ce-field">
          <label className="field-label" htmlFor={`ce-class-new-ko-${key}`}>
            {ko ? "한국어 이름" : "Korean name"}
          </label>
          <input
            id={`ce-class-new-ko-${key}`}
            className="input"
            placeholder={ko ? "여우류" : ""}
            value={nameKo}
            onChange={(e) => setNameKo(e.target.value)}
          />
        </div>
        <div className="field ce-field">
          <label className="field-label" htmlFor={`ce-class-new-en-${key}`}>
            {ko ? "영어 이름" : "English name"}
          </label>
          <input
            id={`ce-class-new-en-${key}`}
            className="input"
            placeholder="Foxes"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </div>
        <div className="field ce-field">
          <label className="field-label" htmlFor={`ce-class-new-icon-${key}`}>
            {ko ? "그림 글자 (선택)" : "Icon (optional)"}
          </label>
          <input
            id={`ce-class-new-icon-${key}`}
            className="input"
            maxLength={8}
            placeholder="🦊"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          />
        </div>
      </div>
      {error ? <p className="field-error">{error}</p> : null}
      <div className="be-actions">
        <button type="button" className="button-small ce-btn-accent" onClick={submit}>
          {parent
            ? ko
              ? `${parent.name.ko} 아래에 넣기`
              : `Add under ${parent.name.en}`
            : ko
              ? "대분류로 넣기"
              : "Add as large class"}
        </button>
        <button type="button" className="button-small" onClick={onCancel}>
          {ko ? "취소" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

const LEVEL_NAMES = [
  { ko: "대", en: "L" },
  { ko: "중", en: "M" },
  { ko: "소", en: "S" },
] as const;

export function CreatureClassEditor({
  list,
  rows,
  creatures,
  locale,
  onPut,
  onRemove,
  onClose,
}: {
  readonly list: CreatureEditorListResponse;
  /** 실효 분류(담은 바꿈 포함) */
  readonly rows: readonly CombinedClass[];
  readonly creatures: readonly CreatureJson[];
  readonly locale: "ko" | "en";
  /** 분류를 넣거나 고친다(담기) */
  readonly onPut: (entry: CreatureClassJson) => void;
  /** 분류를 지우거나(만든 것) 팩 원본으로 되돌린다(담기). 새로 담은 것이면 담기 취소 */
  readonly onRemove: (id: string) => void;
  /** 분류 편집 닫기 */
  readonly onClose: () => void;
}) {
  const ko = locale !== "en";
  // 넣기 칸이 열린 자리: 위 분류 ID, "" = 대분류, null = 닫힘
  const [adding, setAdding] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const classes = rows.map((row) => row.entry);
  const rowById = new Map(rows.map((row) => [row.entry.id, row]));
  const usedIds = new Set([...classes.map((entry) => entry.id), ...list.classes.map((row) => row.entry.id)]);
  const { direct, total } = countsOf(classes, creatures);
  const flat = flattenCreatureClasses(classes);
  const originOf = new Map(list.classes.map((row) => [row.entry.id, row.origin]));
  const hasChild = new Set(classes.flatMap((entry) => (entry.parent === undefined ? [] : [entry.parent])));
  const parentIds = [...hasChild];

  const q = query.trim().toLowerCase();
  const visibleIds =
    q === ""
      ? null
      : new Set(
          classes
            .filter(
              (entry) =>
                entry.id.toLowerCase().includes(q) ||
                entry.name.ko.toLowerCase().includes(q) ||
                entry.name.en.toLowerCase().includes(q),
            )
            .flatMap((entry) => creatureClassPath(classes, entry.id).map((p) => p.id)),
        );

  const visibleFlat = flat.filter(({ entry }) => {
    if (visibleIds !== null) return visibleIds.has(entry.id);
    if (collapsed.size === 0) return true;
    const path = creatureClassPath(classes, entry.id);
    // 위 분류 가운데 접힌 것이 있으면 숨긴다(자신은 보인다)
    return !path.slice(0, -1).some((ancestor) => collapsed.has(ancestor.id));
  });

  const toggleCollapse = (id: string): void => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  };

  const add = (entry: CreatureClassJson): void => {
    onPut(entry);
    if (entry.parent && collapsed.has(entry.parent)) {
      const next = new Set(collapsed);
      next.delete(entry.parent);
      setCollapsed(next);
    }
    setAdding(null);
  };

  return (
    <section className="be-card ce-class-editor" aria-label={ko ? "분류 편집" : "Edit classes"}>
      <div className="ce-card-head ce-class-editor-head">
        <div>
          <h3 className="ce-section-title">
            {ko ? `분류 편집 (대 · 중 · 소 — ${classes.length}개)` : `Edit Classes (${classes.length})`}
          </h3>
          <p className="field-hint">
            {ko
              ? "분류를 더하고 이름·위 분류를 바꿉니다. 크리쳐는 아래 표에서 골라 한 번에 옮깁니다. 바꿈은 아래 막대에서 [즉시 반영]으로 적용됩니다."
              : "Add, rename, or reparent classes. Select rows in the table below to move creatures in bulk, then Apply."}
          </p>
        </div>
        <div className="be-actions">
          <input
            type="search"
            className="input ce-class-search"
            placeholder={ko ? "분류 이름·ID 검색…" : "Search class…"}
            aria-label={ko ? "분류 검색" : "Search classes"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {parentIds.length > 0 ? (
            <button
              type="button"
              className="button-small"
              onClick={() => setCollapsed(collapsed.size > 0 ? new Set() : new Set(parentIds))}
            >
              {collapsed.size > 0 ? (ko ? "모두 펼치기" : "Expand All") : ko ? "모두 접기" : "Collapse All"}
            </button>
          ) : null}
          <button
            type="button"
            className="button-small ce-btn-accent"
            aria-expanded={adding === ""}
            onClick={() => setAdding(adding === "" ? null : "")}
          >
            {ko ? "+ 대분류 추가" : "+ Add Large Class"}
          </button>
          <button type="button" className="button-small" onClick={onClose}>
            {ko ? "닫기" : "Close"}
          </button>
        </div>
      </div>
      {adding === "" ? (
        <AddClassForm
          parent={null}
          usedIds={usedIds}
          retired={list.retiredClasses}
          locale={locale}
          onAdd={add}
          onCancel={() => setAdding(null)}
        />
      ) : null}

      <ul className="ce-class-tree">
        {visibleFlat.map(({ entry, depth }) => {
          const row = rowById.get(entry.id);
          const origin = originOf.get(entry.id);
          const level = LEVEL_NAMES[depth - 1] ?? LEVEL_NAMES[2];
          const mine = direct.get(entry.id) ?? 0;
          const all = total.get(entry.id) ?? 0;
          const isParent = hasChild.has(entry.id);
          const isCollapsed = collapsed.has(entry.id);
          const removable = row?.created === true && !isParent && mine === 0;
          const parents = classes.filter(
            (candidate) => candidate.id !== entry.id && canMoveCreatureClass(classes, entry.id, candidate.id),
          );
          const canBeLarge = canMoveCreatureClass(classes, entry.id, undefined);
          return (
            <li key={entry.id} className="ce-class-row" data-class={entry.id} data-depth={depth}>
              <div className="ce-class-row-main">
                {isParent ? (
                  <button
                    type="button"
                    className="ce-class-fold"
                    aria-expanded={!isCollapsed}
                    aria-label={
                      isCollapsed
                        ? ko
                          ? `${entry.name.ko} 펼치기`
                          : `Expand ${entry.name.en}`
                        : ko
                          ? `${entry.name.ko} 접기`
                          : `Collapse ${entry.name.en}`
                    }
                    onClick={() => toggleCollapse(entry.id)}
                  >
                    {isCollapsed ? "▸" : "▾"}
                  </button>
                ) : (
                  <span className="ce-class-fold-spacer" aria-hidden="true" />
                )}
                <span className="ce-class-level" data-depth={depth}>
                  {ko ? level.ko : level.en}
                </span>
                <input
                  className="input ce-class-icon-input"
                  aria-label={ko ? `${entry.name.ko} 그림 글자` : `${entry.name.en} icon`}
                  maxLength={8}
                  value={entry.icon ?? ""}
                  onChange={(e) =>
                    onPut({ ...entry, icon: e.target.value === "" ? undefined : e.target.value })
                  }
                />
                <input
                  className="input ce-class-ko-input"
                  aria-label={ko ? `${entry.id} 한국어 이름` : `${entry.id} Korean name`}
                  value={entry.name.ko}
                  onChange={(e) => onPut({ ...entry, name: { ...entry.name, ko: e.target.value } })}
                />
                <input
                  className="input ce-class-en-input"
                  aria-label={ko ? `${entry.id} 영어 이름` : `${entry.id} English name`}
                  value={entry.name.en}
                  onChange={(e) => onPut({ ...entry, name: { ...entry.name, en: e.target.value } })}
                />
                <select
                  className="ce-class-parent-select"
                  aria-label={ko ? `${entry.name.ko} 위 분류(옮기기)` : `${entry.name.en} parent (move)`}
                  value={entry.parent ?? ""}
                  onChange={(e) =>
                    onPut({ ...entry, parent: e.target.value === "" ? undefined : e.target.value })
                  }
                >
                  <option value="" disabled={!canBeLarge}>
                    {ko ? "— 대분류 —" : "— Large class —"}
                  </option>
                  {entry.parent !== undefined && !parents.some((p) => p.id === entry.parent) ? (
                    <option value={entry.parent}>{entry.parent}</option>
                  ) : null}
                  {parents.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {creatureClassPath(classes, candidate.id)
                        .map((p) => (ko ? p.name.ko : p.name.en))
                        .join(" › ")}
                    </option>
                  ))}
                </select>
                <div className="ce-class-row-meta">
                  <code className="dev-code">{entry.id}</code>
                  <span className="dev-muted">
                    {ko ? `${mine}종` : `${mine}`}
                    {all !== mine ? (ko ? ` (총 ${all})` : ` (${all} tot)`) : ""}
                  </span>
                  {row?.isNew ? <span className="dev-badge be-badge-staged">NEW</span> : null}
                  {!row?.isNew && row?.isStaged ? (
                    <span className="dev-badge be-badge-staged">{ko ? "담김" : "Staged"}</span>
                  ) : null}
                  {depth < CREATURE_CLASS_MAX_DEPTH ? (
                    <button
                      type="button"
                      className="button-small"
                      aria-expanded={adding === entry.id}
                      onClick={() => setAdding(adding === entry.id ? null : entry.id)}
                    >
                      {ko ? "+ 하위 분류" : "+ Sub-class"}
                    </button>
                  ) : null}
                  {origin === "edited" && !row?.isNew ? (
                    <button type="button" className="button-small" onClick={() => onRemove(entry.id)}>
                      {ko ? "팩 원본으로" : "Revert to Pack"}
                    </button>
                  ) : null}
                  {row?.created ? (
                    <button
                      type="button"
                      className="button-small"
                      disabled={!removable}
                      title={
                        removable
                          ? undefined
                          : ko
                            ? "아래 분류나 크리쳐가 있으면 지울 수 없습니다. 먼저 옮기세요."
                            : "Move sub-classes and creatures out first."
                      }
                      onClick={() => onRemove(entry.id)}
                    >
                      {ko ? "지우기" : "Delete"}
                    </button>
                  ) : (
                    <span
                      className="dev-muted"
                      title={
                        ko
                          ? "팩에 든 분류는 지울 수 없습니다(이름·자리만 바꿉니다)."
                          : "Pack classes cannot be deleted."
                      }
                    >
                      {ko ? "팩" : "Pack"}
                    </span>
                  )}
                </div>
              </div>
              {adding === entry.id ? (
                <AddClassForm
                  parent={entry}
                  usedIds={usedIds}
                  retired={list.retiredClasses}
                  locale={locale}
                  onAdd={add}
                  onCancel={() => setAdding(null)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
