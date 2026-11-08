// 크리처 고유 무기(아이템식 성능 범위 min~max) · 스킬 슬롯 · 보유 스킬 탭(CreatureCombatTab).
import {
  CREATURE_LIMITS,
  CREATURE_PRIMARY_CODES,
  type CreatureEditorSkillOption,
  type CreatureEditorUnitKindOption,
  type CreatureJson,
  type CreatureNaturalWeaponJson,
  type CreatureWeaponAppropriate,
  simulateCreatureWeaponRoll,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { CheckField, NumberField, RemoveButton, TextField } from "../content/contentEditorFields.tsx";

const APPROPRIATE_OPTIONS: readonly {
  readonly value: CreatureWeaponAppropriate;
  readonly ko: string;
  readonly en: string;
}[] = [
  { value: "str", ko: "힘 (STR)", en: "STR" },
  { value: "dex", ko: "솜씨 (DEX)", en: "DEX" },
  { value: "agi", ko: "민첩 (AGI)", en: "AGI" },
  { value: "int", ko: "지능 (INT)", en: "INT" },
];

const BONUS_STAT_OPTIONS = [
  ...CREATURE_PRIMARY_CODES,
  "max_hp",
  "max_stamina",
  "max_mp",
  "phys_attack",
  "elem_attack",
  "phys_defense",
  "move_speed",
  "attack_speed",
  "hit_pm",
  "evade_pm",
  "crit_chance_pm",
  "crit_damage_pm",
  "armor_pen_pm",
] as const;

function AttackRangeBand({
  label,
  baseLabel,
  minLabel,
  maxLabel,
  autoLabel,
  defaultAttack,
  value,
  canDisable,
  onChange,
}: {
  readonly label: string;
  readonly baseLabel: string;
  readonly minLabel: string;
  readonly maxLabel: string;
  readonly autoLabel: string;
  readonly defaultAttack: { readonly attack: number; readonly min: number; readonly max: number };
  readonly value: { readonly attack: number; readonly min: number; readonly max: number } | undefined;
  readonly canDisable: boolean;
  readonly onChange: (
    next: { readonly attack: number; readonly min: number; readonly max: number } | undefined,
  ) => void;
}) {
  return (
    <div className="ce-weapon-band">
      <div className="ce-card-head">
        <CheckField
          label={label}
          checked={value !== undefined}
          onChange={(on) => {
            if (!on && !canDisable) return;
            onChange(on ? defaultAttack : undefined);
          }}
        />
        {value ? (
          <button
            type="button"
            className="button-small"
            onClick={() => {
              const base = value.attack;
              onChange({
                ...value,
                attack: base,
                min: Math.max(1, Math.round(base * 0.82)),
                max: Math.max(base, Math.round(base * 1.28)),
              });
            }}
          >
            {autoLabel}
          </button>
        ) : null}
      </div>
      {value ? (
        <div className="ce-grid-3">
          <NumberField
            label={baseLabel}
            value={value.attack}
            min={0}
            max={CREATURE_LIMITS.weaponAttack.max}
            onChange={(v) => v !== undefined && onChange({ ...value, attack: v })}
          />
          <NumberField
            label={minLabel}
            value={value.min}
            min={0}
            max={CREATURE_LIMITS.weaponAttack.max}
            onChange={(v) => v !== undefined && onChange({ ...value, min: v, max: Math.max(v, value.max) })}
          />
          <NumberField
            label={maxLabel}
            value={value.max}
            min={0}
            max={CREATURE_LIMITS.weaponAttack.max}
            onChange={(v) => v !== undefined && onChange({ ...value, min: Math.min(value.min, v), max: v })}
          />
        </div>
      ) : null}
    </div>
  );
}

export function CreatureCombatTab({
  draft,
  skills,
  unitKinds,
  locale,
  onEdit,
}: {
  readonly draft: CreatureJson;
  readonly skills: readonly CreatureEditorSkillOption[];
  readonly unitKinds: readonly CreatureEditorUnitKindOption[];
  readonly locale: "ko" | "en";
  readonly onEdit: (next: CreatureJson) => void;
}) {
  const ko = locale !== "en";
  const [rollSeed, setRollSeed] = useState(101);
  const weapon = draft.naturalWeapon;

  const updateWeapon = (nextWeapon: CreatureNaturalWeaponJson | undefined): void => {
    const next: CreatureJson = {
      ...draft,
      ...(nextWeapon ? { naturalWeapon: nextWeapon } : {}),
    };
    if (!nextWeapon) {
      const { naturalWeapon: _removed, ...rest } = next;
      onEdit(rest);
      return;
    }
    onEdit(next);
  };

  const sampleTiers = [
    { label: ko ? "최하 (0‰)" : "Min (0‰)", seed: rollSeed * 13 + 1 },
    { label: ko ? "하 (250‰)" : "Low (250‰)", seed: rollSeed * 17 + 2 },
    { label: ko ? "보통 (500‰)" : "Mid (500‰)", seed: rollSeed * 23 + 3 },
    { label: ko ? "상 (750‰)" : "High (750‰)", seed: rollSeed * 29 + 4 },
    { label: ko ? "최상 (1000‰)" : "Max (1000‰)", seed: rollSeed * 31 + 5 },
  ];

  return (
    <div className="ce-tab-stack">
      {/* 1. 고유 무기 (아이템 무기 방식 성능 범위 min ~ max) */}
      <section className="be-card">
        <div className="ce-card-head">
          <div>
            <h3 className="ce-section-title">
              {ko
                ? "크리처 고유 무기 & 랜덤 성능 범위 (아이템 무기 방식)"
                : "Innate Natural Weapon & Random Performance Range (Item-Style)"}
            </h3>
            <p className="field-hint">
              {ko
                ? "철검 제작 시 기준 공격력 30에서 25~40이 나오듯, 고유 무기도 기준 공격력(attack)과 지급 범위(min~max) 및 추가 스탯 범위를 가집니다."
                : "Like crafted weapons (e.g., base 30 rolling 25~40), natural weapons define base attack plus min~max roll ranges and bonus stat rolls."}
            </p>
          </div>
          <CheckField
            label={ko ? "고유 무기 사용" : "Enable Natural Weapon"}
            checked={weapon !== undefined}
            onChange={(on) => {
              if (!on) {
                updateWeapon(undefined);
                return;
              }
              updateWeapon({
                name: { ko: `${draft.name.ko} 고유 무기`, en: `${draft.name.en} Natural Weapon` },
                appropriate: "str",
                physical: { attack: 30, min: 25, max: 40 },
                hitPm: 900,
                critPm: 60,
                intervalMs: 1400,
                range: 1,
                staminaCost: 5,
              });
            }}
          />
        </div>

        {weapon ? (
          <div className="ce-weapon-editor">
            <div className="ce-grid-4">
              <TextField
                label={ko ? "고유 무기 이름 (한국어)" : "Weapon Name (KO)"}
                value={weapon.name?.ko ?? ""}
                onChange={(v) =>
                  updateWeapon({
                    ...weapon,
                    name: { ko: v, en: weapon.name?.en || v },
                  })
                }
              />
              <TextField
                label={ko ? "고유 무기 이름 (영어)" : "Weapon Name (EN)"}
                value={weapon.name?.en ?? ""}
                onChange={(v) =>
                  updateWeapon({
                    ...weapon,
                    name: { ko: weapon.name?.ko || v, en: v },
                  })
                }
              />
              <div className="field ce-field">
                <label className="field-label" htmlFor="ce-weapon-appropriate">
                  {ko ? "적합 스탯" : "Appropriate Stat"}
                </label>
                <select
                  id="ce-weapon-appropriate"
                  value={weapon.appropriate ?? "str"}
                  onChange={(e) => {
                    const picked = APPROPRIATE_OPTIONS.find((opt) => opt.value === e.target.value)?.value;
                    if (picked) updateWeapon({ ...weapon, appropriate: picked });
                  }}
                >
                  {APPROPRIATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {ko ? opt.ko : opt.en}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                label={ko ? "공격 주기 (ms)" : "Interval (ms)"}
                value={weapon.intervalMs}
                min={CREATURE_LIMITS.weaponIntervalMs.min}
                max={CREATURE_LIMITS.weaponIntervalMs.max}
                onChange={(v) => v !== undefined && updateWeapon({ ...weapon, intervalMs: v })}
              />
            </div>

            <div className="ce-grid-4">
              <NumberField
                label={ko ? "사거리 (칸)" : "Range (tiles)"}
                value={weapon.range}
                min={CREATURE_LIMITS.weaponRange.min}
                max={CREATURE_LIMITS.weaponRange.max}
                onChange={(v) => v !== undefined && updateWeapon({ ...weapon, range: v })}
              />
              <NumberField
                label={ko ? "명중 (‰)" : "Hit (‰)"}
                value={weapon.hitPm}
                min={0}
                max={2000}
                optional
                onChange={(v) => updateWeapon({ ...weapon, hitPm: v })}
              />
              <NumberField
                label={ko ? "치명타율 (‰)" : "Crit (‰)"}
                value={weapon.critPm}
                min={0}
                max={1000}
                optional
                onChange={(v) => updateWeapon({ ...weapon, critPm: v })}
              />
              <NumberField
                label={ko ? "스태미나 소모" : "Stamina Cost"}
                value={weapon.staminaCost}
                min={0}
                max={1000}
                optional
                onChange={(v) => updateWeapon({ ...weapon, staminaCost: v })}
              />
            </div>

            <AttackRangeBand
              label={ko ? "물리 공격력 (Physical)" : "Physical Attack"}
              baseLabel={ko ? "기준 물리 공격력 (attack)" : "Base Physical Attack"}
              minLabel={ko ? "최소 물리 공격력 (min)" : "Min Physical Roll"}
              maxLabel={ko ? "최대 물리 공격력 (max)" : "Max Physical Roll"}
              autoLabel={ko ? "기준값 대비 자동 범위 (82%~128%)" : "Auto Range (82%~128%)"}
              defaultAttack={{ attack: 30, min: 25, max: 40 }}
              value={weapon.physical}
              canDisable={weapon.elemental !== undefined}
              onChange={(nextPhys) => {
                if (!nextPhys) {
                  const { physical: _p, ...rest } = weapon;
                  updateWeapon(rest);
                } else {
                  updateWeapon({ ...weapon, physical: nextPhys });
                }
              }}
            />

            <AttackRangeBand
              label={ko ? "원소·마법 공격력 (Elemental)" : "Elemental Attack"}
              baseLabel={ko ? "기준 원소 공격력 (attack)" : "Base Elemental Attack"}
              minLabel={ko ? "최소 원소 공격력 (min)" : "Min Elemental Roll"}
              maxLabel={ko ? "최대 원소 공격력 (max)" : "Max Elemental Roll"}
              autoLabel={ko ? "기준값 대비 자동 범위 (82%~128%)" : "Auto Range (82%~128%)"}
              defaultAttack={{ attack: 28, min: 22, max: 36 }}
              value={weapon.elemental}
              canDisable={weapon.physical !== undefined}
              onChange={(nextElem) => {
                if (!nextElem) {
                  const { elemental: _e, ...rest } = weapon;
                  updateWeapon(rest);
                } else {
                  updateWeapon({ ...weapon, elemental: nextElem });
                }
              }}
            />

            {/* 무기 추가 스탯 범위 (최대 6줄) */}
            <div className="ce-weapon-band">
              <div className="ce-card-head">
                <span className="field-label">
                  {ko
                    ? `무기 추가 스탯 랜덤 범위 (${weapon.stats?.length ?? 0}/${CREATURE_LIMITS.weaponStats})`
                    : `Weapon Bonus Stat Ranges (${weapon.stats?.length ?? 0}/${CREATURE_LIMITS.weaponStats})`}
                </span>
                <button
                  type="button"
                  className="button-small"
                  disabled={(weapon.stats?.length ?? 0) >= CREATURE_LIMITS.weaponStats}
                  onClick={() => {
                    const used = new Set((weapon.stats ?? []).map((s) => s.stat));
                    const nextStat = BONUS_STAT_OPTIONS.find((s) => !used.has(s)) ?? "crit_damage_pm";
                    updateWeapon({
                      ...weapon,
                      stats: [...(weapon.stats ?? []), { stat: nextStat, min: 10, max: 30 }],
                    });
                  }}
                >
                  {ko ? "+ 추가 스탯 줄" : "+ Add Bonus Stat"}
                </button>
              </div>
              {(weapon.stats ?? []).map((row, idx) => (
                <div key={`${row.stat}-${idx}`} className="ce-weapon-stat-row">
                  <select
                    aria-label={ko ? "추가 스탯 종류" : "Bonus stat code"}
                    value={row.stat}
                    onChange={(e) => {
                      const next = [...(weapon.stats ?? [])];
                      next[idx] = { ...row, stat: e.target.value };
                      updateWeapon({ ...weapon, stats: next });
                    }}
                  >
                    {BONUS_STAT_OPTIONS.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  <NumberField
                    label="min"
                    hideLabel
                    value={row.min}
                    min={-100000}
                    max={100000}
                    onChange={(v) => {
                      if (v === undefined) return;
                      const next = [...(weapon.stats ?? [])];
                      next[idx] = { ...row, min: v, max: Math.max(v, row.max) };
                      updateWeapon({ ...weapon, stats: next });
                    }}
                  />
                  <span>~</span>
                  <NumberField
                    label="max"
                    hideLabel
                    value={row.max}
                    min={-100000}
                    max={100000}
                    onChange={(v) => {
                      if (v === undefined) return;
                      const next = [...(weapon.stats ?? [])];
                      next[idx] = { ...row, min: Math.min(row.min, v), max: v };
                      updateWeapon({ ...weapon, stats: next });
                    }}
                  />
                  <RemoveButton
                    name={row.stat}
                    onClick={() => {
                      const next = (weapon.stats ?? []).filter((_, i) => i !== idx);
                      updateWeapon({
                        ...weapon,
                        ...(next.length > 0 ? { stats: next } : { stats: undefined }),
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* 고유 무기 성능 굴리기 시뮬레이터 */}
            <div className="ce-weapon-sim">
              <div className="ce-card-head">
                <span className="field-label">
                  {ko
                    ? "고유 무기 지급 성능 추첨 미리보기 (5개 표본)"
                    : "Innate Weapon Roll Preview (5 Samples)"}
                </span>
                <button type="button" className="button-small" onClick={() => setRollSeed((s) => s + 1)}>
                  {ko ? "다시 추첨 굴리기" : "Reroll Samples"}
                </button>
              </div>
              <div className="ce-weapon-sim-grid">
                {sampleTiers.map((sample) => {
                  const rolled = simulateCreatureWeaponRoll(weapon, sample.seed);
                  return (
                    <div key={sample.label} className="ce-weapon-sim-card">
                      <span className="field-hint">
                        {ko ? `품질 ${rolled.qualityPm}‰` : `Quality ${rolled.qualityPm}‰`}
                      </span>
                      {rolled.physicalAttack !== null ? (
                        <div>
                          {ko ? "물리" : "Phys"}: <strong>{rolled.physicalAttack}</strong>
                        </div>
                      ) : null}
                      {rolled.elementalAttack !== null ? (
                        <div>
                          {ko ? "원소" : "Elem"}: <strong>{rolled.elementalAttack}</strong>
                        </div>
                      ) : null}
                      {rolled.stats.map((st) => (
                        <div key={st.stat} className="field-hint">
                          {st.stat}: {st.value >= 0 ? `+${st.value}` : st.value}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2. 스킬 슬롯 & 보유 스킬 */}
      <section className="be-card">
        <div className="ce-card-head">
          <h3 className="ce-section-title">
            {ko
              ? "스킬 슬롯 & 고유·해금 스킬 (41_Time_Units §4.3 · 최대 10칸)"
              : "Skill Slots & Innate/Unlocked Skills (Max 10 Slots)"}
          </h3>
          <button
            type="button"
            className="button-small"
            disabled={(draft.skills?.length ?? 0) >= CREATURE_LIMITS.skillsMax || skills.length === 0}
            onClick={() => {
              const used = new Set((draft.skills ?? []).map((s) => s.skill));
              const pick = skills.find((s) => !used.has(s.id)) ?? skills[0];
              if (!pick) return;
              onEdit({
                ...draft,
                skills: [...(draft.skills ?? []), { skill: pick.id, unlockLevel: 1, innate: true }],
              });
            }}
          >
            {ko ? "+ 스킬 연결" : "+ Add Skill"}
          </button>
        </div>

        <div className="ce-grid-4">
          <NumberField
            label={ko ? "기본 슬롯 (base)" : "Base Slots"}
            value={draft.skillSlots.base}
            min={CREATURE_LIMITS.skillSlots.min}
            max={CREATURE_LIMITS.skillSlots.max}
            onChange={(v) => {
              if (v === undefined) return;
              onEdit({
                ...draft,
                skillSlots: {
                  ...draft.skillSlots,
                  base: v,
                  max: Math.max(v, draft.skillSlots.max),
                },
              });
            }}
          />
          <NumberField
            label={ko ? "환생당 증가 (perRebirth)" : "Slots per Rebirth"}
            value={draft.skillSlots.perRebirth}
            min={0}
            max={CREATURE_LIMITS.skillSlots.max}
            onChange={(v) =>
              v !== undefined && onEdit({ ...draft, skillSlots: { ...draft.skillSlots, perRebirth: v } })
            }
          />
          <NumberField
            label={ko ? "최대 슬롯 상한 (max ≤ 10)" : "Max Slots (≤ 10)"}
            value={draft.skillSlots.max}
            min={draft.skillSlots.base}
            max={CREATURE_LIMITS.skillSlots.max}
            onChange={(v) =>
              v !== undefined && onEdit({ ...draft, skillSlots: { ...draft.skillSlots, max: v } })
            }
          />
          <div className="field ce-field">
            <label className="field-label" htmlFor="ce-unit-kind">
              {ko ? "연결 유닛 종류 (장비 슬롯 규칙)" : "Linked Unit Kind"}
            </label>
            <select
              id="ce-unit-kind"
              value={draft.unitKind ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onEdit({ ...draft, ...(v === "" ? { unitKind: undefined } : { unitKind: v }) });
              }}
            >
              <option value="">{ko ? "— 기본 (크리처 공용) —" : "— Default —"}</option>
              {unitKinds.map((uk) => (
                <option key={uk.id} value={uk.id}>
                  {ko ? uk.name.ko : uk.name.en} ({uk.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {(draft.skills?.length ?? 0) > 0 ? (
          <div className="ce-list-rows">
            {(draft.skills ?? []).map((link, idx) => (
              <div key={`${link.skill}-${idx}`} className="ce-skill-row">
                <select
                  aria-label={ko ? "연결할 스킬" : "Linked skill"}
                  value={link.skill}
                  onChange={(e) => {
                    const next = [...(draft.skills ?? [])];
                    next[idx] = { ...link, skill: e.target.value };
                    onEdit({ ...draft, skills: next });
                  }}
                >
                  {skills.map((sk) => (
                    <option key={sk.id} value={sk.id}>
                      {ko ? sk.name.ko : sk.name.en} ({sk.id})
                    </option>
                  ))}
                </select>
                <NumberField
                  label={ko ? "해금 레벨" : "Unlock Lv"}
                  value={link.unlockLevel ?? 1}
                  min={1}
                  max={200}
                  onChange={(v) => {
                    if (v === undefined) return;
                    const next = [...(draft.skills ?? [])];
                    next[idx] = { ...link, unlockLevel: v };
                    onEdit({ ...draft, skills: next });
                  }}
                />
                <CheckField
                  label={ko ? "선천 고유" : "Innate"}
                  checked={Boolean(link.innate)}
                  onChange={(on) => {
                    const next = [...(draft.skills ?? [])];
                    next[idx] = { ...link, innate: on };
                    onEdit({ ...draft, skills: next });
                  }}
                />
                <RemoveButton
                  name={link.skill}
                  onClick={() => {
                    const next = (draft.skills ?? []).filter((_, i) => i !== idx);
                    onEdit({ ...draft, skills: next });
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="field-hint">
            {ko ? "연결된 스킬이 없습니다. [+ 스킬 연결]로 추가하세요." : "No linked skills yet."}
          </p>
        )}
      </section>
    </div>
  );
}
