// 세력 정체성·화폐 표시(docs/adr/2026-11-09-faction-profiles.md) — 표 faction_profiles·currency_profiles.
// 사용자 결정(2026-11-09): "세력 생성시 결정하고 npc나 일부는 프리셋이나 기본값 제공, 관리자가 수정도 가능".
// - 정하기(ensureProfiles): 줄이 없는 세력·화폐를 한 번 채운다. 고정 NPC 나라(자기 팩 국가 프리셋이 있는 세력) = 프리셋 값, 그 밖(반란·새 마을·
//   유저 세력) = 기본값(이름 "<따르는 나라> #ID", 약어 "F<ID 36진수>", 색 = 기본 색 표). 한 번 쓴 값은 다시 정하지 않는다(on conflict do nothing).
//   서버가 켤 때와 운영자 콘솔이 세력·화폐 목록을 읽을 때 부른다(세력이 생긴 뒤 처음 보일 때 정해지는 것 — 기본값은 세력 ID·프리셋으로만 정해져
//   언제 정하든 같다).
// - 화폐: 세력이 쓰는 화폐 = 자기 프리셋 → 반란 부모 → 종주 → 태어날 때 부모를 따라 올라간 나라 프리셋 화폐(npc/currency.ts presetOfFaction과 같은
//   차례), 없으면 기준 통화. 원장 자산 코드 = "cur:<화폐 코드>".
// - 약어·티커가 겹치면(프리셋 값 겹침 등) 처음 정할 때 겹치지 않는 기본값으로 바꾼다. 관리자 수정은 겹치면 거절한다(*_taken).
import {
  CURRENCY_NAME_MAX,
  FACTION_NAME_MAX,
  defaultFactionColor,
  isCurrencySymbol,
  isCurrencyTicker,
  isFactionColor,
  isFactionShort,
  isProfileName,
} from "@terra/shared/factionProfile";
import { type NationPreset, nationName, presetOfCode } from "../npc/nations.ts";
import type { OpsQueryable } from "./access.ts";

export type ProfileSource = "preset" | "default" | "admin" | "player";

export interface FactionProfile {
  factionId: number;
  name: string;
  shortName: string;
  color: string;
  source: ProfileSource;
}

export interface CurrencyProfile {
  asset: string;
  name: string;
  symbol: string;
  ticker: string;
  source: ProfileSource;
}

export interface ProfileDeps {
  pool: OpsQueryable;
  presets: readonly NationPreset[];
  /** 기준 통화 원장 자산(서버 시험 화폐) */
  baseAsset: string;
  now: () => number;
}

interface FactionLink {
  id: number;
  code: string | null;
  rebelOf: number | null;
  parentId: number | null;
  bornOf: number | null;
}

const assetOfPreset = (preset: NationPreset): string | undefined =>
  preset.currency ? `cur:${preset.currency.code}` : undefined;

const num = (value: string | null): number | null => (value === null ? null : Number(value));

async function factionLinks(pool: OpsQueryable): Promise<Map<number, FactionLink>> {
  const { rows } = await pool.query<{
    id: string;
    code: string | null;
    rebel_of: string | null;
    parent_id: string | null;
    born_of: string | null;
  }>("select id, code, rebel_of, parent_id, born_of from factions order by id");
  return new Map(
    rows.map((row) => [
      Number(row.id),
      {
        id: Number(row.id),
        code: row.code,
        rebelOf: num(row.rebel_of),
        parentId: num(row.parent_id),
        bornOf: num(row.born_of),
      },
    ]),
  );
}

/** 세력이 따르는 나라 프리셋(자기 것 → 반란 부모 → 종주 → 태어날 때 부모) */
export function followedPreset(
  links: ReadonlyMap<number, FactionLink>,
  presets: readonly NationPreset[],
  factionId: number,
  seen = new Set<number>(),
): NationPreset | undefined {
  const link = links.get(factionId);
  if (!link || seen.has(factionId)) return undefined;
  seen.add(factionId);
  const own = link.code === null ? undefined : presetOfCode(link.code, presets);
  if (own) return own;
  for (const parent of [link.rebelOf, link.parentId, link.bornOf])
    if (parent !== null) {
      const found = followedPreset(links, presets, parent, seen);
      if (found) return found;
    }
  return undefined;
}

/** 세력마다 쓰는 화폐(원장 자산) */
export async function currencyOfFactions(deps: ProfileDeps): Promise<Map<number, string>> {
  const links = await factionLinks(deps.pool);
  const result = new Map<number, string>();
  for (const id of links.keys()) {
    const preset = followedPreset(links, deps.presets, id);
    result.set(id, (preset && assetOfPreset(preset)) ?? deps.baseAsset);
  }
  return result;
}

