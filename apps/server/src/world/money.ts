// 주체의 돈 = 소속 국가의 화폐 — docs/adr/2026-11-23-nation-money.md (사용자 결정 2026-11-23 "기준통화란 소속한 국가의 화폐를 말한다",
// "공용시험화폐 그냥 없애라").
// - 서버 돈(지갑·임금·정착 지원금·구인·신전·병원 값 등)은 낼 사람의 소속 국가 화폐로 센다. 옛 공용 시험 화폐(s3_test_credit)는 나라가 있는
//   세계에서 쓰지 않는다.
// - 소속 국가 화폐: 세력 주체(NPC 나라·반란·마을·도시 가진 가문) = 경제 런타임의 그 세력 화폐(npc/currency.ts — 자기 프리셋 → 반란 부모 → 종주 →
//   태어날 때 부모), 사용자 주체 = 그 사람 나라(가문원이면 가문 나라, 무소속이면 시민권 — world/nationVision.ts)의 화폐. 나라가 없으면 기축 통화
//   (첫 고정 국가 화폐 = 환전 짝의 기준, 시뮬과 같다).
// - 두 주체 사이에 돈이 오갈 때는 내는 쪽 화폐로 낸다(받는 쪽에 다른 나라 화폐면 외환으로 쌓인다).
// - 나라가 없는 세계(단위 시험·NPC 사회를 끈 서버)는 해석기가 없어 NO_NATION_MONEY 하나로 돈다.
// 해석기는 원장마다 하나(WeakMap, 세계마다 원장이 하나다). 경제 런타임이 뜨면 world.ts가 건다.
import { TEST_ASSET_CREDIT } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";

/** 나라가 없는 세계(단위 시험·NPC 사회를 끈 서버)의 돈. 나라가 있는 세계에서는 쓰지 않는다 */
export const NO_NATION_MONEY = TEST_ASSET_CREDIT;

/** 소유 주체 → 그 주체가 쓰는 화폐(원장 자산 코드). 세계가 아직 모르면 undefined */
export type MoneyResolver = (ownerId: number) => string | undefined;

const resolvers = new WeakMap<object, MoneyResolver>();

/** 이 원장의 주체 화폐 해석기를 건다(경제 런타임이 뜬 뒤) */
export function setMoneyResolver(ledger: object, resolver: MoneyResolver): void {
  resolvers.set(ledger, resolver);
}

/** 그 주체의 돈(소속 국가 화폐). 주체를 모르거나 나라가 없는 세계면 NO_NATION_MONEY */
export function moneyOf(ledger: object, ownerId: number | undefined): string {
  if (ownerId === undefined) return resolvers.get(ledger)?.(-1) ?? NO_NATION_MONEY;
  return resolvers.get(ledger)?.(ownerId) ?? NO_NATION_MONEY;
}

/** 그 주체의 돈 잔고(위치 없는 지갑) */
export function moneyBalance(ledger: Ledger, ownerId: number | undefined): bigint {
  return ownerId === undefined ? 0n : ledger.balanceOf(ownerId, moneyOf(ledger, ownerId));
}

/** 화폐가 사라지는 곳(값을 내고 없어지는 돈 — 구인·신전·세우는 값) */
export function moneySink(ledger: Ledger, asset: string): number {
  return ledger.systemAccount(`sink:${asset}`, asset);
}

/** 화폐가 나오는 곳(처음 국고·개발 도구 지급) */
export function moneyIssue(ledger: Ledger, asset: string): number {
  return ledger.systemAccount(`issue:${asset}`, asset);
}

/** 돈으로 치는 원장 자산인가(나라 화폐 + 나라 없는 세계의 돈) */
export function isMoneyAsset(asset: string): boolean {
  return asset === NO_NATION_MONEY || asset.startsWith("cur:");
}
