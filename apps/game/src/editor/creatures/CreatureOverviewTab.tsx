// 크리쳐 도감 정보 탭(CreatureOverviewTab) — 도감에서 고른 크리쳐의 한눈 보기. docs/adr/2026-11-25-creature-codex-groups.md 1절.
// 일러스트와 3D 모델(GLB 또는 임시 몸)을 나란히, 설명·분류·속성, 1레벨 스탯 성향과 조우 범위(기준 ± 오차), 변종 그룹, 전리품 요약을 보인다.
// 값은 다른 탭(기본·스탯·무기·전리품)에서 고친다. 레벨·출현 확률은 인카운터 쪽, K값은 기존 규칙(0.8~1.2)이라 여기서 다루지 않는다.
import {
  CREATURE_PRIMARY_CODES,
  type CreatureClassJson,
  type CreatureEditorListResponse,
  type CreatureJson,
  creatureStatRange,
  creatureStatSumRange,
  resolveCreatureImageUrl,
} from "@terra/shared/creatureEditor";
import { CreatureGroupCard } from "./CreatureGroupCard.tsx";
import { ElementChip, StatShareBar, SumBadge, classPathText } from "./creatureBits.tsx";
import { CreatureModelViewer } from "./CreatureModelViewer.tsx";
import {
  ELEMENT_LABELS,
  GRADE_LABELS,
  PRESET_TAG_LABELS,
  SIZE_LABELS,
  SIZE_PREVIEW_SCALE,
  STAT_LABELS,
  seedOfId,
} from "./creatureModel.ts";

