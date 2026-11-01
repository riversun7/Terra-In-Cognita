// 밸런스 화면 기준 유닛 프리셋 고르기(순수 함수) — docs/adr/2026-11-01-balance-screen.md "바뀜 (D-467)", 기획 D-467 228 다.
// 목록 = 팩 씨앗(balance_presets, 팩 차례) 위에 DB 줄(화면에서 고친 것·만든 것)을 얹는다. D1(설정 칸 덮어쓰기)과 같은 뜻으로 고른다.
// - 팩 프리셋 ID의 줄: 저장 때의 팩 항목(packEntry) = 지금 팩 항목이면 그 줄 값("고침"), 다르면 팩이 더 나중이라 팩이 이긴다(pack_won).
//   팩에서 빠진 ID의 줄도 팩이 이긴다(팩에서 지운 것이 더 나중).
// - 화면에서 만든 줄(ID dev_ + 16진 12자, packEntry null): 값이 맞으면 목록 뒤에 만든 차례로.
// - 값이 지금 규칙에 맞지 않는 줄(모양이 틀림·상한 밖·모르는 무기)은 쓰지 않는다(dropped). 읽을 때마다 고르므로 켤 때 정리가 실패해도
//   같은 목록이 나온다. 던지지 않는다.
import { randomBytes } from "node:crypto";
import { type BalancePresetEntry, sortKeys } from "@terra/content";
import {
  BALANCE_CUSTOM_PRESET_ID,
  BALANCE_UNARMED,
  type BalancePresetValues,
  type BalancePresetView,
  balancePresetProblem,
  normalizeBalancePresetName,
} from "@terra/shared/balance";
import { PRIMARY_STATS } from "@terra/shared/roster";

/** 팩 balance_presets 항목(@terra/content BalancePresetEntry와 같은 모양, 무기는 참조) */
export type PackPresetEntry = Pick<
  BalancePresetEntry,
  "id" | "name" | "primaries" | "count" | "runs" | "limitSec"
> & {
  readonly weapon?: { readonly id: string } | undefined;
};

/** 팩 프리셋 하나(무기 없음 = 맨손으로 읽은 값) */
export interface PackPreset {
  readonly id: string;
  readonly values: BalancePresetValues;
}

/** DB 줄 하나(balance_presets). data·packEntry는 jsonb라 읽을 때 모양을 다시 본다 */
export interface PresetRecord {
  readonly id: string;
  readonly data: unknown;
  /** 저장 때의 팩 항목(그 ID가 팩에 없었으면 null) */
  readonly packEntry: unknown;
  readonly contentVersion: string;
  readonly version: number;
  readonly updatedById: string | null;
  readonly updatedByName: string | null;
  readonly updatedAtMs: number;
  readonly createdAtMs: number;
}

export type PresetDropReason = "invalid" | "unknown_weapon";

