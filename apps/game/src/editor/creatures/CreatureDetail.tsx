// 크리처 편집기 상세 판(CreatureDetail) — 원형 초상화 배지 헤더 + 탭 다섯(도감 정보, 기본·초상화, 스탯·속성·분포, 고유 무기·스킬, 전리품).
// 탭 고르기는 화면(CreatureEditorScreen)이 든다: 도감에서 넘어오면 도감 정보, 크리쳐를 바꿔도 보던 탭을 그대로 둔다.
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  CREATURE_GRADES,
  CREATURE_PRESET_TAGS,
  CREATURE_SIZES,
  type CreatureClassJson,
  type CreatureEditorListResponse,
  type CreatureEditorRow,
  type CreatureGrade,
  type CreatureJson,
  type CreatureSize,
  creatureGroupRootId,
  flattenCreatureClasses,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { CheckField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { CreatureCombatTab } from "./CreatureCombatTab.tsx";
import { CreatureLootTab } from "./CreatureLootTab.tsx";
import { CreatureOverviewTab } from "./CreatureOverviewTab.tsx";
import { CreaturePortraitCropper, CreatureTokenBadge } from "./CreaturePortraitCropper.tsx";
import { CreatureStatsTab } from "./CreatureStatsTab.tsx";
import { classPathText } from "./creatureBits.tsx";
import { GRADE_LABELS, PRESET_TAG_LABELS, SIZE_LABELS } from "./creatureModel.ts";

export type CreatureDetailTab = "overview" | "basic" | "stats" | "combat" | "loot";

export function CreatureDetail({
  list,
  row,
  draft,
  allCreatures,
  classes,
  usedIds,
  subTab,
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
  onSubTab,
  onOpen,
  onEditMany,
  onCreateVariant,
}: {
  readonly list: CreatureEditorListResponse;
  readonly row: CreatureEditorRow | undefined;
  readonly draft: CreatureJson;
  readonly allCreatures: readonly CreatureJson[];
  /** 실효 분류 트리(담은 바꿈 포함) */
  readonly classes: readonly CreatureClassJson[];
  readonly usedIds: ReadonlySet<string>;
  readonly subTab: CreatureDetailTab;
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
  readonly onSubTab: (tab: CreatureDetailTab) => void;
  /** 다른 크리쳐로 넘어간다(그룹 카드) */
  readonly onOpen: (id: string) => void;
  /** 여러 크리쳐를 한 번에 담는다(그룹 넣기·대표 바꾸기) */
  readonly onEditMany: (entries: readonly CreatureJson[]) => void;
  readonly onCreateVariant: (entry: CreatureJson) => void;
}) {
  const ko = locale !== "en";
  const setSubTab = onSubTab;
  const rootId = creatureGroupRootId(draft);
  const groupSize = allCreatures.filter((entry) => creatureGroupRootId(entry) === rootId).length;
  const [customTagInput, setCustomTagInput] = useState("");

  // 분류 고르기: 트리 차례로, 길 글("야수 › 여우류 › 북극여우")로 보인다. 모르는 분류(지워진 것)를 가리키면 그 ID도 목록에 둔다
  const categoryOptions = [
    ...(classes.some((entry) => entry.id === draft.category)
      ? []
      : [{ value: draft.category, label: draft.category }]),
    ...flattenCreatureClasses(classes).map(({ entry }) => ({
      value: entry.id,
      label: classPathText(classes, entry.id, locale),
    })),
  ];
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
              {groupSize > 1 ? (
                <span className="dev-badge" data-group={rootId}>
                  {draft.variantOf
                    ? ko
                      ? `변종 (대표 ${rootId})`
                      : `Variant of ${rootId}`
                    : ko
                      ? `그룹 대표 · 변종 ${groupSize - 1}`
                      : `Group lead · ${groupSize - 1} variants`}
                </span>
              ) : null}
              {checking ? <span className="dev-muted">{ko ? "검사 중…" : "Checking…"}</span> : null}
            </div>
            <p className="field-hint">
              {classPathText(classes, draft.category, locale)} ·{" "}
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
          aria-selected={subTab === "overview"}
          className="be-tab"
          data-active={subTab === "overview" ? "true" : undefined}
          onClick={() => setSubTab("overview")}
        >
          {ko ? "도감 정보" : "Codex Info"}
        </button>
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
          {ko ? `4. 전리품 (${draft.drops?.length ?? 0})` : `4. Loot (${draft.drops?.length ?? 0})`}
        </button>
      </div>

      {subTab === "overview" ? (
        <CreatureOverviewTab
          list={list}
          draft={draft}
          allCreatures={allCreatures}
          classes={classes}
          usedIds={usedIds}
          locale={locale}
          onOpen={onOpen}
          onEditMany={onEditMany}
          onCreateVariant={onCreateVariant}
        />
      ) : null}

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
              <SelectField<string>
                label={ko ? "분류 (대 › 중 › 소)" : "Class (Large › Mid › Small)"}
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

          {/* 3D 모델 파일(GLB) 연결 */}
          <section className="be-card">
            <h3 className="ce-section-title">{ko ? "3D 모델 (GLB)" : "3D Model (GLB)"}</h3>
            <p className="field-hint">
              {ko
                ? "apps/game/public/creatures/models/ 에 넣은 GLB 파일 이름을 적습니다. 비워 두면 [도감 정보]에 일러스트와 임시 몸만 보입니다."
                : "File name of a GLB placed under apps/game/public/creatures/models/. Leave empty to show the illustration and a placeholder body."}
            </p>
            <div className="ce-grid-2">
              <TextField
                label={ko ? "모델 파일 이름 또는 경로" : "Model file name or path"}
                value={draft.model ?? ""}
                maxLength={200}
                onChange={(model) => onEdit({ ...draft, model: model.trim() === "" ? undefined : model })}
              />
              {list.availableModels.length > 0 ? (
                <div className="field ce-field">
                  <label className="field-label" htmlFor="ce-model-pick">
                    {ko
                      ? `폴더에서 고르기 (${list.availableModels.length})`
                      : `Pick from folder (${list.availableModels.length})`}
                  </label>
                  <select
                    id="ce-model-pick"
                    value={list.availableModels.includes(draft.model ?? "") ? draft.model : ""}
                    onChange={(e) =>
                      onEdit({ ...draft, model: e.target.value === "" ? undefined : e.target.value })
                    }
                  >
                    <option value="">{ko ? "— 모델 없음 —" : "— No model —"}</option>
                    {list.availableModels.map((file) => (
                      <option key={file} value={file}>
                        {file}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
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
        <CreatureStatsTab
          draft={draft}
          allCreatures={allCreatures}
          classes={classes}
          locale={locale}
          onEdit={onEdit}
        />
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