/** 겹치지 않는 3글자 티커: 코드의 영어 글자 → 같은 첫 글자 + 차례 → AAA부터 */
export function uniqueTicker(seed: string, taken: ReadonlySet<string>): string {
  const letters = seed.toUpperCase().replaceAll(/[^A-Z]/g, "");
  const first = letters[0] ?? "X";
  const candidates = [letters.slice(0, 3), `${first}${letters.at(-2) ?? "X"}${letters.at(-1) ?? "X"}`];
  for (const candidate of candidates)
    if (isCurrencyTicker(candidate) && !taken.has(candidate)) return candidate;
  const A = 65;
  for (let i = 0; i < 26 * 26; i += 1) {
    const candidate = `${first}${String.fromCharCode(A + Math.floor(i / 26))}${String.fromCharCode(A + (i % 26))}`;
    if (!taken.has(candidate)) return candidate;
  }
  for (let i = 0; i < 26 * 26 * 26; i += 1) {
    const candidate = String.fromCharCode(
      A + Math.floor(i / 676),
      A + (Math.floor(i / 26) % 26),
      A + (i % 26),
    );
    if (!taken.has(candidate)) return candidate;
  }
  return "XXX";
}

/** 겹치지 않는 세력 약어: "F" + ID 36진수(대문자), 겹치면 뒤에 글자를 붙인다 */
export function uniqueShort(factionId: number, taken: ReadonlySet<string>): string {
  const base = `F${factionId.toString(36).toUpperCase()}`.slice(0, 5);
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 0; i < 36; i += 1) {
    const candidate = `${base.slice(0, 4)}${i.toString(36).toUpperCase()}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `F${(factionId % 46_656).toString(36).toUpperCase()}`;
}

const clampName = (text: string, max: number): string => {
  const trimmed = text.trim().replaceAll(/\p{Cc}/gu, "");
  return (trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed) || "?";
};

/** 줄이 없는 세력·화폐의 정체성을 한 번 정한다(멱등). 새로 정한 수 */
export async function ensureProfiles(deps: ProfileDeps): Promise<{ factions: number; currencies: number }> {
  const { pool, presets } = deps;
  const nowMs = deps.now();
  const links = await factionLinks(pool);
  const have = await pool.query<{ faction_id: string; short_name: string }>(
    "select faction_id, short_name from faction_profiles",
  );
  const haveFaction = new Set(have.rows.map((row) => Number(row.faction_id)));
  const shorts = new Set(have.rows.map((row) => row.short_name.toLowerCase()));
  let addedFactions = 0;
  for (const link of links.values()) {
    if (haveFaction.has(link.id)) continue;
    const own = link.code === null ? undefined : presetOfCode(link.code, presets);
    const followed = followedPreset(links, presets, link.id);
    const label = link.code === null ? undefined : nationName(link.code, presets)?.ko;
    const name = clampName(
      own?.name.ko ?? label ?? `${followed?.name.ko ?? "세력"} #${link.id}`,
      FACTION_NAME_MAX,
    );
    const presetShort = own?.shortName;
    const shortName =
      presetShort && isFactionShort(presetShort) && !shorts.has(presetShort.toLowerCase())
        ? presetShort
        : uniqueShort(link.id, shorts);
    const color = own?.color && isFactionColor(own.color) ? own.color : defaultFactionColor(link.id);
    const { rows } = await pool.query<{ faction_id: string }>(
      `insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms)
       values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning faction_id`,
      [link.id, name, shortName, color, own ? "preset" : "default", nowMs],
    );
    if (rows.length > 0) {
      shorts.add(shortName.toLowerCase());
      addedFactions += 1;
    }
  }

  // 화폐: 기준 통화 + 프리셋 화폐(팩 차례)
  const haveCurrency = await pool.query<{ asset: string; ticker: string }>(
    "select asset, ticker from currency_profiles",
  );
  const haveAsset = new Set(haveCurrency.rows.map((row) => row.asset));
  const tickers = new Set(haveCurrency.rows.map((row) => row.ticker));
  const wanted: {
    asset: string;
    name: string;
    symbol?: string | undefined;
    ticker?: string | undefined;
    source: ProfileSource;
  }[] = deps.baseAsset.startsWith("cur:")
    ? [] // 기축 통화가 나라 화폐면 그 프리셋 줄이 이름을 정한다(docs/adr/2026-11-23-nation-money.md)
    : [{ asset: deps.baseAsset, name: "공용 화폐", symbol: "¤", ticker: "CRD", source: "default" }];
  for (const preset of presets) {
    const asset = assetOfPreset(preset);
    if (!preset.currency || !asset) continue;
    wanted.push({
      asset,
      name: preset.currency.name.ko,
      symbol: preset.currency.symbol,
      ticker: preset.currency.ticker,
      source: "preset",
    });
  }
  let addedCurrencies = 0;
  for (const want of wanted) {
    if (haveAsset.has(want.asset)) continue;
    const name = clampName(want.name, CURRENCY_NAME_MAX);
    // 기호가 없으면 이름의 첫 글자(합쳐진 글자 하나로 센다)
    const firstLetter = new Intl.Segmenter().segment(name)[Symbol.iterator]().next().value?.segment;
    const symbol =
      want.symbol && isCurrencySymbol(want.symbol)
        ? want.symbol
        : firstLetter && isCurrencySymbol(firstLetter)
          ? firstLetter
          : "¤";
    const ticker =
      want.ticker && isCurrencyTicker(want.ticker) && !tickers.has(want.ticker)
        ? want.ticker
        : uniqueTicker(want.asset.replace(/^cur:/, ""), tickers);
    const { rows } = await pool.query<{ asset: string }>(
      `insert into currency_profiles (asset, name, symbol, ticker, source, updated_at_ms)
       values ($1, $2, $3, $4, $5, $6) on conflict do nothing returning asset`,
      [want.asset, name, symbol, ticker, want.source, nowMs],
    );
    if (rows.length > 0) {
      haveAsset.add(want.asset);
      tickers.add(ticker);
      addedCurrencies += 1;
    }
  }
  return { factions: addedFactions, currencies: addedCurrencies };
}

