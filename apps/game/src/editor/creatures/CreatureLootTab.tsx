// 크리처 전리품 탭(CreatureLootTab) — 아이템을 고르고 획득 확률만 정한다(사용자 결정 2026-11-25 "일단 아이템 선택후 획득확률만",
// docs/adr/2026-11-25-creature-codex-groups.md 5절). 전리품용 아이템이 아직 없어 수량·기대 가치·사냥 시뮬레이터는 화면에서 뺐다.
// 자료 모양(drops: item·chancePm·min·max)은 그대로다: 이미 적힌 수량은 건드리지 않고, 새 줄은 1개(min = max = 1)로 넣는다.
import {
  CREATURE_LIMITS,
  type CreatureEditorItemOption,
  type CreatureJson,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { NumberField, RemoveButton } from "../content/contentEditorFields.tsx";

const DEFAULT_CHANCE_PM = 250;
/** 고르기 목록에 한 번에 보이는 아이템 수(검색으로 좁힌다) */
const PICK_LIMIT = 60;

export function CreatureLootTab({
  draft,
  items,
  locale,
  onEdit,
}: {
  readonly draft: CreatureJson;
  readonly items: readonly CreatureEditorItemOption[];
  readonly locale: "ko" | "en";
  readonly onEdit: (next: CreatureJson) => void;
}) {
  const ko = locale !== "en";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [picked, setPicked] = useState("");
  const [chancePm, setChancePm] = useState(DEFAULT_CHANCE_PM);
  const drops = draft.drops ?? [];
  const itemById = new Map(items.map((it) => [it.id, it]));
  const used = new Set(drops.map((drop) => drop.item));
  const full = drops.length >= CREATURE_LIMITS.dropsMax;

  const categories = [...new Set(items.map((item) => item.category))].toSorted();
  const q = search.trim().toLowerCase();
  const matches = items.filter((item) => {
    if (used.has(item.id)) return false;
    if (category !== "all" && item.category !== category) return false;
    if (q === "") return true;
    return (
      item.id.toLowerCase().includes(q) ||
      item.name.ko.toLowerCase().includes(q) ||
      item.name.en.toLowerCase().includes(q)
    );
  });
  const shown = matches.slice(0, PICK_LIMIT);
  const target = shown.some((item) => item.id === picked) ? picked : (shown[0]?.id ?? "");

  const add = (): void => {
    if (target === "" || full) return;
    onEdit({ ...draft, drops: [...drops, { item: target, chancePm, min: 1, max: 1 }] });
    setPicked("");
  };

  return (
    <div className="ce-tab-stack">
      <section className="be-card">
        <div className="ce-card-head">
          <div>
            <h3 className="ce-section-title">
              {ko
                ? `전리품 (${drops.length}/${CREATURE_LIMITS.dropsMax})`
                : `Loot (${drops.length}/${CREATURE_LIMITS.dropsMax})`}
            </h3>
            <p className="field-hint">
              {ko
                ? "아이템을 고르고 획득 확률(‰, 1000‰ = 100%)만 정합니다. 아이템마다 따로 굴립니다. 수량은 지금 다루지 않습니다(새 줄은 1개)."
                : "Pick an item and set only its drop chance (‰, 1000‰ = 100%). Each item rolls on its own. Quantity is not handled yet (new rows drop 1)."}
            </p>
          </div>
        </div>

        {/* 아이템 고르기 → 확률 → 추가 */}
        <div className="ce-loot-add">
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-loot-search">
              {ko ? "아이템 찾기" : "Find item"}
            </label>
            <input
              id="ce-loot-search"
              type="search"
              className="input"
              placeholder={ko ? "이름·ID…" : "Name or ID…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-loot-category">
              {ko ? "분류" : "Category"}
            </label>
            <select id="ce-loot-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">{ko ? "모든 분류" : "All categories"}</option>
              {categories.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-loot-item">
              {ko
                ? `아이템 (${matches.length}개${matches.length > PICK_LIMIT ? ` 중 ${PICK_LIMIT}개 — 검색으로 좁히세요` : ""})`
                : `Item (${matches.length}${matches.length > PICK_LIMIT ? `, showing ${PICK_LIMIT} — narrow by search` : ""})`}
            </label>
            <select id="ce-loot-item" value={target} onChange={(e) => setPicked(e.target.value)}>
              {shown.length === 0 ? (
                <option value="">{ko ? "— 맞는 아이템 없음 —" : "— No match —"}</option>
              ) : null}
              {shown.map((item) => (
                <option key={item.id} value={item.id}>
                  {ko ? item.name.ko : item.name.en} ({item.id} · T{item.tier})
                </option>
              ))}
            </select>
          </div>
          <NumberField
            label={
              ko
                ? `획득 확률 ‰ (${(chancePm / 10).toFixed(1)}%)`
                : `Chance ‰ (${(chancePm / 10).toFixed(1)}%)`
            }
            value={chancePm}
            min={CREATURE_LIMITS.dropChancePm.min}
            max={CREATURE_LIMITS.dropChancePm.max}
            slider={false}
            onChange={(value) => {
              if (value !== undefined) setChancePm(value);
            }}
          />
          <button
            type="button"
            className="button-small ce-btn-accent ce-loot-add-button"
            disabled={full || target === ""}
            onClick={add}
          >
            {ko ? "+ 전리품 추가" : "+ Add Loot"}
          </button>
        </div>

        {drops.length > 0 ? (
          <div className="ce-list-rows">
            {drops.map((drop, idx) => {
              const info = itemById.get(drop.item);
              return (
                <div key={`${drop.item}-${idx}`} className="ce-loot-row" data-item={drop.item}>
                  <div className="ce-loot-item">
                    <strong>{info ? (ko ? info.name.ko : info.name.en) : drop.item}</strong>
                    <span className="ce-row-name">
                      <code className="dev-code">{drop.item}</code>
                      {info ? (
                        <span className="dev-muted">
                          T{info.tier} · {info.category}
                        </span>
                      ) : null}
                      {info ? null : (
                        <span className="dev-badge ce-badge-warn">{ko ? "없는 아이템" : "Missing item"}</span>
                      )}
                      {info && !info.enabled ? <span className="dev-badge">OFF</span> : null}
                    </span>
                  </div>
                  <NumberField
                    label={
                      ko
                        ? `획득 확률 ‰ (${(drop.chancePm / 10).toFixed(1)}%)`
                        : `Chance ‰ (${(drop.chancePm / 10).toFixed(1)}%)`
                    }
                    value={drop.chancePm}
                    min={CREATURE_LIMITS.dropChancePm.min}
                    max={CREATURE_LIMITS.dropChancePm.max}
                    onChange={(value) => {
                      if (value === undefined) return;
                      const next = [...drops];
                      next[idx] = { ...drop, chancePm: value };
                      onEdit({ ...draft, drops: next });
                    }}
                  />
                  <RemoveButton
                    name={info ? (ko ? info.name.ko : info.name.en) : drop.item}
                    onClick={() => onEdit({ ...draft, drops: drops.filter((_, i) => i !== idx) })}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="field-hint">
            {ko
              ? "전리품이 없습니다. 위에서 아이템을 고르고 [+ 전리품 추가]를 누르세요."
              : "No loot yet. Pick an item above and press Add Loot."}
          </p>
        )}
      </section>
    </div>
  );
}
