// 이 세계의 NPC 국가에 반영 — 실효 국가 프리셋의 이름·약어·색·화폐 표시를 이미 정해진 세력 정체성(faction_profiles)·화폐 표시
// (currency_profiles)에 다시 넣는다. docs/adr/2026-11-10-nation-editor.md 6절, docs/adr/2026-11-09-faction-profiles.md "바뀜 (2026-11-10)".
// - 세력 정체성·화폐 표시는 처음 보일 때 한 번 정해지고 그 뒤 프리셋을 바꿔도 그대로다(ADR 2026-11-09 2절). 그래서 편집기에서 누르는
//   명시적 동작으로만 다시 넣는다. 먼저 미리 보기(dryRun)로 줄마다 무엇이 바뀌는지 보인다.
// - 대상: 자기 국가 프리셋이 있는 세력(세력 코드 = 프리셋 ID, 시험 NPC 세력 = 16번째 프리셋)과 프리셋 화폐(cur:<코드>).
// - 운영자가 손으로 고친 줄(source = 'admin')은 건너뛴다(skip_admin). 약어·티커가 다른 줄과 겹치면 그 줄은 건너뛴다(skip_taken),
//   프리셋 값이 규칙에 안 맞으면 건너뛴다(skip_invalid). 정체성 줄이 아직 없는 세력은 건드리지 않는다(처음 보일 때 지금 프리셋 값으로 정해진다).
// - 유닛·도시·잔고는 바꾸지 않는다(표 두 개의 표시 값만). 바꾼 줄마다 감사 기록(nation.apply_faction·nation.apply_currency).
import {
  CURRENCY_NAME_MAX,
  FACTION_NAME_MAX,
  isCurrencySymbol,
  isCurrencyTicker,
  isFactionColor,
  isFactionShort,
  isProfileName,
} from "@terra/shared/factionProfile";
import type {
  NationApplyAction,
  NationApplyCurrencyRow,
  NationApplyFactionRow,
  NationApplyRow,
} from "@terra/shared/nationEditor";
import { type NationPreset, presetOfCode } from "../npc/nations.ts";
import type { EmblemQueryable } from "./emblems.ts";

const clamp = (text: string, max: number): string => {
  const trimmed = text.trim().replaceAll(/\p{Cc}/gu, "");
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed;
};

interface FactionRow {
  id: string;
  code: string;
  name: string;
  short_name: string;
  color: string;
  source: string;
}

interface CurrencyRow {
  asset: string;
  name: string;
  symbol: string;
  ticker: string;
  source: string;
}