export async function factionProfiles(pool: OpsQueryable): Promise<Map<number, FactionProfile>> {
  const { rows } = await pool.query<{
    faction_id: string;
    name: string;
    short_name: string;
    color: string;
    source: ProfileSource;
  }>("select faction_id, name, short_name, color, source from faction_profiles");
  return new Map(
    rows.map((row) => [
      Number(row.faction_id),
      {
        factionId: Number(row.faction_id),
        name: row.name,
        shortName: row.short_name,
        color: row.color,
        source: row.source,
      },
    ]),
  );
}

export async function currencyProfiles(pool: OpsQueryable): Promise<Map<string, CurrencyProfile>> {
  const { rows } = await pool.query<CurrencyProfile>(
    "select asset, name, symbol, ticker, source from currency_profiles order by asset",
  );
  return new Map(rows.map((row) => [row.asset, { ...row }]));
}

/** pg 고유 제약 위반(23505) */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && Reflect.get(error, "code") === "23505";

export type FactionProfileUpdate =
  | { ok: true; before: FactionProfile; after: FactionProfile }
  | { ok: false; code: "not_found" | "invalid" | "short_taken" | "player_owned" };

export async function updateFactionProfile(
  pool: OpsQueryable,
  input: {
    factionId: number;
    name: string;
    shortName: string;
    color: string;
    actorId: string;
    nowMs: number;
  },
): Promise<FactionProfileUpdate> {
  if (
    !isProfileName(input.name, FACTION_NAME_MAX) ||
    !isFactionShort(input.shortName) ||
    !isFactionColor(input.color)
  )
    return { ok: false, code: "invalid" };
  const before = (await factionProfiles(pool)).get(input.factionId);
  if (!before) return { ok: false, code: "not_found" };
  // 가문 정체성은 그 플레이어가 정한다(faction_identities와 같이 바뀐다). 운영자는 마크 관리에서 다룬다 — 이름 고치기는 다음 줄기(질문 929 다)
  if (before.source === "player") return { ok: false, code: "player_owned" };
  try {
    await pool.query(
      `update faction_profiles set name = $2, short_name = $3, color = $4, source = 'admin', updated_at_ms = $5,
         updated_by = $6 where faction_id = $1`,
      [input.factionId, input.name, input.shortName, input.color, input.nowMs, input.actorId],
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "short_taken" };
    throw error;
  }
  return {
    ok: true,
    before,
    after: {
      factionId: input.factionId,
      name: input.name,
      shortName: input.shortName,
      color: input.color,
      source: "admin",
    },
  };
}

export type CurrencyProfileUpdate =
  | { ok: true; before: CurrencyProfile; after: CurrencyProfile }
  | { ok: false; code: "not_found" | "invalid" | "ticker_taken" };

export async function updateCurrencyProfile(
  pool: OpsQueryable,
  input: { asset: string; name: string; symbol: string; ticker: string; actorId: string; nowMs: number },
): Promise<CurrencyProfileUpdate> {
  if (
    !isProfileName(input.name, CURRENCY_NAME_MAX) ||
    !isCurrencySymbol(input.symbol) ||
    !isCurrencyTicker(input.ticker)
  )
    return { ok: false, code: "invalid" };
  const before = (await currencyProfiles(pool)).get(input.asset);
  if (!before) return { ok: false, code: "not_found" };
  try {
    await pool.query(
      `update currency_profiles set name = $2, symbol = $3, ticker = $4, source = 'admin', updated_at_ms = $5,
         updated_by = $6 where asset = $1`,
      [input.asset, input.name, input.symbol, input.ticker, input.nowMs, input.actorId],
    );
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "ticker_taken" };
    throw error;
  }
  return {
    ok: true,
    before,
    after: {
      asset: input.asset,
      name: input.name,
      symbol: input.symbol,
      ticker: input.ticker,
      source: "admin",
    },
  };
}
