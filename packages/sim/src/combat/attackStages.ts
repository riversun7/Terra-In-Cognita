// 공격 한 번의 단계 기록 — 전투 보고서의 피해 흐름(docs/adr/2026-11-14-battle-report.md "피해 흐름")
// 판정 코어(formula.ts resolveAttack)가 받은 기록 칸에 단계마다 값을 적는다. 기록 칸이 없으면(실제 플레이·시뮬레이터) 적지 않는다:
// 판정은 기록 칸과 상관없이 같은 값·같은 굴림이다(관찰자 규칙, battleTrace.ts — attackStages.test.ts가 결과가 같은지 본다).
// 코드 차례(바꾸면 이 차례도 바꾼다): 명중 굴림 → 회피 굴림 → 크리 굴림(배율은 뒤에) → 실제 공격력(스탯 + 무기 몫) → 두 몫 나눔
// → 물리: 비율 방어(방어율 − 관통) → 고정 방어 / 속성: 방어 상성 → 속성 방어율 → 속성 저항 → 크리 배율 → 스킬 배율 → 버프
// → 물리 최소 1 → 최종 → (전투) 고정 피해(스킬) → 아머(물리)·쉴드(속성) → HP.

/** 공격 한 번의 단계 값. 굴림에서 멈추면(빗나감·회피) 뒤 칸은 0 */
export interface AttackStages {
  /** 기본 공격 또는 스킬 대상 하나 */
  source: "attack" | "skill";
  kind: "physical" | "elemental";
  /** 명중 확률(‰)과 굴림(0~9999, 확률 × 10보다 작으면 명중) */
  hitPm: number;
  hitRoll: number;
  /** 회피: 2차 스탯 회피(‰)·AGI 상대 보정(코드 모양 N11, ‰)·최종(식 evade_chance, 1~85% 자름)·굴림 */
  evadeBasePm: number;
  evadeRelativePm: number;
  evadePm: number;
  evadeRoll: number;
  /** 크리 확률(‰)·굴림·크리인가·크리 배율(‰, 크리가 아니면 0) */
  critPm: number;
  critRoll: number;
  crit: boolean;
  critMulPm: number;
  outcome: "miss" | "evaded" | "hit";
  /** 스탯 공격력·무기 공격력(적정 비율 전)·실제 공격력(식 real_attack) */
  statAttack: number;
  weaponAttack: number;
  realAttack: number;
  /** 속성 가산(‰, Σ 계수 × 칸 값) */
  elementAddPm: number;
  /** 두 몫 처음 값 */
  physicalRaw: number;
  elementalRaw: number;
  /** 물리: 듣는 방어율(방어율 − 관통, 0~1000)·방어율·관통, 비율 방어 뒤, 고정 방어, 고정 방어 뒤 */
  ratePm: number;
  defenseRatePm: number;
  penetrationPm: number;
  physicalAfterRate: number;
  defenseFlat: number;
  physicalAfterFlat: number;
  /** 속성: 방어 상성(‰) 뒤, 속성 방어율(‰) 뒤, 저항(‰) 뒤 */
  matchupPm: number;
  elementalAfterMatchup: number;
  elementalDefensePm: number;
  elementalAfterDefense: number;
  resistPm: number;
  elementalAfterResist: number;
  /** 크리 배율·스킬 배율·버프 뒤의 두 몫 */
  physicalAfterCrit: number;
  elementalAfterCrit: number;
  skillMulPm: number;
  physicalAfterSkill: number;
  elementalAfterSkill: number;
  buffPm: number;
  physicalAfterBuff: number;
  elementalAfterBuff: number;
  /** 물리 최소 1을 올렸나 */
  floored: boolean;
  /** 판정 끝 두 몫 */
  physical: number;
  elemental: number;
  /** 스킬 고정 피해(공식 부품 flat, 그 스킬 종류 몫에 더함) */
  flat: number;
  /** 반영: 아머·쉴드·HP가 받은 양과 HP를 넘친 양 */
  toArmor: number;
  toShield: number;
  toHp: number;
  overkill: number;
}

export function newAttackStages(source: "attack" | "skill"): AttackStages {
  return {
    source,
    kind: "physical",
    hitPm: 0,
    hitRoll: 0,
    evadeBasePm: 0,
    evadeRelativePm: 0,
    evadePm: 0,
    evadeRoll: 0,
    critPm: 0,
    critRoll: 0,
    crit: false,
    critMulPm: 0,
    outcome: "miss",
    statAttack: 0,
    weaponAttack: 0,
    realAttack: 0,
    elementAddPm: 0,
    physicalRaw: 0,
    elementalRaw: 0,
    ratePm: 0,
    defenseRatePm: 0,
    penetrationPm: 0,
    physicalAfterRate: 0,
    defenseFlat: 0,
    physicalAfterFlat: 0,
    matchupPm: 0,
    elementalAfterMatchup: 0,
    elementalDefensePm: 0,
    elementalAfterDefense: 0,
    resistPm: 0,
    elementalAfterResist: 0,
    physicalAfterCrit: 0,
    elementalAfterCrit: 0,
    skillMulPm: 0,
    physicalAfterSkill: 0,
    elementalAfterSkill: 0,
    buffPm: 0,
    physicalAfterBuff: 0,
    elementalAfterBuff: 0,
    floored: false,
    physical: 0,
    elemental: 0,
    flat: 0,
    toArmor: 0,
    toShield: 0,
    toHp: 0,
    overkill: 0,
  };
}

/** 피해 반영 앞뒤(아머·쉴드·HP)에서 받은 양을 적는다. hp는 반영 앞 값, 넘친 양 = 들어간 HP 피해 − 반영 앞 HP */
export function recordApplied(
  stages: AttackStages,
  before: { readonly armor: number; readonly shield: number; readonly hp: number },
  after: { readonly armor: number; readonly shield: number; readonly hp: number },
  physical: number,
  elemental: number,
): void {
  stages.toArmor = before.armor - after.armor;
  stages.toShield = before.shield - after.shield;
  const intoHp = Math.max(0, physical) + Math.max(0, elemental) - stages.toArmor - stages.toShield;
  stages.toHp = Math.min(intoHp, Math.max(0, before.hp));
  stages.overkill = Math.max(0, intoHp - stages.toHp);
}
