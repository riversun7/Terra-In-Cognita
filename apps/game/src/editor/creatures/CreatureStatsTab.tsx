// 크리처 스탯 · 12속성 · 아종 · 세트 6스탯 분포 분석 탭(CreatureStatsTab) — 기획 D-094·D-5024·41_Time_Units §4.3.
// 스탯 값은 1레벨 기준이고 스탯마다 조우 오차(±)를 둔다(기본 규칙: 10 이하 ±1, 20 이하 ±2, 그 위 ±3). 랜덤 분포 뽑기 = 총합·고정할 스탯을
// 정하고 나머지를 흔들어 나눈다(사용자 결정 2026-11-25, docs/adr/2026-11-25-creature-codex-groups.md 4절).
import {
  CREATURE_GRADE_STAT_BUDGET,
  CREATURE_LIMITS,
  CREATURE_PRIMARY_CODES,
  type CreatureClassJson,
  type CreatureJson,
  type CreaturePrimaryCode,
  type CreatureStatTendency,
  allocateCreatureStats,
  creatureDefaultSpread,
  creatureSpreadOf,
  creatureClassPath,
  creatureClassSubtree,
  creatureStatRange,
  creatureStatSumRange,
  rollCreatureStatDistribution,
  summarizeCreatureStatDistribution,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { NumberField } from "../content/contentEditorFields.tsx";
import { ElementChip, StatShareBar } from "./creatureBits.tsx";
import { ELEMENT_LABELS, PRESET_TAG_LABELS, STAT_LABELS, seedOfId } from "./creatureModel.ts";
import { STAT_SUM_ABSOLUTE_MAX } from "@terra/shared/statGrowth";

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
  classes,
  locale,
  onEdit,
}: {
  readonly draft: CreatureJson;
  readonly allCreatures: readonly CreatureJson[];
  readonly classes: readonly CreatureClassJson[];
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
  const [locked, setLocked] = useState<ReadonlySet<CreaturePrimaryCode>>(new Set());
  const [rollSeed, setRollSeed] = useState(() => seedOfId(draft.id));

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

  // 랜덤 분포 뽑기: 고정한 스탯은 지금 값 그대로, 나머지를 총합에 맞춰 흔들어 나눈다(누를 때마다 다른 분포)
  const rollRandomStats = (): void => {
    const seed = (rollSeed + 1) >>> 0;
    setRollSeed(seed);
    const lockedValues: Partial<Record<CreaturePrimaryCode, number>> = {};
    for (const code of locked) lockedValues[code] = draft.primaries[code];
    onEdit({
      ...draft,
      primaries: rollCreatureStatDistribution({
        budget: customBudget ?? defaultBudget,
        size: draft.size,
        tendency,
        focus: [primaryStat, secondaryStat],
        locked: lockedValues,
        seed,
      }),
    });
  };

  const sumRange = creatureStatSumRange(draft);
  const customSpread = draft.primarySpread !== undefined;
  const setSpread = (code: CreaturePrimaryCode, value: number): void => {
    const next = { str: 0, dex: 0, agi: 0, vit: 0, int: 0, wis: 0 };
    for (const key of CREATURE_PRIMARY_CODES) next[key] = creatureSpreadOf(draft, key);
    next[code] = value;
    onEdit({ ...draft, primarySpread: next });
  };

  // 같은 대분류(그 아래 중·소분류 포함)
  const large = creatureClassPath(classes, draft.category)[0];
  const largeIds = large ? creatureClassSubtree(classes, large.id) : new Set([draft.category]);
  const largeName = large ? (ko ? large.name.ko : large.name.en) : draft.category;

  // 세트·분류 6스탯 분포 비교 대상
  const compareTarget = allCreatures.filter((c) => {
    if (distScope === "all") return true;
    if (distScope === "category") return largeIds.has(c.category);
    if (distScope === "grade") return c.grade === draft.grade;
    return Boolean(c.tags?.includes(distScope));
  });
  const distribution = summarizeCreatureStatDistribution(compareTarget.length > 0 ? compareTarget : [draft]);

  // 6계열 방어력 요약(계열 = ⌊칸 ÷ 2⌋: 기본형 + 강화형)
  const el = (idx: number): number => draft.elements[idx] ?? 0;
  const families = [0, 2, 4, 6, 8, 10].map((base) => {
    const basic = ELEMENT_LABELS[base];
    const enhanced = ELEMENT_LABELS[base + 1];
    return {
      label: `${basic ? (ko ? basic.ko : basic.en) : ""}·${enhanced ? (ko ? enhanced.ko : enhanced.en) : ""}`,
      pts: el(base) + el(base + 1),
    };
  });

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
          <div className="be-actions">
            <button type="button" className="button-small ce-btn-accent" onClick={applyAutoStats}>
              {ko ? "특성 기반 스탯 자동 배분" : "Auto-Allocate 6 Stats"}
            </button>
            <button type="button" className="button-small ce-btn-accent" onClick={rollRandomStats}>
              {ko ? "랜덤 분포 뽑기" : "Roll Random Distribution"}
            </button>
          </div>
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
            max={STAT_SUM_ABSOLUTE_MAX}
            optional
            onChange={setCustomBudget}
          />
        </div>

        <div className="ce-subspecies-block">
          <span className="field-label">
            {ko
              ? "랜덤 분포에서 고정할 스탯 (지금 값 그대로 두고 나머지만 뽑는다)"
              : "Stats to keep when rolling (others are re-rolled)"}
          </span>
          <div className="ce-chip-list">
            {CREATURE_PRIMARY_CODES.map((code) => {
              const active = locked.has(code);
              return (
                <button
                  key={code}
                  type="button"
                  className="ce-tag-chip"
                  aria-pressed={active}
                  data-active={active ? "true" : undefined}
                  onClick={() => {
                    const next = new Set(locked);
                    if (active) next.delete(code);
                    else next.add(code);
                    setLocked(next);
                  }}
                >
                  {ko ? STAT_LABELS[code].ko : STAT_LABELS[code].en} {draft.primaries[code]}
                </button>
              );
            })}
          </div>
          <span className="field-hint">
            {ko
              ? `총합 ${customBudget ?? defaultBudget} 안에서 성향·주력·부주력 비중에 흔들림을 얹어 나눕니다. 누를 때마다 다른 분포가 나오고 Ctrl+Z로 되돌립니다.`
              : `Splits the total (${customBudget ?? defaultBudget}) by tendency and focus weights with random jitter. Each click rolls again; Ctrl+Z undoes.`}
          </span>
        </div>
      </section>

      {/* 2. 6대 1차 스탯 수동 편집 & 세트 내 스탯 분포 비교 */}
      <section className="be-card">
        <div className="ce-card-head">
          <h3 className="ce-section-title">
            {ko
              ? "1차 스탯 (1레벨 기준 · 조우 오차 ±) & 세트 분포 비교"
              : "Primary Stats (Level 1 · Encounter Spread ±) & Set Distribution"}
          </h3>
          <div className="ce-inline-controls">
            <span className="dev-badge">
              {ko
                ? `합계 ${statSum} · 조우 범위 ${sumRange.min}~${sumRange.max}`
                : `Sum ${statSum} · range ${sumRange.min}–${sumRange.max}`}
            </span>
            <button
              type="button"
              className="button-small"
              disabled={!customSpread}
              onClick={() => onEdit({ ...draft, primarySpread: undefined })}
            >
              {ko ? "오차 기본값으로" : "Reset Spread"}
            </button>
            <select
              aria-label={ko ? "스탯 분포 비교 기준" : "Distribution comparison scope"}
              value={distScope}
              onChange={(e) => setDistScope(e.target.value)}
            >
              <option value="category">
                {ko ? `같은 대분류 (${largeName})` : `Same large class (${largeName})`}
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

        <p className="field-hint">
          {ko
            ? "조우하는 개체의 스탯은 기준 ± 오차 안에서 정해집니다. 오차를 따로 적지 않으면 기본 규칙(기준 10 이하 ±1, 20 이하 ±2, 그 위 ±3)을 따릅니다."
            : "Encountered individuals roll each stat within base ± spread. Without a custom spread the default rule applies (≤10 ±1, ≤20 ±2, above ±3)."}
        </p>
        <StatShareBar primaries={draft.primaries} locale={locale} large />
        <div className="ce-stat-rows">
          {CREATURE_PRIMARY_CODES.map((code) => {
            const val = draft.primaries[code];
            const dist = distribution.stats[code];
            const range = creatureStatRange(draft, code);
            const maxBar = Math.max(40, dist.max, range.max);
            const valPct = Math.min(100, (val / maxBar) * 100);
            const avgPct = Math.min(100, (dist.avg / maxBar) * 100);
            const minPct = Math.min(100, (range.min / maxBar) * 100);
            const maxPct = Math.min(100, (range.max / maxBar) * 100);
            return (
              <div key={code} className="ce-stat-row ce-stat-row-spread" data-stat={code}>
                <NumberField
                  label={ko ? STAT_LABELS[code].ko : STAT_LABELS[code].en}
                  value={val}
                  min={CREATURE_LIMITS.stat.min}
                  max={CREATURE_LIMITS.stat.max}
                  slider={false}
                  onChange={(next) => {
                    if (next === undefined) return;
                    onEdit({
                      ...draft,
                      primaries: { ...draft.primaries, [code]: next },
                    });
                  }}
                />
                <NumberField
                  label={
                    ko
                      ? `오차 ± (기본 ${creatureDefaultSpread(val)})`
                      : `Spread ± (default ${creatureDefaultSpread(val)})`
                  }
                  value={range.spread}
                  min={CREATURE_LIMITS.spread.min}
                  max={CREATURE_LIMITS.spread.max}
                  slider={false}
                  onChange={(next) => {
                    if (next !== undefined) setSpread(code, next);
                  }}
                />
                <p className="ce-stat-range">
                  <span className="field-label">{ko ? "1레벨 조우 범위" : "Level-1 roll range"}</span>
                  <strong className="ce-stat-range-text">
                    {range.min}~{range.max}
                  </strong>
                </p>
                <div className="ce-stat-meter-col">
                  <div className="ce-stat-meter-track">
                    <div className="ce-stat-meter-fill" style={{ width: `${valPct.toFixed(1)}%` }} />
                    <div
                      className="ce-stat-meter-range"
                      style={{ left: `${minPct.toFixed(1)}%`, width: `${(maxPct - minPct).toFixed(1)}%` }}
                    />
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
                  <ElementChip index={idx} locale={locale} />
                  <span className="ce-element-name">
                    {ko ? elInfo.ko : elInfo.en}
                    {elInfo.enhanced ? (ko ? " (강화)" : " (enh.)") : ""}
                  </span>
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
