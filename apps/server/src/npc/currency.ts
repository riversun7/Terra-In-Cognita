// NPC 나라 화폐(서버) — docs/adr/2026-11-07-play-flow.md "WP6 나라 화폐·체결 알림", 경제 코어 ADR 2026-10-31-economy-core.md 6절, 기획 D-131·D-411.
// 시뮬 createEconomy의 화폐 차리기(나라마다 국가 프리셋 화폐, 반란 세력은 부모 화폐, 처음 발행 E6)를 서버 세계에 맞게 둔다:
// - 나라 = 그 세력 코드의 국가 프리셋(시험 NPC 세력은 16번째 프리셋 — 화면 이름과 같은 규칙, npc/nations.ts nationName. 프리셋 없이 만든
//   npc_nation_NN은 nationCode가 그 자리에 둘 프리셋 = NN−1번째). 프리셋이 없는 세력은
//   반란 부모 → 종주 → 태어날 때 부모(기획 답 620 나)를 따라 올라간 나라의 화폐·세율을 쓴다(시뮬 factionBorn과 같다). 그래도 없으면 기준 통화·DEFAULT_TAX_BP.
// - 화폐를 찍는 곳 = 자기 프리셋을 가진 고정 나라(D-131, 시작 도시를 잃지 않는다 D-341). 반란·마을 세력은 찍지 않는다.
// - 기축 통화(환전 짝의 기준, 경제 base) = 첫 고정 나라(가장 작은 ID, 자기 프리셋·살아 있음)의 화폐 — 시뮬과 같다(사용자 결정 2026-11-23
//   "공용시험화폐 그냥 없애라", docs/adr/2026-11-23-nation-money.md. 옛 [임시] 서버 시험 화폐 s3_test_credit을 대신한다). 서버 돈(지갑·정착 지원금·
//   임금·신전·구인)은 주체마다 소속 국가 화폐다(world/money.ts). 고정 나라의 처음 국고(NPC_START_CREDIT × 등급)는 자기 화폐로 받고, 기축 나라가
//   아니면 그 START_RESERVE_BP 몫을 기축 통화로 더 받는다(환전 시장 조성의 사는 쪽 밑천 — 시뮬 baseReserveBp 자리).
// - 처음 발행(E6) = 인구 × 1인당 하루 거래액 × 7, 나라마다 한 번(원장 중복 방지 키 npc_mint:<화폐>). 인구 = 그 나라 휴먼 수와 시작 도시 주거 합 중
//   큰 쪽 [임시](봇이 없는 세계에서도 화폐가 생기게, 질문 561).
import {
  type CatalogPreset,
  type LedgerBook,
  type PreparedCatalog,
  type SimFaction,
  type SimWorld,
  currencyAsset,
  initialMint,
  TEST_ASSET_CREDIT,
} from "@terra/sim";
import { TEST_NPC_FACTION_CODE } from "../world/unitKinds.ts";
import { MAX_TEST_NATIONS, NATION_CODE_PREFIX } from "./nations.ts";

/** [임시] 국가 프리셋이 없는 세력의 거래세(만분율, 팩 프리셋 값과 같다) */
export const DEFAULT_TAX_BP = 200;
/** 처음 발행 중복 방지 키 앞머리 */
export const MINT_KEY = "npc_mint:";
/** 고정 나라 처음 국고 중복 방지 키 앞머리(npc_start:<세력 ID>) */
export const START_KEY = "npc_start:";
/** [임시] 기축 나라가 아닌 고정 나라가 처음 국고에 더 받는 기축 통화 몫(만분율, 환전 시장 조성의 사는 쪽 밑천) */
export const START_RESERVE_BP = 1000n;

/** 그 세력 코드 자체의 국가 프리셋(시험 NPC 세력 = 16번째 프리셋, 화면 이름과 같은 규칙). 없으면 undefined */
export function ownPresetOf(faction: SimFaction, catalog: PreparedCatalog): CatalogPreset | undefined {
  if (faction.code === TEST_NPC_FACTION_CODE) return catalog.presets[MAX_TEST_NATIONS - 1];
  if (faction.code.startsWith(NATION_CODE_PREFIX)) {
    // 프리셋 없이 만든 n번째 국가(nationCode) = 프리셋 n−2번 자리
    const n = Number(faction.code.slice(NATION_CODE_PREFIX.length));
    return Number.isInteger(n) && n >= 2 ? catalog.presets[n - 2] : undefined;
  }
  return catalog.presets.find((entry) => entry.id === faction.code);
}

