// 크리쳐 도감 탭(CreatureDex) — 전체 크리쳐를 한 줄씩 빠르게 훑는 표. 줄을 고르면 상세 탭(도감 정보)으로 넘어간다.
// docs/adr/2026-11-25-creature-codex-groups.md 1절·"바뀜 (2026-11-25, 도감 다시 짜기)". 도감 값은 1레벨 기준이다.
// - 칸 차례: 크리쳐 → 스탯 합(사실상 등급 — 단계마다 색) → 6스탯 분포 막대 → STR·DEX·AGI·VIT·INT·WIS → 기술 슬롯 → 속성(아이콘, 강화형 구분)
//   → 크기 → 분류(대 › 중 › 소) → 등급 → 전리품.
// - 차례 바꾸기: 칸 머리를 누른다(합·스탯 여섯·기술 슬롯·이름, 다시 누르면 반대로, 한 번 더 누르면 도감 차례).
// - 걸러 보기: 분류 띠(대 → 중 → 소), 이름·ID, 등급, 크기, 주속성(아이콘), 주력 스탯, 합 범위, 스탯 하나의 최소값, 기술 슬롯 최소.
// - 변종은 대표 바로 아래에 들여 쓴다(그룹 묶기, 그룹마다 접기).
// - 분류 편집을 켜면 분류 편집기가 열리고 줄마다 고르기 칸이 생긴다: 고른 크리쳐를 한 번에 다른 분류로 옮긴다.
import {
  CREATURE_GRADES,
  CREATURE_PRIMARY_CODES,
  CREATURE_SIZES,
  type CreatureClassJson,
  type CreatureEditorListResponse,
  type CreatureJson,
  type CreaturePrimaryCode,
  creatureClassSubtree,
  creatureGroupRootId,
  creatureMainElement,
  creatureStatShares,
  creatureStatSumRange,
  flattenCreatureClasses,
  groupCreatures,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { CreatureClassBar, CreatureClassEditor } from "./CreatureClassPanel.tsx";
import { CreatureTokenBadge } from "./CreaturePortraitCropper.tsx";
import { ElementChip, ElementChips, StatShareBar, SumBadge, classPathText } from "./creatureBits.tsx";
import {
  type CombinedCreature,
  type CreatureStage,
  ELEMENT_LABELS,
  GRADE_LABELS,
  SIZE_LABELS,
  STAT_LABELS,
  combinedClasses,
  combinedCreatures,
} from "./creatureModel.ts";

// "codex" = 도감 차례(스탯 코드 dex와 겹치지 않게 다른 이름을 쓴다)
type SortKey = "codex" | "name" | "sum" | "slots" | CreaturePrimaryCode;
interface Sort {
  readonly key: SortKey;
  /** true = 큰 것부터(이름은 가나다 거꾸로) */
  readonly desc: boolean;
}
const DEX_ORDER: Sort = { key: "codex", desc: false };
const SLOT_PIPS = Array.from({ length: 10 }, (_, index) => index);

interface DexRow extends CombinedCreature {
  /** 변종이면 들여 쓴다. orphan = 대표가 지금 목록(걸러진 것)에 없다 */
  readonly depth: 0 | 1;
  readonly orphan: boolean;
  /** 대표 줄일 때 그 그룹의 변종 수(걸러진 뒤) */
  readonly variantCount: number;
  readonly rootId: string;
}

const statSumOf = (entry: CreatureJson): number =>
  CREATURE_PRIMARY_CODES.reduce((acc, code) => acc + entry.primaries[code], 0);

const isStat = (key: SortKey): key is CreaturePrimaryCode =>
  (CREATURE_PRIMARY_CODES as readonly string[]).includes(key);

/** 빈 글이면 null, 아니면 수(수가 아니면 null) */
function numberOf(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** 줄을 세우는 값(이름 차례는 따로) */
function sortValue(entry: CreatureJson, key: SortKey): number {
  if (key === "sum") return statSumOf(entry);
  if (key === "slots") return entry.skillSlots.base * 100 + entry.skillSlots.max;
  return isStat(key) ? entry.primaries[key] : 0;
}

export function CreatureDex({
  list,
  stage,
  selected,
  locale,
  onOpen,
  onEditMany,
  onPutClass,
  onRemoveClass,
}: {
  readonly list: CreatureEditorListResponse;
  readonly stage: CreatureStage;
  readonly selected: string | null;
  readonly locale: "ko" | "en";
  readonly onOpen: (id: string) => void;
  /** 여러 크리쳐를 한 번에 담는다(분류 옮기기) */
  readonly onEditMany: (entries: readonly CreatureJson[]) => void;
  readonly onPutClass: (entry: CreatureClassJson) => void;
  readonly onRemoveClass: (id: string) => void;
}) {
  const ko = locale !== "en";
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState<string | null>(null);
  const [grade, setGrade] = useState("all");
  const [size, setSize] = useState("all");
  const [element, setElement] = useState<number | null>(null);
  const [topStat, setTopStat] = useState("all");
  const [sumMin, setSumMin] = useState("");
  const [sumMax, setSumMax] = useState("");
  const [statKey, setStatKey] = useState<CreaturePrimaryCode>("str");
  const [statMin, setStatMin] = useState("");
  const [slotMin, setSlotMin] = useState("");
  const [sort, setSort] = useState<Sort>(DEX_ORDER);
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");

  const all = combinedCreatures(list, stage);
  const classRows = combinedClasses(list, stage);
  const classes = classRows.map((row) => row.entry);
  const allEntries = all.map((row) => row.entry);
  const nameOf = (entry: CreatureJson): string => (ko ? entry.name.ko : entry.name.en);
  const nameById = new Map(all.map((row) => [row.entry.id, nameOf(row.entry)]));
  // 고른 분류가 지워졌으면(담은 지우기) 전체로 본다
  const activeClass = classId !== null && classes.some((entry) => entry.id === classId) ? classId : null;
  const classIds = activeClass === null ? null : creatureClassSubtree(classes, activeClass);

  const q = search.trim().toLowerCase();
  const minSum = numberOf(sumMin);
  const maxSum = numberOf(sumMax);
  const minStat = numberOf(statMin);
  const minSlot = numberOf(slotMin);
  const filtered = all.filter(({ entry }) => {
    if (classIds !== null && !classIds.has(entry.category)) return false;
    if (grade !== "all" && entry.grade !== grade) return false;
    if (size !== "all" && entry.size !== size) return false;
    if (element !== null && creatureMainElement(entry.elements) !== element) return false;
    if (topStat !== "all" && creatureStatShares(entry.primaries).top !== topStat) return false;
    const sum = statSumOf(entry);
    if (minSum !== null && sum < minSum) return false;
    if (maxSum !== null && sum > maxSum) return false;
    if (minStat !== null && entry.primaries[statKey] < minStat) return false;
    if (minSlot !== null && entry.skillSlots.base < minSlot) return false;
    if (q === "") return true;
    return (
      entry.id.toLowerCase().includes(q) ||
      entry.name.ko.toLowerCase().includes(q) ||
      entry.name.en.toLowerCase().includes(q)
    );
  });
  const filtering =
    q !== "" ||
    activeClass !== null ||
    grade !== "all" ||
    size !== "all" ||
    element !== null ||
    topStat !== "all" ||
    minSum !== null ||
    maxSum !== null ||
    minStat !== null ||
    minSlot !== null;
  const resetFilters = (): void => {
    setSearch("");
    setClassId(null);
    setGrade("all");
    setSize("all");
    setElement(null);
    setTopStat("all");
    setSumMin("");
    setSumMax("");
    setStatMin("");
    setSlotMin("");
  };

  const compare = (a: CombinedCreature, b: CombinedCreature): number => {
    const way = sort.desc ? -1 : 1;
    if (sort.key === "name") return nameOf(a.entry).localeCompare(nameOf(b.entry), locale) * way;
    return (
      (sortValue(a.entry, sort.key) - sortValue(b.entry, sort.key)) * way ||
      statSumOf(b.entry) - statSumOf(a.entry)
    );
  };
  const sorted = sort.key !== "codex";

  const rows: DexRow[] = [];
  if (grouped) {
    const groups = groupCreatures(filtered, (row) => row.entry);
    const ordered = sorted
      ? groups.toSorted((a, b) => {
          const left = a.root ?? a.variants[0];
          const right = b.root ?? b.variants[0];
          return left && right ? compare(left, right) : 0;
        })
      : groups;
    for (const group of ordered) {
      const variants = sorted ? group.variants.toSorted(compare) : group.variants;
      if (group.root)
        rows.push({
          ...group.root,
          depth: 0,
          orphan: false,
          variantCount: variants.length,
          rootId: group.rootId,
        });
      if (group.root && collapsed.has(group.rootId)) continue;
      for (const variant of variants)
        rows.push({
          ...variant,
          depth: 1,
          orphan: group.root === null,
          variantCount: 0,
          rootId: group.rootId,
        });
    }
  } else {
    for (const row of sorted ? filtered.toSorted(compare) : filtered)
      rows.push({ ...row, depth: 0, orphan: false, variantCount: 0, rootId: creatureGroupRootId(row.entry) });
  }

  const groupCount = groupCreatures(all, (row) => row.entry).filter(
    (group) => group.variants.length > 0,
  ).length;
  const statMax = Math.max(
    10,
    ...allEntries.flatMap((entry) => CREATURE_PRIMARY_CODES.map((code) => entry.primaries[code])),
  );
  const toggleGroup = (rootId: string): void => {
    const next = new Set(collapsed);
    if (next.has(rootId)) next.delete(rootId);
    else next.add(rootId);
    setCollapsed(next);
  };
  const togglePick = (id: string): void => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  // 칸 머리를 누르면: 큰 것부터 → 작은 것부터 → 도감 차례(이름은 가나다 → 거꾸로 → 도감 차례)
  const sortBy = (key: SortKey): void => {
    const firstDesc = key !== "name";
    if (sort.key !== key) setSort({ key, desc: firstDesc });
    else if (sort.desc === firstDesc) setSort({ key, desc: !firstDesc });
    else setSort(DEX_ORDER);
  };
  const sortHead = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        className={className}
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
        data-stat={isStat(key) ? key : undefined}
      >
        <button
          type="button"
          className="ce-sort"
          data-sort={key}
          data-active={active ? "true" : undefined}
          onClick={() => sortBy(key)}
        >
          {label}
          <span aria-hidden="true">{active ? (sort.desc ? " ▼" : " ▲") : ""}</span>
        </button>
      </th>
    );
  };

  const flatClasses = flattenCreatureClasses(classes);
  const moveTarget = classes.some((entry) => entry.id === moveTo) ? moveTo : "";
  const movePicked = (): void => {
    if (moveTarget === "") return;
    onEditMany(
      all
        .filter((row) => picked.has(row.entry.id) && row.entry.category !== moveTarget)
        .map((row) => ({ ...row.entry, category: moveTarget })),
    );
    setPicked(new Set());
  };

  return (
    <div className="ce-dex" data-count={rows.length}>
      <CreatureClassBar
        classes={classes}
        creatures={allEntries}
        selected={activeClass}
        locale={locale}
        onSelect={setClassId}
      />

      <div className="ce-filter-bar">
        <div className="ce-filter-top">
          <input
            type="search"
            className="input ce-search-input"
            placeholder={ko ? "이름·ID 검색…" : "Search name or ID…"}
            aria-label={ko ? "도감 검색" : "Search codex"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="dev-badge">
            {ko
              ? `${filtered.length} / ${all.length}종 · 변종 그룹 ${groupCount}개`
              : `${filtered.length} / ${all.length} · ${groupCount} variant groups`}
          </span>
          <button type="button" className="button-small" disabled={!filtering} onClick={resetFilters}>
            {ko ? "필터 초기화" : "Reset Filters"}
          </button>
          <button
            type="button"
            className="button-small"
            aria-pressed={grouped}
            onClick={() => setGrouped(!grouped)}
          >
            {ko ? "그룹으로 묶기" : "Group variants"}
          </button>
          <button
            type="button"
            className="button-small ce-btn-accent"
            aria-pressed={editing}
            onClick={() => {
              setEditing(!editing);
              setPicked(new Set());
            }}
          >
            {ko ? "분류 편집" : "Edit Classes"}
          </button>
        </div>

        <div className="ce-dex-filters">
          <select aria-label={ko ? "등급" : "Grade"} value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="all">{ko ? "모든 등급" : "All grades"}</option>
            {CREATURE_GRADES.map((g) => (
              <option key={g} value={g}>
                {ko ? GRADE_LABELS[g].ko : GRADE_LABELS[g].en}
              </option>
            ))}
          </select>
          <select aria-label={ko ? "크기" : "Size"} value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="all">{ko ? "모든 크기" : "All sizes"}</option>
            {CREATURE_SIZES.map((s) => (
              <option key={s} value={s}>
                {ko ? SIZE_LABELS[s].ko : SIZE_LABELS[s].en}
              </option>
            ))}
          </select>
          <select
            aria-label={ko ? "주력 스탯" : "Top stat"}
            value={topStat}
            onChange={(e) => setTopStat(e.target.value)}
          >
            <option value="all">{ko ? "주력 스탯 전체" : "Any top stat"}</option>
            {CREATURE_PRIMARY_CODES.map((code) => (
              <option key={code} value={code}>
                {ko ? `주력 ${STAT_LABELS[code].ko}` : `Top ${STAT_LABELS[code].en}`}
              </option>
            ))}
          </select>
          <span className="ce-dex-range">
            <span className="field-label">{ko ? "스탯 합" : "Sum"}</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder={ko ? "최소" : "min"}
              aria-label={ko ? "스탯 합 최소" : "Minimum stat sum"}
              value={sumMin}
              onChange={(e) => setSumMin(e.target.value)}
            />
            <span aria-hidden="true">~</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder={ko ? "최대" : "max"}
              aria-label={ko ? "스탯 합 최대" : "Maximum stat sum"}
              value={sumMax}
              onChange={(e) => setSumMax(e.target.value)}
            />
          </span>
          <span className="ce-dex-range">
            <select
              aria-label={ko ? "거를 스탯" : "Stat to filter"}
              value={statKey}
              onChange={(e) => {
                const next = CREATURE_PRIMARY_CODES.find((code) => code === e.target.value);
                if (next) setStatKey(next);
              }}
            >
              {CREATURE_PRIMARY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code.toUpperCase()}
                </option>
              ))}
            </select>
            <span aria-hidden="true">≥</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder={ko ? "최소" : "min"}
              aria-label={ko ? "고른 스탯 최소값" : "Minimum of the chosen stat"}
              value={statMin}
              onChange={(e) => setStatMin(e.target.value)}
            />
          </span>
          <span className="ce-dex-range">
            <span className="field-label">{ko ? "기술 슬롯 ≥" : "Slots ≥"}</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="1~10"
              aria-label={ko ? "기술 슬롯 최소" : "Minimum skill slots"}
              value={slotMin}
              onChange={(e) => setSlotMin(e.target.value)}
            />
          </span>
        </div>

        <div
          className="ce-el-filter"
          role="group"
          aria-label={ko ? "주속성으로 거르기" : "Filter by main element"}
        >
          <span className="field-label">{ko ? "주속성" : "Main element"}</span>
          <button
            type="button"
            className="ce-tag-chip"
            aria-pressed={element === null}
            data-active={element === null ? "true" : undefined}
            onClick={() => setElement(null)}
          >
            {ko ? "전체" : "All"}
          </button>
          {ELEMENT_LABELS.map((info, index) => (
            <button
              key={info.id}
              type="button"
              className="ce-el-button"
              data-element={info.id}
              aria-pressed={element === index}
              data-active={element === index ? "true" : undefined}
              onClick={() => setElement(element === index ? null : index)}
            >
              <ElementChip index={index} locale={locale} />
              <span className="ce-el-name" aria-hidden="true">
                {ko ? info.ko : info.en}
              </span>
            </button>
          ))}
        </div>
        <p className="field-hint">
          {ko
            ? "도감 값은 1레벨 기준입니다. 조우하는 개체는 스탯마다 기준 ± 오차 범위 안에서 정해집니다(레벨·출현 확률은 인카운터에서, K값은 0.8~1.2 랜덤). 칸 머리를 누르면 그 값으로 줄을 세웁니다."
            : "Codex values are for level 1. Encountered individuals roll each stat within base ± spread (level and spawn chance come from encounters; K is random 0.8–1.2). Click a column header to sort."}
        </p>
      </div>

      {editing ? (
        <CreatureClassEditor
          list={list}
          rows={classRows}
          creatures={allEntries}
          locale={locale}
          onPut={onPutClass}
          onRemove={onRemoveClass}
          onClose={() => {
            setEditing(false);
            setPicked(new Set());
          }}
        />
      ) : null}

      {editing ? (
        <div
          className="be-card ce-dex-move"
          role="group"
          aria-label={ko ? "고른 크리쳐 분류 옮기기" : "Move selected creatures"}
        >
          <strong>{ko ? `${picked.size}종 고름` : `${picked.size} selected`}</strong>
          <button
            type="button"
            className="button-small"
            onClick={() => setPicked(new Set(rows.map((row) => row.entry.id)))}
          >
            {ko ? "보이는 줄 모두 고르기" : "Select Shown"}
          </button>
          <button
            type="button"
            className="button-small"
            disabled={picked.size === 0}
            onClick={() => setPicked(new Set())}
          >
            {ko ? "고르기 풀기" : "Clear"}
          </button>
          <select
            aria-label={ko ? "옮길 분류" : "Target class"}
            value={moveTarget}
            onChange={(e) => setMoveTo(e.target.value)}
          >
            <option value="">{ko ? "— 옮길 분류 —" : "— Target class —"}</option>
            {flatClasses.map(({ entry }) => (
              <option key={entry.id} value={entry.id}>
                {classPathText(classes, entry.id, locale)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button-small ce-btn-accent"
            disabled={picked.size === 0 || moveTarget === ""}
            onClick={movePicked}
          >
            {ko ? "이 분류로 옮기기" : "Move to Class"}
          </button>
        </div>
      ) : null}

      <div className="dev-table-wrap ce-dex-wrap">
        <table className="dev-table ce-dex-table">
          <thead>
            <tr>
              {editing ? <th>{ko ? "고름" : "Pick"}</th> : null}
              {sortHead("name", ko ? "크리쳐" : "Creature")}
              {sortHead("sum", ko ? "스탯 합" : "Stat sum")}
              <th>{ko ? "6스탯 분포" : "6-stat split"}</th>
              {CREATURE_PRIMARY_CODES.map((code) =>
                sortHead(code, code.toUpperCase(), "ce-dex-wide ce-dex-num"),
              )}
              {sortHead("slots", ko ? "기술 슬롯" : "Skill slots")}
              <th>{ko ? "속성" : "Elements"}</th>
              <th className="ce-dex-wide">{ko ? "크기" : "Size"}</th>
              <th className="ce-dex-wide">{ko ? "분류" : "Class"}</th>
              <th className="ce-dex-wide">{ko ? "등급" : "Grade"}</th>
              <th className="ce-dex-wide">{ko ? "전리품" : "Loot"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { entry } = row;
              const sum = creatureStatSumRange(entry);
              const slots = entry.skillSlots;
              return (
                <tr
                  key={entry.id}
                  className="ce-dex-row"
                  data-id={entry.id}
                  data-depth={row.depth}
                  data-selected={selected === entry.id ? "true" : undefined}
                  onClick={() => onOpen(entry.id)}
                >
                  {editing ? (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={ko ? `${nameOf(entry)} 고르기` : `Select ${nameOf(entry)}`}
                        checked={picked.has(entry.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => togglePick(entry.id)}
                      />
                    </td>
                  ) : null}
                  <td>
                    <div className="ce-dex-name">
                      {row.depth === 1 ? (
                        <span className="ce-dex-branch" aria-hidden="true">
                          └
                        </span>
                      ) : null}
                      <CreatureTokenBadge
                        image={entry.image}
                        crop={entry.portraitCrop}
                        grade={entry.grade}
                        sizePx={32}
                        alt=""
                      />
                      <div className="ce-dex-title">
                        <button
                          type="button"
                          className="ce-dex-open"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpen(entry.id);
                          }}
                        >
                          {nameOf(entry)}
                        </button>
                        <span className="ce-row-name">
                          <code className="dev-code">{entry.id}</code>
                          {!entry.enabled ? <span className="dev-badge">OFF</span> : null}
                          {row.isNew ? <span className="dev-badge be-badge-staged">NEW</span> : null}
                          {!row.isNew && row.isStaged ? (
                            <span className="dev-badge be-badge-staged">
                              {row.isReverting ? (ko ? "되돌림" : "Revert") : ko ? "담김" : "Staged"}
                            </span>
                          ) : null}
                          {row.orphan ? (
                            <span className="dev-muted">
                              {ko ? "대표: " : "Lead: "}
                              {nameById.get(row.rootId) ?? row.rootId}
                            </span>
                          ) : null}
                          {row.variantCount > 0 ? (
                            <button
                              type="button"
                              className="ce-tag-chip"
                              aria-expanded={!collapsed.has(row.rootId)}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleGroup(row.rootId);
                              }}
                            >
                              {ko ? `변종 ${row.variantCount}` : `${row.variantCount} variants`}{" "}
                              {collapsed.has(row.rootId) ? "▸" : "▾"}
                            </button>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td data-sorted={sort.key === "sum" ? "true" : undefined}>
                    <SumBadge sum={sum.base} range={`${sum.min}~${sum.max}`} />
                  </td>
                  <td>
                    <StatShareBar primaries={entry.primaries} locale={locale} />
                  </td>
                  {CREATURE_PRIMARY_CODES.map((code) => (
                    <td
                      key={code}
                      className="ce-dex-wide ce-dex-num ce-dex-stat"
                      data-stat={code}
                      data-sorted={sort.key === code ? "true" : undefined}
                    >
                      <span
                        className="ce-dex-stat-bar"
                        style={{
                          width: `${Math.min(100, (entry.primaries[code] / statMax) * 100).toFixed(0)}%`,
                        }}
                      />
                      <span className="ce-dex-stat-value">{entry.primaries[code]}</span>
                    </td>
                  ))}
                  <td data-sorted={sort.key === "slots" ? "true" : undefined}>
                    <span
                      className="ce-slots"
                      data-slots={slots.base}
                      title={
                        ko
                          ? `기술 슬롯 기본 ${slots.base} · 환생마다 +${slots.perRebirth} · 최대 ${slots.max}`
                          : `Skill slots: base ${slots.base} · +${slots.perRebirth} per rebirth · max ${slots.max}`
                      }
                    >
                      <strong>{slots.base}</strong>
                      <span className="dev-muted">/{slots.max}</span>
                      <span className="ce-slot-pips" aria-hidden="true">
                        {SLOT_PIPS.map((index) => (
                          <span
                            key={index}
                            data-state={index < slots.base ? "base" : index < slots.max ? "max" : undefined}
                          />
                        ))}
                      </span>
                    </span>
                  </td>
                  <td>
                    <ElementChips elements={entry.elements} locale={locale} />
                  </td>
                  <td className="ce-dex-wide">
                    <strong>{entry.size}</strong>
                    {entry.giant3Tile ? (ko ? " (3칸)" : " (3 tiles)") : ""}
                  </td>
                  <td className="ce-dex-wide ce-dex-class">
                    {classPathText(classes, entry.category, locale)}
                  </td>
                  <td className="ce-dex-wide">
                    <span className="ce-grade-pill" data-grade={entry.grade}>
                      {entry.grade.toUpperCase()}
                    </span>
                  </td>
                  <td className="ce-dex-wide">{entry.drops?.length ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="field-hint be-pick">
            {ko ? "조건에 맞는 크리쳐가 없습니다." : "No creatures match."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