/** 반영 계획(읽기만): 줄마다 앞 값·뒤 값·할 일. 차례 = 세력 ID, 그다음 화폐 자산 */
export async function planNationApply(
  pool: EmblemQueryable,
  presets: readonly NationPreset[],
): Promise<NationApplyRow[]> {
  const factions = await pool.query<FactionRow>(
    `select f.id, f.code, p.name, p.short_name, p.color, p.source
       from factions f join faction_profiles p on p.faction_id = f.id
      where f.code is not null order by f.id`,
  );
  const allShorts = await pool.query<{ faction_id: string; short_name: string }>(
    "select faction_id, short_name from faction_profiles",
  );
  /** 약어(소문자) → 가진 세력. 차례로 바꿔 가며 겹침을 본다(실제 적용과 같은 차례) */
  const shortOwner = new Map(
    allShorts.rows.map((row) => [row.short_name.toLowerCase(), Number(row.faction_id)]),
  );
  const rows: NationApplyRow[] = [];
  for (const row of factions.rows) {
    const preset = presetOfCode(row.code, presets);
    if (!preset) continue;
    const factionId = Number(row.id);
    const before = { name: row.name, shortName: row.short_name, color: row.color };
    const after = {
      name: clamp(preset.name.ko, FACTION_NAME_MAX),
      shortName: preset.shortName ?? row.short_name,
      color: preset.color ?? row.color,
    };
    let action: NationApplyAction = "update";
    if (row.source === "admin") action = "skip_admin";
    else if (
      !isProfileName(after.name, FACTION_NAME_MAX) ||
      !isFactionShort(after.shortName) ||
      !isFactionColor(after.color)
    )
      action = "skip_invalid";
    else if (
      after.name === before.name &&
      after.shortName === before.shortName &&
      after.color === before.color
    )
      action = "same";
    else {
      const owner = shortOwner.get(after.shortName.toLowerCase());
      if (owner !== undefined && owner !== factionId) action = "skip_taken";
    }
    if (action === "update") {
      shortOwner.delete(before.shortName.toLowerCase());
      shortOwner.set(after.shortName.toLowerCase(), factionId);
    }
    rows.push({
      kind: "faction",
      factionId,
      preset: preset.code,
      before,
      after,
      action,
    } satisfies NationApplyFactionRow);
  }

  const currencies = await pool.query<CurrencyRow>(
    "select asset, name, symbol, ticker, source from currency_profiles order by asset",
  );
  const tickerOwner = new Map(currencies.rows.map((row) => [row.ticker, row.asset]));
  const byAsset = new Map(currencies.rows.map((row) => [row.asset, row]));
  for (const preset of presets) {
    if (!preset.currency) continue;
    const asset = `cur:${preset.currency.code}`;
    const row = byAsset.get(asset);
    if (!row) continue;
    const before = { name: row.name, symbol: row.symbol, ticker: row.ticker };
    const after = {
      name: clamp(preset.currency.name.ko, CURRENCY_NAME_MAX),
      symbol: preset.currency.symbol ?? row.symbol,
      ticker: preset.currency.ticker ?? row.ticker,
    };
    let action: NationApplyAction = "update";
    if (row.source === "admin") action = "skip_admin";
    else if (
      !isProfileName(after.name, CURRENCY_NAME_MAX) ||
      !isCurrencySymbol(after.symbol) ||
      !isCurrencyTicker(after.ticker)
    )
      action = "skip_invalid";
    else if (after.name === before.name && after.symbol === before.symbol && after.ticker === before.ticker)
      action = "same";
    else {
      const owner = tickerOwner.get(after.ticker);
      if (owner !== undefined && owner !== asset) action = "skip_taken";
    }
    if (action === "update") {
      tickerOwner.delete(before.ticker);
      tickerOwner.set(after.ticker, asset);
    }
    rows.push({
      kind: "currency",
      asset,
      preset: preset.code,
      before,
      after,
      action,
    } satisfies NationApplyCurrencyRow);
  }
  return rows;
}

/** pg 고유 제약 위반(23505) */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && Reflect.get(error, "code") === "23505";

/**
 * 계획의 update 줄을 차례로 쓴다(source = 'preset'로 — 손으로 고친 줄 표시는 운영자 콘솔이 다시 단다). 그새 다른 줄과 겹치게 됐으면
 * 그 줄만 skip_taken으로 바꿔 돌려준다. 쓴 줄마다 onWritten(감사 기록)
 */
export async function writeNationApply(
  pool: EmblemQueryable,
  plan: readonly NationApplyRow[],
  input: { actorId: string; nowMs: number; onWritten: (row: NationApplyRow) => Promise<void> },
): Promise<NationApplyRow[]> {
  const out: NationApplyRow[] = [];
  for (const row of plan) {
    if (row.action !== "update") {
      out.push(row);
      continue;
    }
    try {
      // 그새 운영자가 고친 줄은 건드리지 않는다(source <> 'admin')
      const result =
        row.kind === "faction"
          ? await pool.query<{ ok: number }>(
              `update faction_profiles set name = $2, short_name = $3, color = $4, source = 'preset',
                 updated_at_ms = $5, updated_by = $6 where faction_id = $1 and source <> 'admin' returning 1 as ok`,
              [
                row.factionId,
                row.after.name,
                row.after.shortName,
                row.after.color,
                input.nowMs,
                input.actorId,
              ],
            )
          : await pool.query<{ ok: number }>(
              `update currency_profiles set name = $2, symbol = $3, ticker = $4, source = 'preset',
                 updated_at_ms = $5, updated_by = $6 where asset = $1 and source <> 'admin' returning 1 as ok`,
              [row.asset, row.after.name, row.after.symbol, row.after.ticker, input.nowMs, input.actorId],
            );
      if (result.rows.length === 0) {
        out.push({ ...row, action: "skip_admin" });
        continue;
      }
      await input.onWritten(row);
      out.push(row);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      out.push({ ...row, action: "skip_taken" });
    }
  }
  return out;
}