export function CreatureOverviewTab({
  list,
  draft,
  allCreatures,
  classes,
  usedIds,
  locale,
  onOpen,
  onEditMany,
  onCreateVariant,
}: {
  readonly list: CreatureEditorListResponse;
  readonly draft: CreatureJson;
  readonly allCreatures: readonly CreatureJson[];
  readonly classes: readonly CreatureClassJson[];
  readonly usedIds: ReadonlySet<string>;
  readonly locale: "ko" | "en";
  readonly onOpen: (id: string) => void;
  readonly onEditMany: (entries: readonly CreatureJson[]) => void;
  readonly onCreateVariant: (entry: CreatureJson) => void;
}) {
  const ko = locale !== "en";
  const name = ko ? draft.name.ko : draft.name.en;
  const imageUrl = resolveCreatureImageUrl(draft.image);
  const sum = creatureStatSumRange(draft);
  const ranges = CREATURE_PRIMARY_CODES.map((code) => ({ code, ...creatureStatRange(draft, code) }));
  const barMax = Math.max(20, ...ranges.map((range) => range.max));
  const elements = draft.elements
    .map((points, index) => ({ points, index }))
    .filter((item) => item.points > 0)
    .toSorted((a, b) => b.points * ((b.index % 2) + 1) - a.points * ((a.index % 2) + 1) || a.index - b.index);
  const itemById = new Map(list.items.map((item) => [item.id, item]));
  const tagLabel = (tag: string): string => {
    const preset = Object.entries(PRESET_TAG_LABELS).find(([key]) => key === tag)?.[1];
    return preset ? (ko ? preset.ko : preset.en) : tag;
  };

  return (
    <div className="ce-tab-stack ce-overview" data-creature={draft.id}>
      {/* 일러스트 + 3D 모델 */}
      <section className="be-card">
        <div className="ce-overview-media">
          <figure className="ce-overview-art">
            {imageUrl ? (
              <img src={imageUrl} alt={ko ? `${name} 일러스트` : `${name} illustration`} loading="lazy" />
            ) : (
              <p className="field-hint">{ko ? "일러스트가 없습니다." : "No illustration."}</p>
            )}
            <figcaption className="field-hint">{ko ? "일러스트" : "Illustration"}</figcaption>
          </figure>
          <CreatureModelViewer
            model={draft.model}
            seed={seedOfId(draft.id)}
            scale={SIZE_PREVIEW_SCALE[draft.size]}
            locale={locale}
            label={name}
          />
        </div>
      </section>

      {/* 설명 · 분류 · 속성 */}
      <section className="be-card">
        <h3 className="ce-section-title">{ko ? "설명 · 속성" : "Description & Attributes"}</h3>
        <p className="ce-overview-desc">
          {(ko ? draft.description?.ko : draft.description?.en) ??
            (ko ? "설명이 없습니다." : "No description.")}
        </p>
        <div className="ce-chip-list">
          <span className="dev-badge">{classPathText(classes, draft.category, locale)}</span>
          <span className="ce-grade-pill" data-grade={draft.grade}>
            {ko ? GRADE_LABELS[draft.grade].ko : GRADE_LABELS[draft.grade].en}
          </span>
          <span className="dev-badge">
            {ko
              ? `기술 슬롯 ${draft.skillSlots.base} (최대 ${draft.skillSlots.max})`
              : `Skill slots ${draft.skillSlots.base} (max ${draft.skillSlots.max})`}
          </span>
          <span className="dev-badge">
            {ko ? SIZE_LABELS[draft.size].ko : SIZE_LABELS[draft.size].en}
            {draft.giant3Tile ? (ko ? " · 3칸" : " · 3 tiles") : ""}
          </span>
          {(draft.tags ?? []).map((tag) => (
            <span key={tag} className="dev-badge">
              {tagLabel(tag)}
            </span>
          ))}
          {draft.enabled ? null : <span className="dev-badge ce-badge-warn">OFF</span>}
        </div>
        <div className="ce-overview-elements">
          <span className="field-label">
            {ko ? "속성 (12칸 0~10 · 겹 테두리 = 강화형)" : "Elements (0–10 · double ring = enhanced)"}
          </span>
          {elements.length === 0 ? (
            <span className="dev-muted">{ko ? "속성 점수 없음" : "No element points"}</span>
          ) : (
            elements.map(({ points, index }, order) => {
              const info = ELEMENT_LABELS[index];
              if (!info) return null;
              return (
                <span
                  key={info.id}
                  className="ce-overview-element"
                  data-main={order === 0 ? "true" : undefined}
                >
                  <ElementChip index={index} locale={locale} />
                  {ko ? info.ko : info.en} <strong>{points}</strong>
                  <span className="ce-overview-element-bar">
                    <span style={{ width: `${points * 10}%`, backgroundColor: info.color }} />
                  </span>
                </span>
              );
            })
          )}
        </div>
      </section>

      {/* 6스탯 분포 · 1레벨 조우 범위 */}
      <section className="be-card">
        <div className="ce-card-head">
          <div>
            <h3 className="ce-section-title">
              {ko ? "6스탯 분포 · 1레벨 조우 범위" : "6-Stat Split & Level-1 Encounter Range"}
            </h3>
            <p className="field-hint">
              {ko
                ? "도감 값은 1레벨 기준입니다. 조우하는 개체는 스탯마다 아래 범위(기준 ± 오차) 안에서 정해지고, 레벨·출현은 인카운터가, 성장은 K값(0.8~1.2 랜덤)이 정합니다."
                : "Codex values are for level 1. Each encountered individual rolls every stat inside the range below; level and spawn come from encounters, growth from K (random 0.8–1.2)."}
            </p>
          </div>
          <SumBadge sum={sum.base} range={`${sum.min}~${sum.max}`} />
        </div>
        <StatShareBar primaries={draft.primaries} locale={locale} large />
        <div className="ce-range-rows">
          {ranges.map((range) => (
            <div key={range.code} className="ce-range-row" data-stat={range.code}>
              <span className="ce-range-label">
                {ko ? STAT_LABELS[range.code].ko : STAT_LABELS[range.code].en}
              </span>
              <strong className="ce-range-base">{draft.primaries[range.code]}</strong>
              <span className="ce-range-track">
                <span
                  className="ce-range-fill"
                  style={{ width: `${((draft.primaries[range.code] / barMax) * 100).toFixed(1)}%` }}
                />
                <span
                  className="ce-range-band"
                  style={{
                    left: `${((range.min / barMax) * 100).toFixed(1)}%`,
                    width: `${(((range.max - range.min) / barMax) * 100).toFixed(1)}%`,
                  }}
                />
              </span>
              <span className="ce-range-text">
                {range.min}~{range.max} <span className="dev-muted">(±{range.spread})</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <CreatureGroupCard
        list={list}
        draft={draft}
        allCreatures={allCreatures}
        usedIds={usedIds}
        locale={locale}
        onOpen={onOpen}
        onEditMany={onEditMany}
        onCreateVariant={onCreateVariant}
      />

      {/* 전리품 요약 */}
      <section className="be-card">
        <h3 className="ce-section-title">
          {ko ? `전리품 (${draft.drops?.length ?? 0})` : `Loot (${draft.drops?.length ?? 0})`}
        </h3>
        {(draft.drops ?? []).length === 0 ? (
          <p className="field-hint">{ko ? "전리품이 없습니다." : "No loot."}</p>
        ) : (
          <div className="ce-chip-list">
            {(draft.drops ?? []).map((drop, index) => {
              const item = itemById.get(drop.item);
              return (
                <span key={`${drop.item}-${index}`} className="dev-badge">
                  {item ? (ko ? item.name.ko : item.name.en) : drop.item} · {(drop.chancePm / 10).toFixed(1)}%
                </span>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
