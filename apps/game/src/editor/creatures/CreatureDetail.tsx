// 크리처 편집기 상세 판(CreatureDetail) — 원형 초상화 배지 헤더 + 4개 탭(기본·초상화, 스탯·속성·분포, 고유 무기·스킬, 전리품·드롭 시뮬).
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  CREATURE_CATEGORIES,
  CREATURE_GRADES,
  CREATURE_PRESET_TAGS,
  CREATURE_SIZES,
  type CreatureCategory,
  type CreatureEditorListResponse,
  type CreatureEditorRow,
  type CreatureGrade,
  type CreatureJson,
  type CreatureSize,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { CheckField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { CreatureCombatTab } from "./CreatureCombatTab.tsx";
import { CreatureLootTab } from "./CreatureLootTab.tsx";
import { CreaturePortraitCropper, CreatureTokenBadge } from "./CreaturePortraitCropper.tsx";
import { CreatureStatsTab } from "./CreatureStatsTab.tsx";
import { CATEGORY_LABELS, GRADE_LABELS, PRESET_TAG_LABELS, SIZE_LABELS } from "./creatureModel.ts";

export type CreatureDetailTab = "basic" | "stats" | "combat" | "loot";

export function CreatureDetail({
  list,
  row,
  draft,
  allCreatures,
  locale,
  staged,
  reverting,
  isNewCreated,
  autoDetectPortrait,
  issues,
  checking,
  onEdit,
  onRevert,
  onUnstage,
  onBack,
}: {
  readonly list: CreatureEditorListResponse;
  readonly row: CreatureEditorRow | undefined;
  readonly draft: CreatureJson;
  readonly allCreatures: readonly CreatureJson[];
  readonly locale: "ko" | "en";
  readonly staged: boolean;
  readonly reverting: boolean;
  readonly isNewCreated: boolean;
  readonly autoDetectPortrait: boolean;
  readonly issues: readonly ContentIssueView[];
  readonly checking: boolean;
  readonly onEdit: (next: CreatureJson) => void;
  readonly onRevert: () => void;
  readonly onUnstage: () => void;
  readonly onBack: () => void;
}) {
  const ko = locale !== "en";
  const [subTab, setSubTab] = useState<CreatureDetailTab>("basic");
  const [customTagInput, setCustomTagInput] = useState("");

  const categoryOptions = CREATURE_CATEGORIES.map((c) => ({
    value: c,
    label: ko ? CATEGORY_LABELS[c].ko : CATEGORY_LABELS[c].en,
  }));
  const gradeOptions = CREATURE_GRADES.map((g) => ({
    value: g,
    label: ko ? GRADE_LABELS[g].ko : GRADE_LABELS[g].en,
  }));
  const sizeOptions = CREATURE_SIZES.map((s) => ({
    value: s,
    label: ko ? SIZE_LABELS[s].ko : SIZE_LABELS[s].en,
  }));

  const originLabel = isNewCreated
    ? ko
      ? "새 항목 (미저장)"
      : "New (Unapplied)"
    : row?.origin === "created"
      ? ko
        ? "이 세계 생성"
        : "World Created"
      : row?.origin === "edited"
        ? ko
          ? "덮어씀"
          : "Overridden"
        : ko
          ? "팩 원본"
          : "Pack Base";

  return (
    <div className="be-detail ce-detail">
      {/* 상단 요약 헤더 */}
      <div className="be-detail-head ce-detail-head">
        <div className="ce-detail-identity">
          <CreatureTokenBadge
            image={draft.image}
            crop={draft.portraitCrop}
            grade={draft.grade}
            sizePx={56}
            alt={ko ? draft.name.ko : draft.name.en}
          />
          <div>
            <div className="ce-detail-title-row">
              <h2 className="be-detail-title">{ko ? draft.name.ko : draft.name.en}</h2>
              <code className="dev-code">{draft.id}</code>
              <span className="dev-badge">{originLabel}</span>
              {staged ? (
                <span className="dev-badge be-badge-staged">
                  {reverting ? (ko ? "되돌리기 예정" : "Reverting") : ko ? "담김" : "Staged"}
                </span>
              ) : null}
              {checking ? <span className="dev-muted">{ko ? "검사 중…" : "Checking…"}</span> : null}
            </div>
            <p className="field-hint">
              {ko ? CATEGORY_LABELS[draft.category].ko : CATEGORY_LABELS[draft.category].en} ·{" "}
              {ko ? GRADE_LABELS[draft.grade].ko : GRADE_LABELS[draft.grade].en} ·{" "}
              {ko ? SIZE_LABELS[draft.size].ko : SIZE_LABELS[draft.size].en}
            </p>
          </div>
        </div>
        <div className="be-actions">
          <button type="button" className="button-small be-only-narrow" onClick={onBack}>
            {ko ? "← 목록" : "← List"}
          </button>
          {staged ? (
            <button type="button" className="button-small" onClick={onUnstage}>
              {ko ? "담기 취소" : "Unstage"}
            </button>
          ) : null}
          {row && (row.origin === "edited" || row.origin === "created") && !reverting ? (
            <button type="button" className="button-small" onClick={onRevert}>
              {row.origin === "created"
                ? ko
                  ? "항목 지우기(은퇴)"
                  : "Retire Entry"
                : ko
                  ? "팩 원본으로 되돌리기"
                  : "Revert to Pack"}
            </button>
          ) : null}
        </div>
      </div>

      {/* 서버 검사 오류·권고 표시 */}
      {issues.length > 0 ? (
        <ul className="ce-issue-list" role="alert">
          {issues.map((issue, idx) => (
            <li
              key={`${issue.code ?? "issue"}-${idx}`}
              className={issue.level === "error" ? "field-error" : "field-hint"}
            >
              [{issue.level.toUpperCase()}] {issue.path ? `${issue.path}: ` : ""}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {/* 상세 서브 탭 */}
      <div className="be-tabs ce-subtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "basic"}
          className="be-tab"
          data-active={subTab === "basic" ? "true" : undefined}
          onClick={() => setSubTab("basic")}
        >
          {ko ? "1. 기본 · 원형 초상화" : "1. Basic & Portrait Crop"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "stats"}
          className="be-tab"
          data-active={subTab === "stats" ? "true" : undefined}
          onClick={() => setSubTab("stats")}
        >
          {ko ? "2. 스탯 · 12속성 · 분포" : "2. Stats, 12 Elements & Dist"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "combat"}
          className="be-tab"
          data-active={subTab === "combat" ? "true" : undefined}
          onClick={() => setSubTab("combat")}
        >
          {ko ? "3. 고유 무기 · 스킬" : "3. Innate Weapon & Skills"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "loot"}
          className="be-tab"
          data-active={subTab === "loot" ? "true" : undefined}
          onClick={() => setSubTab("loot")}
        >
          {ko
            ? `4. 전리품 · 드롭 시뮬 (${draft.drops?.length ?? 0})`
            : `4. Loot & Sim (${draft.drops?.length ?? 0})`}
        </button>
      </div>

      {subTab === "basic" ? (
        <div className="ce-tab-stack">
          {/* 원형 초상화 영역 선택기 (최상단 배치로 연속 작업 지원) */}
          <CreaturePortraitCropper
            image={draft.image}
            crop={draft.portraitCrop}
            appliedCrop={row?.entry.portraitCrop}
            grade={draft.grade}
            availableImages={list.availableImages}
            autoDetectOnMount={autoDetectPortrait}
            locale={locale}
            onChangeImage={(nextImage) => onEdit({ ...draft, image: nextImage })}
            onChangeCrop={(nextCrop) => onEdit({ ...draft, portraitCrop: nextCrop })}
          />

          {/* 이름 · 설명 · 분류 · 등급 · 크기 */}
          <section className="be-card">
            <h3 className="ce-section-title">
              {ko ? "기본 정보 · 종족 분류 · 등급 · 크기" : "Identity, Category, Grade & Size"}
            </h3>
            <div className="ce-grid-4">
              <TextField
                label={ko ? "이름 (한국어)" : "Name (KO)"}
                value={draft.name.ko}
                onChange={(koName) => onEdit({ ...draft, name: { ...draft.name, ko: koName } })}
              />
              <TextField
                label={ko ? "이름 (영어)" : "Name (EN)"}
                value={draft.name.en}
                onChange={(enName) => onEdit({ ...draft, name: { ...draft.name, en: enName } })}
              />
              <SelectField<CreatureCategory>
                label={ko ? "종족 주분류 (14종)" : "Category (14)"}
                value={draft.category}
                options={categoryOptions}
                onChange={(category) => onEdit({ ...draft, category })}
              />
              <SelectField<CreatureGrade>
                label={ko ? "등급 (6단계 · D-5025)" : "Grade (6 Tiers)"}
                value={draft.grade}
                options={gradeOptions}
                onChange={(grade) => onEdit({ ...draft, grade })}
              />
            </div>

            <div className="ce-grid-4">
              <SelectField<CreatureSize>
                label={ko ? "크기 (S·M·L·XL)" : "Size (S/M/L/XL)"}
                value={draft.size}
                options={sizeOptions}
                onChange={(size) =>
                  onEdit({
                    ...draft,
                    size,
                    ...(size === "XL" ? {} : { giant3Tile: undefined }),
                  })
                }
              />
              <CheckField
                label={ko ? "활성화 (enabled)" : "Enabled"}
                checked={draft.enabled}
                onChange={(enabled) => onEdit({ ...draft, enabled })}
                hint={ko ? "끄면 월드 스폰·전투 자료에서 제외됩니다" : "Excluded when disabled"}
              />
              {draft.size === "XL" ? (
                <CheckField
                  label={ko ? "거대 3타일 점유 (D-5023)" : "Giant 3-Tile Footprint (D-5023)"}
                  checked={draft.giant3Tile === true}
                  onChange={(giant3Tile) => onEdit({ ...draft, giant3Tile })}
                  hint={ko ? "XL 보스·신수가 3칸을 점유하고 주변 넉백 판정을 가집니다" : "Occupies 3 tiles"}
                />
              ) : null}
            </div>

            <div className="ce-grid-2">
              <TextField
                label={ko ? "도감 설명 (한국어)" : "Description (KO)"}
                value={draft.description?.ko ?? ""}
                maxLength={500}
                onChange={(koDesc) =>
                  onEdit({
                    ...draft,
                    description: { ko: koDesc, en: draft.description?.en || koDesc },
                  })
                }
              />
              <TextField
                label={ko ? "도감 설명 (영어)" : "Description (EN)"}
                value={draft.description?.en ?? ""}
                maxLength={500}
                onChange={(enDesc) =>
                  onEdit({
                    ...draft,
                    description: { ko: draft.description?.ko || enDesc, en: enDesc },
                  })
                }
              />
            </div>
          </section>

          {/* 다중 태그 (성향 · 세트 · 커스텀 태그) */}
          <section className="be-card">
            <h3 className="ce-section-title">
              {ko
                ? "다중 태그 — 성향(Tendency) · 도감 세트(Set) · 커스텀 태그"
                : "Multi-Tags — Tendencies, Sets & Custom Tags"}
            </h3>
            <div className="ce-chip-list">
              {CREATURE_PRESET_TAGS.map((tag) => {
                const active = Boolean(draft.tags?.includes(tag));
                const label = PRESET_TAG_LABELS[tag];
                return (
                  <button
                    key={tag}
                    type="button"
                    className="ce-tag-chip"
                    data-active={active ? "true" : undefined}
                    onClick={() => {
                      const next = new Set(draft.tags ?? []);
                      if (active) next.delete(tag);
                      else next.add(tag);
                      onEdit({ ...draft, tags: [...next] });
                    }}
                  >
                    {ko ? label.ko : label.en}
                  </button>
                );
              })}
            </div>

            <div className="ce-custom-tag-row">
              <input
                className="input"
                placeholder={ko ? "커스텀 태그 ID (예: set_custom_01)…" : "Custom tag ID (snake_case)…"}
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
              />
              <button
                type="button"
                className="button-small"
                onClick={() => {
                  const trimmed = customTagInput.trim().toLowerCase();
                  if (!/^[a-z][a-z0-9_]{1,47}$/.test(trimmed)) return;
                  const next = new Set(draft.tags ?? []);
                  next.add(trimmed);
                  onEdit({ ...draft, tags: [...next] });
                  setCustomTagInput("");
                }}
              >
                {ko ? "+ 태그 추가" : "+ Add Tag"}
              </button>
              {(draft.tags ?? [])
                .filter((t) => !(CREATURE_PRESET_TAGS as readonly string[]).includes(t))
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="ce-tag-chip"
                    data-active="true"
                    onClick={() =>
                      onEdit({
                        ...draft,
                        tags: (draft.tags ?? []).filter((t) => t !== tag),
                      })
                    }
                  >
                    {tag} ×
                  </button>
                ))}
            </div>
          </section>
        </div>
      ) : null}

      {subTab === "stats" ? (
        <CreatureStatsTab draft={draft} allCreatures={allCreatures} locale={locale} onEdit={onEdit} />
      ) : null}

      {subTab === "combat" ? (
        <CreatureCombatTab
          draft={draft}
          skills={list.skills}
          unitKinds={list.unitKinds}
          locale={locale}
          onEdit={onEdit}
        />
      ) : null}

      {subTab === "loot" ? (
        <CreatureLootTab draft={draft} items={list.items} locale={locale} onEdit={onEdit} />
      ) : null}
    </div>
  );
}
