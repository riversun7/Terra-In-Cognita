// 밸런스 화면 기준 유닛 프리셋 순수 코드 — 고른 프리셋과 기준 유닛 칸이 같은지, 저장할 값, 새로 만든 프리셋 찾기, 고르기 칸 목록.
// docs/adr/2026-11-01-balance-screen.md "바뀜 (D-467)". 목록·검사·저장은 서버가 한다. 여기서는 보이기·입력만 다룬다.
import {
  type BalancePresetValues,
  type BalancePresetView,
  type BalancePrimaries,
  normalizeBalancePresetName,
} from "@terra/shared/balance";
import { PRIMARY_STATS } from "@terra/shared/roster";

/** 기준 유닛 칸(1차는 글 입력이라 틀리면 null) */
export interface PresetForm {
  readonly primaries: BalancePrimaries | null;
  readonly weapon: string;
  readonly count: number;
  readonly runs: number;
  readonly limitSec: number;
}

/** 프리셋 값이 기준 유닛 칸과 같은가(이름은 보지 않는다) */
export function presetMatches(preset: BalancePresetValues, form: PresetForm): boolean {
  const { primaries } = form;
  if (primaries === null) return false;
  return (
    PRIMARY_STATS.every((stat) => preset.primaries[stat] === primaries[stat]) &&
    preset.weapon === form.weapon &&
    preset.count === form.count &&
    preset.runs === form.runs &&
    preset.limitSec === form.limitSec
  );
}

/** 이름 + 기준 유닛 칸 → 저장할 값(1차가 틀리면 null) */
export function presetValuesFrom(
  name: { readonly ko: string; readonly en: string },
  form: PresetForm,
): BalancePresetValues | null {
  if (form.primaries === null) return null;
  return {
    name: { ko: name.ko, en: name.en },
    primaries: form.primaries,
    weapon: form.weapon,
    count: form.count,
    runs: form.runs,
    limitSec: form.limitSec,
  };
}

/** 프리셋(화면 모양)에서 값 칸만(서버 입력은 모르는 칸을 받지 않는다) */
export function presetValuesOf(preset: BalancePresetValues): BalancePresetValues {
  return {
    name: { ko: preset.name.ko, en: preset.name.en },
    primaries: { ...preset.primaries },
    weapon: preset.weapon,
    count: preset.count,
    runs: preset.runs,
    limitSec: preset.limitSec,
  };
}

/** 이름 두 칸이 서버가 받을 모양인가 */
export function presetNameValid(name: { readonly ko: string; readonly en: string }): boolean {
  return normalizeBalancePresetName(name.ko) !== null && normalizeBalancePresetName(name.en) !== null;
}

/** 저장 뒤 새 목록에서 새로 생긴 프리셋 ID(없으면 null) */
export function addedPresetId(
  before: readonly BalancePresetView[],
  after: readonly BalancePresetView[],
): string | null {
  const known = new Set(before.map((preset) => preset.id));
  return after.find((preset) => !known.has(preset.id))?.id ?? null;
}

/** 지금 언어의 프리셋 이름 */
export const presetName = (preset: BalancePresetValues, locale: string): string =>
  locale === "en" ? preset.name.en : preset.name.ko;

/** 고르기 칸 목록: 정해 둔 값에 지금 값(프리셋이 다른 값을 가졌을 때)을 더해 작은 차례로 */
export function optionsWith(options: readonly number[], value: number): number[] {
  return options.includes(value) ? [...options] : [...options, value].toSorted((a, b) => a - b);
}
