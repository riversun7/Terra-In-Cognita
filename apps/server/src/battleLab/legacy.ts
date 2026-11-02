// 옛 모양 전투 실험실 프리셋 읽기 — D-502(사용자 답 296~298) 전에 저장한 DB 프리셋(battle_lab_presets.data)의 직접 값 무기를 지금 모양으로
// 고쳐 읽는다. 그러지 않으면 그 프리셋이 통째로 읽히지 않는다(목록의 invalid로 빠진다). DB 줄은 그대로 두고(다시 저장하면 새 모양),
// 읽을 때만 고친다.
// - 옛 모양: 공격력 칸 {attack, appropriate}(2차 점수 적정치)와 hitAppropriate·critAppropriate·speedAppropriate(2차 점수 적정치).
// - 새 모양: 공격력 칸 {attack}과 appropriate {str, int, dex, agi}(1차 적정 스탯, 0 = 없음). 옛 2차 점수 적정치는 1차로 옮길 수 없어
//   (가중치 표에 따라 뜻이 다르다) 모두 0(= 비율 100%)으로 둔다. 다시 적는 일은 화면에서 한다.

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 옛 공격력 칸 → {attack}(적정 칸을 뺀다). 객체가 아니면 그대로 */
function field(value: unknown): unknown {
  if (!isObject(value)) return value;
  const { appropriate: _drop, ...rest } = value;
  return rest;
}

/** 옛 직접 값 무기(hitAppropriate 칸이 있음)를 새 모양으로. 옛 모양이 아니면 같은 객체 */
function upgradeCustomWeapon(spec: unknown): unknown {
  if (!isObject(spec) || !("hitAppropriate" in spec) || "appropriate" in spec) return spec;
  const {
    hitAppropriate: _hit,
    critAppropriate: _crit,
    speedAppropriate: _speed,
    physical,
    elemental,
    ...rest
  } = spec;
  return {
    ...rest,
    physical: field(physical),
    elemental: field(elemental),
    appropriate: { str: 0, int: 0, dex: 0, agi: 0 },
  };
}

/** 실험 유닛 하나(바뀌지 않으면 같은 객체) */
function upgradeUnit(unit: unknown): unknown {
  if (!isObject(unit)) return unit;
  const weapon = unit.weapon;
  if (!isObject(weapon) || weapon.kind !== "custom") return unit;
  const spec = upgradeCustomWeapon(weapon.spec);
  return spec === weapon.spec ? unit : { ...unit, weapon: { ...weapon, spec } };
}

/** 프리셋 값(유닛 또는 편)을 지금 모양으로 읽는다. 바뀌지 않으면 같은 값 */
export function upgradeLegacyPreset(kind: string, data: unknown): unknown {
  if (kind === "unit") return upgradeUnit(data);
  if (kind !== "party" || !isObject(data)) return data;
  const before = data.units;
  if (!Array.isArray(before)) return data;
  const units: unknown[] = before.map(upgradeUnit);
  return units.some((unit, index) => unit !== before[index]) ? { ...data, units } : data;
}
