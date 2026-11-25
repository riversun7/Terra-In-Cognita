// 크리쳐 도감 탭(CreatureDex) — 전체 크리쳐를 한 줄씩 빠르게 훑는 목록. 줄을 고르면 상세 탭(도감 정보)으로 넘어간다.
// docs/adr/2026-11-25-creature-codex-groups.md 1절. 도감 값은 1레벨 기준이고 스탯은 기준값과 조우 범위(합)를 같이 보인다.
// - 그룹 묶기(기본 켬): 변종은 대표 바로 아래에 들여 쓴다. 대표가 걸러져 안 보이면 변종만 "대표: …" 표시와 함께 보인다. 그룹마다 접을 수 있다.
// - 걸러 보기: 이름·ID, 분류, 등급, 주속성, 스탯 성향. 차례: 도감 차례·이름·등급·스탯 합.
import {
  CREATURE_CATEGORIES,
  CREATURE_GRADES,
  CREATURE_PRIMARY_CODES,
  CREATURE_STAT_LEANS,
  type CreatureEditorListResponse,
  type CreatureJson,
  creatureGroupRootId,
  creatureStatProfile,
  creatureStatSumRange,
  groupCreatures,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { CreatureTokenBadge } from "./CreaturePortraitCropper.tsx";
import {
  CATEGORY_LABELS,
  type CombinedCreature,
  type CreatureStage,
  ELEMENT_LABELS,
  GRADE_LABELS,
  LEAN_LABELS,
  combinedCreatures,
  mainElementIndex,
} from "./creatureModel.ts";

type SortKey = "dex" | "name" | "grade" | "sum";

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

const gradeRank = (entry: CreatureJson): number => CREATURE_GRADES.indexOf(entry.grade);

export function CreatureDex({
  list,
  stage,
  selected,
  locale,
  onOpen,
}: {
  readonly list: CreatureEditorListResponse;
  readonly stage: CreatureStage;
  readonly selected: string | null;
  readonly locale: "ko" | "en";
  readonly onOpen: (id: string) => void;
}) {
  const ko = locale !== "en";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [grade, setGrade] = useState("all");
  const [element, setElement] = useState("all");
  const [lean, setLean] = useState("all");
  const [sort, setSort] = useState<SortKey>("dex");
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const all = combinedCreatures(list, stage);
  const nameOf = (entry: CreatureJson): string => (ko ? entry.name.ko : entry.name.en);
  const nameById = new Map(all.map((row) => [row.entry.id, nameOf(row.entry)]));

  const q = search.trim().toLowerCase();
  const filtered = all.filter(({ entry }) => {
    if (category !== "all" && entry.category !== category) return false;
    if (grade !== "all" && entry.grade !== grade) return false;
    if (element !== "all" && String(mainElementIndex(entry.elements)) !== element) return false;
    if (lean !== "all" && creatureStatProfile(entry.primaries).lean !== lean) return false;
    if (q === "") return true;
    return (
      entry.id.toLowerCase().includes(q) ||
      entry.name.ko.toLowerCase().includes(q) ||
      entry.name.en.toLowerCase().includes(q)
    );
  });

  const compare = (a: CombinedCreature, b: CombinedCreature): number => {
    if (sort === "name") return nameOf(a.entry).localeCompare(nameOf(b.entry), locale);
    if (sort === "grade")
      return gradeRank(b.entry) - gradeRank(a.entry) || statSumOf(b.entry) - statSumOf(a.entry);
    if (sort === "sum") return statSumOf(b.entry) - statSumOf(a.entry);
    return 0;
  };

  const rows: DexRow[] = [];
  if (grouped) {
    const groups = groupCreatures(filtered, (row) => row.entry);
    const lead = (group: (typeof groups)[number]): CombinedCreature | undefined =>
      group.root ?? group.variants[0];
    const ordered =
      sort === "dex"
        ? groups
        : groups.toSorted((a, b) => {
            const left = lead(a);
            const right = lead(b);
            return left && right ? compare(left, right) : 0;
          });
    for (const group of ordered) {
      const variants = sort === "dex" ? group.variants : group.variants.toSorted(compare);
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
    const ordered = sort === "dex" ? filtered : filtered.toSorted(compare);
    for (const row of ordered)
      rows.push({
        ...row,
        depth: 0,
        orphan: false,
        variantCount: 0,
        rootId: creatureGroupRootId(row.entry),
      });
  }

  const groupCount = groupCreatures(all, (row) => row.entry).filter(
    (group) => group.variants.length > 0,
  ).length;
  const toggle = (rootId: string): void => {
    const next = new Set(collapsed);
    if (next.has(rootId)) next.delete(rootId);
    else next.add(rootId);
    setCollapsed(next);
  };

  return (
    <div className="ce-dex" data-count={rows.length}>
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
          <button
            type="button"
            className="button-small"
            aria-pressed={grouped}
            onClick={() => setGrouped(!grouped)}
          >
            {ko ? "그룹으로 묶기" : "Group variants"}
          </button>
        </div>
        <div className="ce-filter-selects">
          <select
            aria-label={ko ? "종족 주분류" : "Category"}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">{ko ? "모든 분류" : "All categories"}</option>
            {CREATURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ko ? CATEGORY_LABELS[c].ko : CATEGORY_LABELS[c].en}
              </option>
            ))}
          </select>
          <select aria-label={ko ? "등급" : "Grade"} value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="all">{ko ? "모든 등급" : "All grades"}</option>
            {CREATURE_GRADES.map((g) => (
              <option key={g} value={g}>
                {ko ? GRADE_LABELS[g].ko : GRADE_LABELS[g].en}
              </option>
            ))}
          </select>
          <select
            aria-label={ko ? "주속성" : "Main element"}
            value={element}
            onChange={(e) => setElement(e.target.value)}
          >
            <option value="all">{ko ? "모든 주속성" : "All main elements"}</option>
            {ELEMENT_LABELS.map((info, index) => (
              <option key={info.id} value={String(index)}>
                {ko ? info.ko : info.en}
              </option>
            ))}
            <option value="null">{ko ? "속성 없음" : "No element"}</option>
          </select>
          <select
            aria-label={ko ? "스탯 성향" : "Stat lean"}
            value={lean}
            onChange={(e) => setLean(e.target.value)}
          >
            <option value="all">{ko ? "모든 스탯 성향" : "All stat leans"}</option>
            {CREATURE_STAT_LEANS.map((code) => (
              <option key={code} value={code}>
                {ko ? LEAN_LABELS[code].ko : LEAN_LABELS[code].en}
              </option>
            ))}
          </select>
          <select
            aria-label={ko ? "차례" : "Sort"}
            value={sort}
            onChange={(e) => {
              const next = (["dex", "name", "grade", "sum"] as const).find((key) => key === e.target.value);
              if (next) setSort(next);
            }}
          >
            <option value="dex">{ko ? "도감 차례" : "Codex order"}</option>
            <option value="name">{ko ? "이름 차례" : "By name"}</option>
            <option value="grade">{ko ? "등급 높은 차례" : "By grade"}</option>
            <option value="sum">{ko ? "스탯 합 큰 차례" : "By stat sum"}</option>
          </select>
        </div>
        <p className="field-hint">
          {ko
            ? "도감 값은 1레벨 기준입니다. 조우하는 개체는 스탯마다 기준 ± 오차 범위 안에서 정해집니다(레벨·출현 확률은 인카운터에서, K값은 0.8~1.2 랜덤)."
            : "Codex values are for level 1. Encountered individuals roll each stat within base ± spread (level and spawn chance come from encounters; K is random 0.8–1.2)."}
        </p>
      </div>

      <div className="dev-table-wrap ce-dex-wrap">
        <table className="dev-table ce-dex-table">
          <thead>
            <tr>
              <th>{ko ? "크리쳐" : "Creature"}</th>
              <th>{ko ? "분류 · 등급" : "Category · Grade"}</th>
              <th className="ce-dex-wide">{ko ? "크기" : "Size"}</th>
              <th className="ce-dex-wide">{ko ? "속성" : "Elements"}</th>
              <th>{ko ? "스탯 성향" : "Stat lean"}</th>
              <th className="ce-dex-wide">STR · DEX · AGI · VIT · INT · WIS</th>
              <th>{ko ? "합 (조우 범위)" : "Sum (range)"}</th>
              <th className="ce-dex-wide">{ko ? "전리품" : "Loot"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { entry } = row;
              const profile = creatureStatProfile(entry.primaries);
              const sum = creatureStatSumRange(entry);
              const elements = entry.elements
                .map((points, index) => ({ points, index }))
                .filter((item) => item.points > 0)
                .toSorted((a, b) => b.points - a.points || a.index - b.index)
                .slice(0, 3);
              return (
                <tr
                  key={entry.id}
                  className="ce-dex-row"
                  data-id={entry.id}
                  data-depth={row.depth}
                  data-selected={selected === entry.id ? "true" : undefined}
                  onClick={() => onOpen(entry.id)}
                >
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
                                toggle(row.rootId);
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
                  <td>
                    <div>
                      {ko
                        ? CATEGORY_LABELS[entry.category].ko.split(" ")[0]
                        : CATEGORY_LABELS[entry.category].en}
                    </div>
                    <span className="ce-grade-pill" data-grade={entry.grade}>
                      {entry.grade.toUpperCase()}
                    </span>
                  </td>
                  <td className="ce-dex-wide">
                    <strong>{entry.size}</strong>
                    {entry.giant3Tile ? (ko ? " (3칸)" : " (3 tiles)") : ""}
                  </td>
                  <td className="ce-dex-wide">
                    <div className="ce-dex-elements">
                      {elements.length === 0 ? <span className="dev-muted">-</span> : null}
                      {elements.map(({ points, index }) => {
                        const info = ELEMENT_LABELS[index];
                        if (!info) return null;
                        return (
                          <span key={info.id} className="ce-dex-element">
                            <span className="ce-element-dot" style={{ backgroundColor: info.color }} />
                            {(ko ? info.ko : info.en).split(" ")[0]} {points}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <div className="ce-dex-lean" data-lean={profile.lean}>
                      <span>{ko ? LEAN_LABELS[profile.lean].ko : LEAN_LABELS[profile.lean].en}</span>
                      <span
                        className="ce-lean-bar"
                        title={
                          ko
                            ? `물리(STR·VIT) ${profile.sharePm.physical / 10}% · 기교(DEX·AGI) ${profile.sharePm.finesse / 10}% · 마법(INT·WIS) ${profile.sharePm.magic / 10}%`
                            : `Physical ${profile.sharePm.physical / 10}% · Finesse ${profile.sharePm.finesse / 10}% · Magic ${profile.sharePm.magic / 10}%`
                        }
                      >
                        <span data-part="physical" style={{ width: `${profile.sharePm.physical / 10}%` }} />
                        <span data-part="finesse" style={{ width: `${profile.sharePm.finesse / 10}%` }} />
                        <span data-part="magic" style={{ width: `${profile.sharePm.magic / 10}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="ce-dex-wide">
                    <span className="ce-dex-stats">
                      {(["str", "dex", "agi", "vit", "int", "wis"] as const).map((code) => (
                        <span key={code} data-stat={code}>
                          {entry.primaries[code]}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>
                    <strong>{sum.base}</strong>{" "}
                    <span className="dev-muted">
                      ({sum.min}~{sum.max})
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
