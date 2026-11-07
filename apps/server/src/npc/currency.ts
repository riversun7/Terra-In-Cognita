// NPC 나라 화폐(서버) — docs/adr/2026-11-07-play-flow.md "WP6 나라 화폐·체결 알림", 경제 코어 ADR 2026-10-31-economy-core.md 6절, 기획 D-131·D-411.
// 시뮬 createEconomy의 화폐 차리기(나라마다 국가 프리셋 화폐, 반란 세력은 부모 화폐, 처음 발행 E6)를 서버 세계에 맞게 둔다:
// - 나라 = 그 세력 코드의 국가 프리셋(시험 NPC 세력은 16번째 프리셋 — 화면 이름과 같은 규칙, npc/nations.ts nationName. 프리셋 없이 만든
//   npc_nation_NN은 nationCode가 그 자리에 둘 프리셋 = NN−1번째). 프리셋이 없는 세력은
//   반란 부모 → 종주 → 태어날 때 부모(기획 답 620 나)를 따라 올라간 나라의 화폐·세율을 쓴다(시뮬 factionBorn과 같다). 그래도 없으면 기준 통화·DEFAULT_TAX_BP.
// - 화폐를 찍는 곳 = 자기 프리셋을 가진 고정 나라(D-131, 시작 도시를 잃지 않는다 D-341). 반란·마을 세력은 찍지 않는다.
// - 기준 통화 = 서버 시험 화폐(s3_test_credit, 기술 해석 [임시] — 시뮬은 첫 나라 화폐). 유저 지갑·정착 지원금·임금·신전·구인 같은 서버 돈이
//   모두 이 화폐라 그대로 두고, 도시 거래소 값만 나라 화폐로 매긴다. 고정 나라가 처음 받은 시험 화폐(NPC_START_CREDIT)가 시뮬의 기준 통화 준비금
//   (baseReserveBp) 자리다. 확인 대기 질문 560.
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
} from "@terra/sim";
import { TEST_NPC_FACTION_CODE } from "../world/unitKinds.ts";
import { MAX_TEST_NATIONS, NATION_CODE_PREFIX } from "./nations.ts";

/** [임시] 국가 프리셋이 없는 세력의 거래세(만분율, 팩 프리셋 값과 같다) */
export const DEFAULT_TAX_BP = 200;
/** 처음 발행 중복 방지 키 앞머리 */
export const MINT_KEY = "npc_mint:";

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
  /** 세력 → 화폐(원장 자산 코드) */
  readonly currencyOf: Map<number, string>;
  /** 세력 → 거래세(만분율) */
  readonly taxOf: Map<number, number>;
  /** 화폐 → 찍는 나라(고정 나라, 화폐 차례 = 세력 ID 차례) */
  readonly issuer: Map<string, number>;
}

/** 세계의 세력마다 화폐·세율, 화폐마다 찍는 나라 */
export function nationCurrencies(world: SimWorld, catalog: PreparedCatalog, base: string): NationCurrencies {
  const currencyOf = new Map<number, string>();
  const taxOf = new Map<number, number>();
  const issuer = new Map<string, number>();
  for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
    const preset = presetOfFaction(world, faction, catalog);
    const currency = preset ? currencyAsset(preset.currency) : base;
    currencyOf.set(faction.id, currency);
    taxOf.set(faction.id, preset?.tradeTaxBp ?? DEFAULT_TAX_BP);
    const own = ownPresetOf(faction, catalog);
    if (own && faction.fixed && faction.alive && currency !== base && !issuer.has(currency))
      issuer.set(currency, faction.id);
  }
  return { currencyOf, taxOf, issuer };
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