/** 세력이 쓰는 나라 프리셋: 자기 것 → 반란 부모·종주를 따라 올라간 것 */
export function presetOfFaction(
  world: SimWorld,
  faction: SimFaction,
  catalog: PreparedCatalog,
  seen = new Set<number>(),
): CatalogPreset | undefined {
  const own = ownPresetOf(faction, catalog);
  if (own) return own;
  seen.add(faction.id);
  for (const parentId of [faction.rebelOf, faction.overlord, faction.bornOf]) {
    const parent = parentId === null ? undefined : world.factions.get(parentId);
    if (parent && !seen.has(parent.id)) return presetOfFaction(world, parent, catalog, seen);
  }
  return undefined;
}

export interface NationCurrencies {
  /** 기축 통화(환전 짝의 기준 = 첫 고정 나라 화폐). 나라가 없으면 fallback */
  readonly base: string;
  /** 세력 → 화폐(원장 자산 코드) */
  readonly currencyOf: Map<number, string>;
  /** 세력 → 거래세(만분율) */
  readonly taxOf: Map<number, number>;
  /** 화폐 → 찍는 나라(고정 나라, 화폐 차례 = 세력 ID 차례) */
  readonly issuer: Map<string, number>;
}

/** 기축 통화: 첫 고정 나라(가장 작은 ID, 자기 프리셋·살아 있음)의 화폐. 그런 나라가 없으면 fallback(나라 없는 세계의 돈) */
export function hubCurrency(world: SimWorld, catalog: PreparedCatalog, fallback: string): string {
  for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
    const own = ownPresetOf(faction, catalog);
    if (own && faction.fixed && faction.alive) return currencyAsset(own.currency);
  }
  return fallback;
}

/** 세계의 세력마다 화폐·세율, 화폐마다 찍는 나라(기축 통화를 찍는 나라도 든다). fallback = 나라 없는 세계의 돈 */
export function nationCurrencies(
  world: SimWorld,
  catalog: PreparedCatalog,
  fallback: string,
): NationCurrencies {
  const base = hubCurrency(world, catalog, fallback);
  const currencyOf = new Map<number, string>();
  const taxOf = new Map<number, number>();
  const issuer = new Map<string, number>();
  for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
    const preset = presetOfFaction(world, faction, catalog);
    const currency = preset ? currencyAsset(preset.currency) : base;
    currencyOf.set(faction.id, currency);
    taxOf.set(faction.id, preset?.tradeTaxBp ?? DEFAULT_TAX_BP);
    const own = ownPresetOf(faction, catalog);
    if (own && faction.fixed && faction.alive && !issuer.has(currency)) issuer.set(currency, faction.id);
  }
  return { base, currencyOf, taxOf, issuer };
}

/**
 * 처음 발행(E6): 아직 찍지 않은 화폐마다 찍는 나라 국고로 인구 × 1인당 하루 거래액 × 7을 낸다(원장 issue, 중복 방지 키 npc_mint:<화폐>).
 * minted = 이미 쓴 키(부팅 때 원장에서 읽음). 찍은 양(화폐 → 양)을 돌려준다
 */
export function mintNationCurrencies(o: {
  readonly world: SimWorld;
  readonly book: LedgerBook;
  readonly issuer: ReadonlyMap<string, number>;
  readonly minted: Set<string>;
  readonly perCapitaDaily: bigint;
  readonly atMs: number;
}): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const [currency, factionId] of o.issuer) {
    const key = `${MINT_KEY}${currency}`;
    const faction = o.world.factions.get(factionId);
    if (o.minted.has(key) || !faction) continue;
    let housing = 0;
    for (const cityId of faction.cities) housing += o.world.cities.get(cityId)?.housing ?? 0;
    const amount = initialMint(Math.max(faction.units.size, housing), o.perCapitaDaily);
    o.minted.add(key);
    if (amount <= 0n) continue;
    o.book.post({
      kind: "issue",
      atMs: o.atMs,
      key,
      entries: [
        { account: o.book.systemAccount(`issue:${currency}`, currency), amount: -amount },
        { account: o.book.ownerAccount(factionId, currency), amount },
      ],
    });
    out.set(currency, amount);
  }
  return out;
}

