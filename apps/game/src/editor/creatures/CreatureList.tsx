// 크리처 편집기 목록 판(CreatureList) — 검색·주분류·등급·세트 태그 필터, [+ 새 크리처 등록] 연속 워크플로, 원형 초상화 배지 표.
import {
  CREATURE_CATEGORIES,
  CREATURE_GRADES,
  CREATURE_PRESET_TAGS,
  CREATURE_PRIMARY_CODES,
  type CreatureEditorListResponse,
  type CreatureJson,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { CreatureTokenBadge } from "./CreaturePortraitCropper.tsx";
import { CATEGORY_LABELS, type CreatureStage, GRADE_LABELS, PRESET_TAG_LABELS } from "./creatureModel.ts";

export function CreatureList({
  list,
  stage,
  selected,
  locale,
  onSelect,
  onCreateNew,
}: {
  readonly list: CreatureEditorListResponse;
  readonly stage: CreatureStage;
  readonly selected: string | null;
  readonly locale: "ko" | "en";
  readonly onSelect: (id: string) => void;
  readonly onCreateNew: (id: string, nameKo: string, nameEn: string, image?: string) => void;
}) {
  const ko = locale !== "en";
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newNameKo, setNewNameKo] = useState("");
  const [newNameEn, setNewNameEn] = useState("");
  const [newImage, setNewImage] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);

  // 실효 목록 + 아직 저장하지 않은 새로 담은 크리처 합치기
  const existingIds = new Set(list.creatures.map((r) => r.entry.id));
  const stagedNewEntries: CreatureJson[] = [];
  for (const [id, st] of stage.creatures) {
    if (!existingIds.has(id) && st.op === "put") stagedNewEntries.push(st.entry);
  }

  const combined: {
    readonly entry: CreatureJson;
    readonly isStaged: boolean;
    readonly isNew: boolean;
    readonly isReverting: boolean;
  }[] = [
    ...stagedNewEntries.map((entry) => ({
      entry,
      isStaged: true,
      isNew: true,
      isReverting: false,
    })),
    ...list.creatures.map((row) => {
      const st = stage.creatures.get(row.entry.id);
      return {
        entry: st?.op === "put" ? st.entry : row.entry,
        isStaged: st !== undefined,
        isNew: false,
        isReverting: st?.op === "revert",
      };
    }),
  ];

  const q = search.trim().toLowerCase();
  const filtered = combined.filter(({ entry }) => {
    if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
    if (gradeFilter !== "all" && entry.grade !== gradeFilter) return false;
    if (tagFilter !== "all" && !entry.tags?.includes(tagFilter)) return false;
    if (q !== "") {
      const hit =
        entry.id.toLowerCase().includes(q) ||
        entry.name.ko.toLowerCase().includes(q) ||
        entry.name.en.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const submitCreate = (): void => {
    const id = newId.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(id)) {
      setCreateErr(
        ko ? "ID는 영문 소문자·숫자·_ 2~48자여야 합니다 (예: crea_shadow_fox)." : "Invalid ID format.",
      );
      return;
    }
    if (existingIds.has(id) || stage.creatures.has(id)) {
      setCreateErr(ko ? "이미 존재하는 크리처 ID입니다." : "ID already exists.");
      return;
    }
    if (list.retired.includes(id)) {
      setCreateErr(ko ? "은퇴한(이전에 삭제된) ID는 재사용할 수 없습니다." : "Retired ID cannot be reused.");
      return;
    }
    const koTitle = newNameKo.trim() || id;
    const enTitle = newNameEn.trim() || koTitle;
    onCreateNew(id, koTitle, enTitle, newImage.trim() === "" ? undefined : newImage.trim());
    setCreating(false);
    setNewId("");
    setNewNameKo("");
    setNewNameEn("");
    setNewImage("");
    setCreateErr(null);
  };

  return (
    <div className="be-list-pane ce-list-pane">
      {/* 상단 필터 + [+ 새 크리처] */}
      <div className="ce-filter-bar">
        <div className="ce-filter-top">
          <input
            type="search"
            className="input ce-search-input"
            placeholder={ko ? "이름·ID 검색…" : "Search name or ID…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="button-small ce-btn-accent"
            onClick={() => {
              setCreating((v) => !v);
              setCreateErr(null);
            }}
          >
            {creating ? (ko ? "취소" : "Cancel") : ko ? "+ 새 크리처 등록" : "+ New Creature"}
          </button>
        </div>

        <div className="ce-filter-selects">
          <select
            aria-label={ko ? "종족 주분류 필터" : "Filter by category"}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">{ko ? "모든 종족 분류 (14)" : "All Categories (14)"}</option>
            {CREATURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ko ? CATEGORY_LABELS[c].ko : CATEGORY_LABELS[c].en}
              </option>
            ))}
          </select>

          <select
            aria-label={ko ? "등급 필터" : "Filter by grade"}
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
          >
            <option value="all">{ko ? "모든 등급 (6)" : "All Grades (6)"}</option>
            {CREATURE_GRADES.map((g) => (
              <option key={g} value={g}>
                {ko ? GRADE_LABELS[g].ko : GRADE_LABELS[g].en}
              </option>
            ))}
          </select>

          <select
            aria-label={ko ? "성향·세트 태그 필터" : "Filter by tag"}
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="all">{ko ? "모든 성향·세트 태그" : "All Tendency & Set Tags"}</option>
            {CREATURE_PRESET_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {ko ? PRESET_TAG_LABELS[tag].ko : PRESET_TAG_LABELS[tag].en}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 새 크리처 연속 등록 폼 (이미지 선택 시 곧바로 초상화 자동 인식·조정으로 이어짐) */}
      {creating ? (
        <div className="be-card ce-create-box">
          <h3 className="ce-section-title">
            {ko
              ? "새 크리처 등록 (생성 즉시 원형 초상화 자동 인식·조정으로 이동)"
              : "Register New Creature (Opens Portrait Auto-Detector Immediately)"}
          </h3>
          <div className="ce-grid-2">
            <div className="field ce-field">
              <label className="field-label" htmlFor="ce-new-id">
                {ko ? "크리처 ID (영문 소문자 snake_case)" : "Creature ID"}
              </label>
              <input
                id="ce-new-id"
                className="input"
                placeholder="crea_frost_wolf"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>
            <div className="field ce-field">
              <label className="field-label" htmlFor="ce-new-img">
                {ko ? "원본 이미지 선택 (선택 시 얼굴 자동 인식)" : "Source Image (Auto-Detects Head)"}
              </label>
              <select id="ce-new-img" value={newImage} onChange={(e) => setNewImage(e.target.value)}>
                <option value="">{ko ? "— 나중에 고르기 —" : "— Pick later —"}</option>
                {list.availableImages.map((img) => (
                  <option key={img} value={img}>
                    {img}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ce-grid-2">
            <div className="field ce-field">
              <label className="field-label" htmlFor="ce-new-ko">
                {ko ? "한국어 이름" : "Korean Name"}
              </label>
              <input
                id="ce-new-ko"
                className="input"
                placeholder="서리 늑대"
                value={newNameKo}
                onChange={(e) => setNewNameKo(e.target.value)}
              />
            </div>
            <div className="field ce-field">
              <label className="field-label" htmlFor="ce-new-en">
                {ko ? "영어 이름" : "English Name"}
              </label>
              <input
                id="ce-new-en"
                className="input"
                placeholder="Frost Wolf"
                value={newNameEn}
                onChange={(e) => setNewNameEn(e.target.value)}
              />
            </div>
          </div>
          {createErr ? <p className="field-error">{createErr}</p> : null}
          <div className="be-actions">
            <button type="button" className="button-small ce-btn-accent" onClick={submitCreate}>
              {ko ? "생성 후 초상화·스탯 편집 시작 →" : "Create & Open Portrait Cropper →"}
            </button>
          </div>
        </div>
      ) : null}

      {/* 크리처 표 */}
      <div className="dev-table-wrap ce-table-wrap">
        <table className="dev-table">
          <thead>
            <tr>
              <th>{ko ? "토큰" : "Token"}</th>
              <th>{ko ? `크리처 (${filtered.length})` : `Creature (${filtered.length})`}</th>
              <th>{ko ? "분류 · 등급" : "Category & Grade"}</th>
              <th>{ko ? "크기 · 6스탯" : "Size & 6-Stat"}</th>
              <th>{ko ? "고유 무기" : "Natural Weapon"}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ entry, isStaged, isNew, isReverting }) => {
              const statSum = CREATURE_PRIMARY_CODES.reduce((acc, c) => acc + entry.primaries[c], 0);
              const phys = entry.naturalWeapon?.physical;
              const elem = entry.naturalWeapon?.elemental;
              const weaponSummary = phys
                ? `${phys.attack} (${phys.min}~${phys.max})`
                : elem
                  ? `${elem.attack} (${elem.min}~${elem.max})`
                  : "-";
              return (
                <tr
                  key={entry.id}
                  data-selected={selected === entry.id ? "true" : undefined}
                  onClick={() => onSelect(entry.id)}
                  className="ce-table-row"
                >
                  <td>
                    <CreatureTokenBadge
                      image={entry.image}
                      crop={entry.portraitCrop}
                      grade={entry.grade}
                      sizePx={38}
                      alt={ko ? entry.name.ko : entry.name.en}
                    />
                  </td>
                  <td>
                    <div className="ce-row-name">
                      <strong>{ko ? entry.name.ko : entry.name.en}</strong>
                      {!entry.enabled ? <span className="dev-badge">OFF</span> : null}
                      {isNew ? <span className="dev-badge be-badge-staged">NEW</span> : null}
                      {!isNew && isStaged ? (
                        <span className="dev-badge be-badge-staged">
                          {isReverting ? (ko ? "되돌림" : "Revert") : ko ? "담김" : "Staged"}
                        </span>
                      ) : null}
                    </div>
                    <code className="dev-code">{entry.id}</code>
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
                  <td>
                    <div>
                      <strong>{entry.size}</strong>
                      {entry.giant3Tile ? " (3칸)" : ""}
                    </div>
                    <span className="dev-muted">Σ {statSum}</span>
                  </td>
                  <td>
                    <span className="dev-code">{weaponSummary}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
