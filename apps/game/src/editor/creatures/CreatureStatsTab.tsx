// 크리처 스탯 · 12속성 · 아종 · 세트 6스탯 분포 분석 탭(CreatureStatsTab) — 기획 D-094·D-5024·41_Time_Units §4.3.
import {
  CREATURE_GRADE_STAT_BUDGET,
  CREATURE_LIMITS,
  CREATURE_PRIMARY_CODES,
  type CreatureJson,
  type CreaturePrimaryCode,
  type CreatureStatTendency,
  allocateCreatureStats,
  summarizeCreatureStatDistribution,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { NumberField } from "../content/contentEditorFields.tsx";
import { CATEGORY_LABELS, ELEMENT_LABELS, PRESET_TAG_LABELS, STAT_LABELS } from "./creatureModel.ts";

const TENDENCY_OPTIONS: readonly {
  readonly value: CreatureStatTendency;
  readonly ko: string;
  readonly en: string;
}[] = [
  { value: "tendency_attack", ko: "공격형 (STR·AGI 중심)", en: "Attack (STR/AGI)" },
  { value: "tendency_defense", ko: "방어·탱커형 (VIT 중심)", en: "Defense (VIT)" },
  { value: "tendency_agile", ko: "민첩·속공형 (AGI·DEX 중심)", en: "Agile (AGI/DEX)" },
  { value: "tendency_mount", ko: "탑승·기동형 (AGI·VIT 중심)", en: "Mount (AGI/VIT)" },
  { value: "tendency_magic", ko: "마법·원소형 (INT·WIS 중심)", en: "Magic (INT/WIS)" },
  { value: "tendency_production", ko: "생산·작업형 (DEX·VIT 중심)", en: "Production (DEX/VIT)" },
];

const SUBSPECIES_OPTIONS = [
  { id: "sub_fire", ko: "화염 아종 (불)", en: "Fire Subspecies" },
  { id: "sub_water", ko: "심해 아종 (물)", en: "Water Subspecies" },
  { id: "sub_wind", ko: "질풍 아종 (바람)", en: "Wind Subspecies" },
  { id: "sub_earth", ko: "대지 아종 (땅)", en: "Earth Subspecies" },
  { id: "sub_light", ko: "광휘 아종 (빛)", en: "Light Subspecies" },
  { id: "sub_dark", ko: "심연 아종 (어둠)", en: "Dark Subspecies" },
] as const;

export function CreatureStatsTab({
  draft,
  allCreatures,
  locale,
  onEdit,
}: {
  readonly draft: CreatureJson;
  readonly allCreatures: readonly CreatureJson[];
  readonly locale: "ko" | "en";
  readonly onEdit: (next: CreatureJson) => void;
}) {
  const ko = locale !== "en";
  const initialTendency: CreatureStatTendency =
    TENDENCY_OPTIONS.find((opt) => draft.tags?.includes(opt.value))?.value ?? "tendency_attack";
  const [tendency, setTendency] = useState<CreatureStatTendency>(initialTendency);
  const [primaryStat, setPrimaryStat] = useState<CreaturePrimaryCode>("str");
  const [secondaryStat, setSecondaryStat] = useState<CreaturePrimaryCode>("vit");
  const [customBudget, setCustomBudget] = useState<number | undefined>(undefined);
  const [distScope, setDistScope] = useState<string>("category");

  const statSum = CREATURE_PRIMARY_CODES.reduce((acc, code) => acc + draft.primaries[code], 0);
  const elementSum = draft.elements.reduce((acc, v) => acc + v, 0);
  const defaultBudget = CREATURE_GRADE_STAT_BUDGET[draft.grade];

  const applyAutoStats = (): void => {
    const nextPrimaries = allocateCreatureStats({
      grade: draft.grade,
      size: draft.size,
      tendency,
      primaryStat,
      secondaryStat,
      customBudget,
    });
    const otherTags = (draft.tags ?? []).filter((t) => !t.startsWith("tendency_"));
    onEdit({
      ...draft,
      primaries: nextPrimaries,
      tags: [tendency, ...otherTags],
    });
  };

  // 세트·분류 6스탯 분포 비교 대상
  const compareTarget = allCreatures.filter((c) => {
    if (distScope === "all") return true;
    if (distScope === "category") return c.category === draft.category;
    if (distScope === "grade") return c.grade === draft.grade;
    return Boolean(c.tags?.includes(distScope));
  });
  const distribution = summarizeCreatureStatDistribution(compareTarget.length > 0 ? compareTarget : [draft]);

  // 6계열 방어력 요약 (물·얼음 / 불 / 바람·번개 / 땅·나무·금속 / 독·산 / 빛·어둠)
  const el = (idx: number): number => draft.elements[idx] ?? 0;
  const families = [
    { label: ko ? "물·얼음" : "Water/Ice", pts: el(0) + el(8) },
    { label: ko ? "불" : "Fire", pts: el(1) },
    { label: ko ? "바람·번개" : "Wind/Lightning", pts: el(2) + el(9) },
    { label: ko ? "땅·나무·금속" : "Earth/Wood/Metal", pts: el(3) + el(6) + el(7) },
    { label: ko ? "독·산" : "Poison/Acid", pts: el(10) + el(11) },
    { label: ko ? "빛·어둠" : "Light/Dark", pts: el(4) + el(5) },
  ];

  return (
    <div className="ce-tab-stack">
      {/* 1. 특성 기반 6스탯 자동 배분 생성기 */}
      <section className="be-card">
        <div className="ce-card-head">
          <div>
            <h3 className="ce-section-title">
              {ko
                ? "특성 기반 6스탯 자동 배분 생성기 (D-094 · D-5024)"
                : "Characteristic-Based 6-Stat Auto-Allocator (D-094 · D-5024)"}
            </h3>
            <p className="field-hint">
              {ko
                ? `등급(${draft.grade}, 기본 예산 ${defaultBudget}) · 크기(${draft.size}) · 성향 · 주력/부주력 스탯에 맞춰 6대 스탯을 자동 배분합니다.`
                : `Automatically distributes 6 primary stats by grade (${draft.grade}, base budget ${defaultBudget}), size (${draft.size}), tendency, and primary/secondary focus.`}
            </p>
          </div>
          <button type="button" className="button-small ce-btn-accent" onClick={applyAutoStats}>
            {ko ? "특성 기반 스탯 자동 배분" : "Auto-Allocate 6 Stats"}
          </button>
        </div>

        <div className="ce-grid-4">
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-auto-tendency">
              {ko ? "성향 프리셋" : "Tendency Preset"}
            </label>
            <select
              id="ce-auto-tendency"
              value={tendency}
              onChange={(e) => {
                const picked = TENDENCY_OPTIONS.find((opt) => opt.value === e.target.value)?.value;
                if (picked) setTendency(picked);
              }}
            >
              {TENDENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {ko ? opt.ko : opt.en}
                </option>
              ))}
            </select>
          </div>
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-auto-primary">
              {ko ? "주력 스탯 (+28%)" : "Primary Stat (+28%)"}
            </label>
            <select
              id="ce-auto-primary"
              value={primaryStat}
              onChange={(e) => {
                const picked = CREATURE_PRIMARY_CODES.find((c) => c === e.target.value);
                if (picked) setPrimaryStat(picked);
              }}
            >
              {CREATURE_PRIMARY_CODES.map((code) => (
                <option key={code} value={code}>
                  {ko ? STAT_LABELS[code].ko : STAT_LABELS[code].en}
                </option>
              ))}
            </select>
          </div>
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-auto-secondary">
              {ko ? "부주력 스탯 (+14%)" : "Secondary Stat (+14%)"}
            </label>
            <select
              id="ce-auto-secondary"
              value={secondaryStat}
              onChange={(e) => {
                const picked = CREATURE_PRIMARY_CODES.find((c) => c === e.target.value);
                if (picked) setSecondaryStat(picked);
              }}
            >
              {CREATURE_PRIMARY_CODES.map((code) => (
                <option key={code} value={code}>
                  {ko ? STAT_LABELS[code].ko : STAT_LABELS[code].en}
                </option>
              ))}
            </select>
          </div>
          <NumberField
            label={ko ? "총합 예산 지정 (비우면 등급 자동)" : "Custom Total Budget (optional)"}
            value={customBudget}
            min={6}
            max={6000}
            optional
            onChange={setCustomBudget}
          />
        </div>
      </section>

      {/* 2. 6대 1차 스탯 수동 편집 & 세트 내 스탯 분포 비교 */}
      <section className="be-card">
        <div className="ce-card-head">
          <h3 className="ce-section-title">
            {ko ? "1차 스탯 (6종) & 세트 분포 비교" : "Primary Stats (6) & Set Distribution Analyzer"}
          </h3>
          <div className="ce-inline-controls">
            <span className="dev-badge">
              {ko ? `현재 6스탯 합계: ${statSum}` : `Total 6-Stat Sum: ${statSum}`}
            </span>
            <select
              aria-label={ko ? "스탯 분포 비교 기준" : "Distribution comparison scope"}
              value={distScope}
              onChange={(e) => setDistScope(e.target.value)}
            >
              <option value="category">
                {ko
                  ? `같은 종족 분류 (${CATEGORY_LABELS[draft.category].ko})`
                  : `Same Category (${CATEGORY_LABELS[draft.category].en})`}
              </option>
              <option value="grade">
                {ko ? `같은 등급 (${draft.grade})` : `Same Grade (${draft.grade})`}
              </option>
              <option value="all">{ko ? "전체 크리처 도감" : "All Creatures"}</option>
              {Object.entries(PRESET_TAG_LABELS).map(([tag, label]) => (
                <option key={tag} value={tag}>
                  {ko ? label.ko : label.en}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ce-stat-rows">
          {CREATURE_PRIMARY_CODES.map((code) => {
            const val = draft.primaries[code];
            const dist = distribution.stats[code];
            const maxBar = Math.max(40, dist.max, val);
            const valPct = Math.min(100, (val / maxBar) * 100);
            const avgPct = Math.min(100, (dist.avg / maxBar) * 100);
            return (
              <div key={code} className="ce-stat-row">
                <NumberField
                  label={ko ? STAT_LABELS[code].ko : STAT_LABELS[code].en}
                  value={val}
                  min={CREATURE_LIMITS.stat.min}
                  max={CREATURE_LIMITS.stat.max}
                  onChange={(next) => {
                    if (next === undefined) return;
                    onEdit({
                      ...draft,
                      primaries: { ...draft.primaries, [code]: next },
                    });
                  }}
                />
                <div className="ce-stat-meter-col">
                  <div className="ce-stat-meter-track">
                    <div className="ce-stat-meter-fill" style={{ width: `${valPct.toFixed(1)}%` }} />
                    <div
                      className="ce-stat-meter-avg"
                      style={{ left: `${avgPct.toFixed(1)}%` }}
                      title={ko ? `집단 평균: ${dist.avg}` : `Group avg: ${dist.avg}`}
                    />
                  </div>
                  <div className="ce-stat-meter-meta">
                    <span>
                      {ko ? "비교 집단" : "Group"} ({distribution.count}): min {dist.min} · avg{" "}
                      <strong>{dist.avg}</strong> · max {dist.max}
                    </span>
                    <span>
                      {val >= dist.avg ? `+${(val - dist.avg).toFixed(1)}` : (val - dist.avg).toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. 12속성 점수 (0~10, 합계 ≤ 20) & 6계열 내성 · 아종 */}
      <section className="be-card">
        <div className="ce-card-head">
          <div>
            <h3 className="ce-section-title">
              {ko
                ? "12속성 점수 (0~10 · 합계 ≤ 20) & 아종 허용 (41_Time_Units §4.3)"
                : "12 Element Points (0~10 · Sum ≤ 20) & Allowed Subspecies"}
            </h3>
            <p className="field-hint">
              {ko
                ? "속성 1점당 해당 계열 방어력 +2.5%(48 §5). 속성 점수가 높으면 공격이 세지는 대신 상극 속성에 약해집니다."
                : "Each element point grants +2.5% defense in its family (48 §5)."}
            </p>
          </div>
          <span className={`dev-badge ${elementSum > CREATURE_LIMITS.elementSumMax ? "ce-badge-warn" : ""}`}>
            {ko
              ? `속성 합계: ${elementSum} / ${CREATURE_LIMITS.elementSumMax}`
              : `Element Sum: ${elementSum} / ${CREATURE_LIMITS.elementSumMax}`}
          </span>
        </div>

        <div className="ce-elements-grid">
          {ELEMENT_LABELS.map((elInfo, idx) => {
            const pts = draft.elements[idx] ?? 0;
            return (
              <div key={elInfo.id} className="ce-element-cell">
                <div className="ce-element-head">
                  <span className="ce-element-dot" style={{ backgroundColor: elInfo.color }} />
                  <span className="ce-element-name">{ko ? elInfo.ko : elInfo.en}</span>
                  <strong>{pts}</strong>
                </div>
                <input
                  type="range"
                  min={CREATURE_LIMITS.element.min}
                  max={CREATURE_LIMITS.element.max}
                  value={pts}
                  aria-label={ko ? elInfo.ko : elInfo.en}
                  onChange={(e) => {
                    const next = [...draft.elements];
                    next[idx] = Number(e.target.value);
                    onEdit({ ...draft, elements: next });
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="ce-family-strip">
          {families.map((fam) => (
            <span key={fam.label} className="dev-badge">
              {fam.label}: +{(fam.pts * 2.5).toFixed(1)}%
            </span>
          ))}
        </div>

        <div className="ce-subspecies-box">
          <span className="field-label">
            {ko
              ? "허용 속성 아종 (같은 종에서 주속성만 다른 변종 등장 허용)"
              : "Allowed Elemental Subspecies"}
          </span>
          <div className="ce-chip-list">
            {SUBSPECIES_OPTIONS.map((sub) => {
              const active = draft.allowedSubspecies?.includes(sub.id) === true;
              return (
                <button
                  key={sub.id}
                  type="button"
                  className="ce-tag-chip"
                  data-active={active ? "true" : undefined}
                  onClick={() => {
                    const current = new Set(draft.allowedSubspecies ?? []);
                    if (active) current.delete(sub.id);
                    else current.add(sub.id);
                    onEdit({ ...draft, allowedSubspecies: [...current] });
                  }}
                >
                  {ko ? sub.ko : sub.en}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