/**
 * 고정 나라의 처음 국고: 아직 받지 않은 나라마다 자기 화폐로 amountOf(세력)을 낸다(원장 issue, 중복 방지 키 npc_start:<세력 ID>).
 * 기축 나라가 아니면 그 START_RESERVE_BP 몫을 기축 통화로 더 낸다. started = 이미 쓴 키(부팅 때 원장에서 읽음)
 */
export function issueStartTreasuries(o: {
  readonly world: SimWorld;
  readonly book: LedgerBook;
  readonly currencies: NationCurrencies;
  readonly started: Set<string>;
  readonly amountOf: (faction: SimFaction) => bigint;
  readonly atMs: number;
}): void {
  const { base, currencyOf } = o.currencies;
  for (const faction of [...o.world.factions.values()].toSorted((a, b) => a.id - b.id)) {
    const key = `${START_KEY}${faction.id}`;
    if (!faction.fixed || o.started.has(key)) continue;
    const currency = currencyOf.get(faction.id) ?? base;
    const amount = o.amountOf(faction);
    o.started.add(key);
    if (amount <= 0n) continue;
    const entries = [
      { account: o.book.systemAccount(`issue:${currency}`, currency), amount: -amount },
      { account: o.book.ownerAccount(faction.id, currency), amount },
    ];
    const reserve = currency === base ? 0n : (amount * START_RESERVE_BP) / 10_000n;
    if (reserve > 0n)
      entries.push(
        { account: o.book.systemAccount(`issue:${base}`, base), amount: -reserve },
        { account: o.book.ownerAccount(faction.id, base), amount: reserve },
      );
    o.book.post({ kind: "issue", atMs: o.atMs, key, entries });
  }
}

/** 옛 공용 시험 화폐를 없앨 때 두는 시스템 계정: 나온 곳·사라진 곳(장부 기록)과 에스크로(걸린 주문·계약의 불변 조건 M1·M2에 묶인다) */
const KEPT_COMMON_MONEY = ["issue:", "sink:", "escrow"];

/**
 * 옛 공용 시험 화폐 없애기(사용자 지시 2026-11-24 "공용화폐가 왜 남아있냐 없애라니까"): 나라 화폐가 도는 세계에서 켤 때 한 번, 주체(사람·세력)
 * 지갑과 시스템 계정(가문 금고·사업장 금고·운영비 금고 등)에 남은 옛 공용 시험 화폐를 모두 소각 계정으로 보낸다(멱등 — 보낸 뒤 잔고 0). 나라 화폐로 바꿔 주지 않는다(시험 중, 고정 나라는 자기 화폐로
 * 처음 국고를 따로 받는다). 에스크로는 걸린 주문·계약에 묶여 있어 두고, 풀려 지갑으로 돌아오면 다음에 켤 때 없앤다. 없앤 계정 수
 */
export function retireCommonMoney(
  book: LedgerBook,
  atMs: number,
  log: { info(obj: object, message: string): void },
): number {
  const stale = [...book.accounts()].filter(
    (account) =>
      account.asset === TEST_ASSET_CREDIT &&
      account.balance > 0n &&
      !KEPT_COMMON_MONEY.some((prefix) => account.systemCode?.startsWith(prefix)),
  );
  if (stale.length === 0) return 0;
  const sink = book.systemAccount(`sink:${TEST_ASSET_CREDIT}`, TEST_ASSET_CREDIT);
  let total = 0n;
  for (const account of stale) {
    const amount = account.balance;
    total += amount;
    book.post({
      kind: "retire_common_money",
      atMs,
      entries: [
        { account: account.id, amount: -amount },
        { account: sink, amount },
      ],
    });
  }
  log.info({ commonMoneyRetired: stale.length, amount: total.toString() }, "old common test money retired");
  return stale.length;
}