export interface PresetResolution {
  readonly list: BalancePresetView[];
  /** 목록에 든 줄 */
  readonly kept: PresetRecord[];
  /** 팩이 더 나중이라 쓰지 않는 줄 */
  readonly packWon: PresetRecord[];
  /** 지금 규칙에 맞지 않아 쓰지 않는 줄 */
  readonly dropped: { readonly row: PresetRecord; readonly reason: PresetDropReason }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** jsonb 값 → 프리셋 값(모양만 본다: 이름 글자·정수 칸). 틀리면 null. 범위는 balancePresetProblem이 본다 */
export function presetValuesOf(raw: unknown): BalancePresetValues | null {
  if (!isRecord(raw) || !isRecord(raw.name) || !isRecord(raw.primaries)) return null;
  const { ko, en } = raw.name;
  if (typeof ko !== "string" || typeof en !== "string" || typeof raw.weapon !== "string") return null;
  const source = raw.primaries;
  const primaries: Record<string, number> = {};
  for (const stat of PRIMARY_STATS) {
    const value = source[stat];
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    primaries[stat] = value;
  }
  if (Object.keys(source).length !== PRIMARY_STATS.length) return null;
  const { count, runs, limitSec } = raw;
  if (typeof count !== "number" || typeof runs !== "number" || typeof limitSec !== "number") return null;
  const { str = 0, vit = 0, int = 0, wis = 0, dex = 0, agi = 0 } = primaries;
  return {
    name: { ko, en },
    primaries: { str, vit, int, wis, dex, agi },
    weapon: raw.weapon,
    count,
    runs,
    limitSec,
  };
}

/** 값의 정규 글(키 차례·jsonb 왕복과 상관없이 같은 값이면 같은 글). null은 "null" */
export function presetJson(values: unknown): string {
  const parsed = values === null || values === undefined ? null : presetValuesOf(values);
  if (parsed === null)
    return values === null || values === undefined ? "null" : JSON.stringify(sortKeys(values));
  const ko = normalizeBalancePresetName(parsed.name.ko) ?? parsed.name.ko;
  const en = normalizeBalancePresetName(parsed.name.en) ?? parsed.name.en;
  return JSON.stringify(sortKeys({ ...parsed, name: { ko, en } }));
}

/** 줄 값이 지금 규칙에 맞는가(모양·이름·범위·무기). 맞으면 null */
function rowProblem(
  data: unknown,
  weapons: ReadonlySet<string>,
): { values: BalancePresetValues } | PresetDropReason {
  const values = presetValuesOf(data);
  if (values === null || balancePresetProblem(values) !== null) return "invalid";
  if (!weapons.has(values.weapon)) return "unknown_weapon";
  return { values };
}

function viewOf(
  id: string,
  values: BalancePresetValues,
  source: BalancePresetView["source"],
  row: PresetRecord | null,
): BalancePresetView {
  return {
    id,
    ...values,
    source,
    version: row?.version ?? 0,
    updatedBy: row ? row.updatedByName : null,
    updatedAt: row ? row.updatedAtMs : null,
  };
}

/** 팩 씨앗과 DB 줄을 겹쳐 목록을 고른다(위 머리 주석의 규칙) */
export function resolvePresets(
  pack: readonly PackPreset[],
  rows: readonly PresetRecord[],
  weapons: ReadonlySet<string>,
): PresetResolution {
  const packById = new Map(pack.map((preset) => [preset.id, preset]));
  const kept: PresetRecord[] = [];
  const packWon: PresetRecord[] = [];
  const dropped: { row: PresetRecord; reason: PresetDropReason }[] = [];
  const edited = new Map<string, { row: PresetRecord; values: BalancePresetValues }>();
  const custom: { row: PresetRecord; values: BalancePresetValues }[] = [];
  for (const row of rows) {
    const packPreset = packById.get(row.id);
    const isCustom = BALANCE_CUSTOM_PRESET_ID.test(row.id);
    if (packPreset ? presetJson(row.packEntry) !== presetJson(packPreset.values) : row.packEntry !== null) {
      packWon.push(row);
      continue;
    }
    const checked = rowProblem(row.data, weapons);
    if (typeof checked === "string" || (!packPreset && !isCustom)) {
      dropped.push({ row, reason: typeof checked === "string" ? checked : "invalid" });
      continue;
    }
    kept.push(row);
    if (packPreset) edited.set(row.id, { row, values: checked.values });
    else custom.push({ row, values: checked.values });
  }
  const list = [
    ...pack.map((preset) => {
      const hit = edited.get(preset.id);
      return hit
        ? viewOf(preset.id, hit.values, "edited", hit.row)
        : viewOf(preset.id, preset.values, "pack", null);
    }),
    ...custom
      .toSorted((a, b) => a.row.createdAtMs - b.row.createdAtMs || (a.row.id < b.row.id ? -1 : 1))
      .map(({ row, values }) => viewOf(row.id, values, "custom", row)),
  ];
  return { list, kept, packWon, dropped };
}

/**
 * 팩 balance_presets 항목 → 프리셋 값(무기 없음 = 맨손). 무기 사양이 없는 아이템을 가리키는 프리셋은 빼고 skipped로 알린다
 * (팩 검사는 아이템이 있는지만 본다. 시작을 막지 않는다)
 */
export function packPresetsOf(
  entries: readonly PackPresetEntry[],
  weapons: ReadonlySet<string>,
): { presets: PackPreset[]; skipped: { id: string; reason: PresetDropReason }[] } {
  const presets: PackPreset[] = [];
  const skipped: { id: string; reason: PresetDropReason }[] = [];
  for (const entry of entries) {
    const weapon = entry.weapon?.id ?? BALANCE_UNARMED;
    if (!weapons.has(weapon)) {
      skipped.push({ id: entry.id, reason: "unknown_weapon" });
      continue;
    }
    presets.push({
      id: entry.id,
      values: {
        name: { ko: entry.name.ko, en: entry.name.en },
        primaries: { ...entry.primaries },
        weapon,
        count: entry.count,
        runs: entry.runs,
        limitSec: entry.limitSec,
      },
    });
  }
  return { presets, skipped };
}

/** 화면에서 만든 프리셋 ID: dev_ + 16진 12자(6바이트 난수) */
export function newCustomPresetId(): string {
  return `dev_${randomBytes(6).toString("hex")}`;
}
