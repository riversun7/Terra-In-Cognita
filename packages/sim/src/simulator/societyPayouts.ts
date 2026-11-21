// 시뮬 도시 세금 정산·봉신 공물 — docs/adr/2026-10-31-faction-society-core.md "바뀜 (2026-11-01)"
// society.ts가 배당 주기·공물 주기 날 끝에 부른다. 규칙은 society/dividends.ts(D-304·D-338)이고, 여기는 기간 값을 모은다:
// - 기간 세금 = 도시 거래소 거래세 누적(경제 고리 taxCollectedOf)의 차이. 도시 주인이 바뀌면 기준점을 다시 잡는다
//   (새 주인은 가진 뒤 걷은 세금만, 옛 주인의 정산 전 몫은 정산하지 않는다).
// - 기간 이자 = 그 세력이 낸 발행 이자 누적(interestPaidOf, 중앙은행이 날마다 이미 소각한 양)의 차이.
// - 운영비 = 그 기간 그 도시 연구 시설 짓기 값(공공 건물, 지금 있는 운영비). 시장 급여·유지비(D-252)가 생기면 더한다(D-444 166).
// - [임시] 가문이 없어 지배 가문 금고 = 세력 국고 주체(world.ts rulingFamilyOf, 독재 국고 몫은 국고에 남는다). 서버는 고리 rulingVaultOf로 가문
//   금고 계정을 준다(D-338, apps/server/src/factionIdentity/houseVault.ts — 플레이어 가문 나라).
// - 공물 = 봉신 국고 × tributePm ÷ 1000(D-443 설정값, 기획 값 없음).
// - 주민세(D-579, society/residentTax.ts): 나라마다 주기 날 끝에 그 도시에 사는 유닛의 주인이 그 도시 재산 값(고리 residentProperty)으로 국고에 낸다.
//   국세 몫을 뺀 나머지는 그 도시 세금 수입으로 다음 도시 세금 정산(기간 세금)에 더한다. 세율 0(설정 칸·나라 값 모두)이면 아무것도 하지 않는다.
import { type CityRevenue, payCityProfit, profitRecipient, settleCityTaxes } from "../society/dividends.ts";
import { collectResidentTax, residentAssessments } from "../society/residentTax.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import type { SimHooks } from "./npcRun.ts";
import { type SimFaction, type SimWorld, rulingFamilyOf } from "./world.ts";

const DAY_MS = 86_400_000;

export interface PayoutCounts {
  /** 이익이 난 도시·기간 */
  settlements: number;
  /** 주주에게 나눈 거래 */
  payouts: number;
  /** 국고에 남긴 도시·기간(민주주의) */
  toTreasury: number;
  tributes: number;
}

export interface SocietyPayouts {
  readonly counts: PayoutCounts;
  /** 도시 주인이 바뀐 바로 뒤 */
  cityMoved(cityId: number): void;
  /** 그 도시에 쓴 운영비(연구 시설 짓기 값) */
  spent(cityId: number, amount: bigint): void;
  settleDividends(nowMs: number): void;
  payTribute(nowMs: number): void;
  /** 주민세(D-579): day = 시뮬 날 수(나라 주기 날만 걷는다). 세율이 모두 0이면 바로 돌아간다 */
  collectResidentTax(nowMs: number, day: number): void;
}

export function createSocietyPayouts(
  world: SimWorld,
  c: SocietyCoefficients,
  hooks: SimHooks | undefined,
  treasuryAsset: (f: SimFaction) => string,
): SocietyPayouts {
  const book = world.book;
  const counts: PayoutCounts = { settlements: 0, payouts: 0, toTreasury: 0, tributes: 0 };
  const taxMark = new Map<number, bigint>();
  const operating = new Map<number, bigint>();
  const interestMark = new Map<number, bigint>();
  /** 도시 → 다음 정산까지 쌓인 주민세 도시 몫(D-579 — 도시 세금 수입) */
  const residentRevenue = new Map<number, bigint>();
  const taxOf = (cityId: number): bigint => hooks?.taxCollectedOf?.(cityId) ?? 0n;
  const sortedFactions = (): SimFaction[] => [...world.factions.values()].toSorted((a, b) => a.id - b.id);

  return {
    counts,
    cityMoved(cityId) {
      taxMark.set(cityId, taxOf(cityId));
      operating.delete(cityId);
      residentRevenue.delete(cityId);
    },
    spent(cityId, amount) {
      operating.set(cityId, (operating.get(cityId) ?? 0n) + amount);
    },
    settleDividends(nowMs) {
      for (const faction of sortedFactions()) {
        if (!faction.alive) continue;
        const paidInterest = hooks?.interestPaidOf?.(faction.id) ?? 0n;
        const interest = paidInterest - (interestMark.get(faction.id) ?? 0n);
        interestMark.set(faction.id, paidInterest);
        const revenues: CityRevenue[] = [...faction.cities]
          .toSorted((a, b) => a - b)
          .map((cityId) => {
            const collected = taxOf(cityId);
            const revenue = collected - (taxMark.get(cityId) ?? 0n) + (residentRevenue.get(cityId) ?? 0n);
            taxMark.set(cityId, collected);
            residentRevenue.delete(cityId);
            const cost = operating.get(cityId) ?? 0n;
            operating.delete(cityId);
            return { city: cityId, revenue, operating: cost };
          });
        const asset = treasuryAsset(faction);
        let vaultPaid = false;
        for (const city of settleCityTaxes(revenues, interest > 0n ? interest : 0n).cities) {
          if (city.profit <= 0n) continue;
          counts.settlements += 1;
          if (profitRecipient(faction.regime) === "treasury") {
            counts.toTreasury += 1;
            continue;
          }
          const rulingAccount =
            faction.regime === "dictatorship" ? hooks?.rulingVaultOf?.(faction, asset) : undefined;
          const paid = payCityProfit(book, {
            city: city.city,
            asset,
            regime: faction.regime,
            treasury: faction.id,
            rulingFamily: rulingFamilyOf(faction),
            rulingAccount,
            profit: city.profit,
            atMs: nowMs,
          });
          if (paid > 0n) counts.payouts += 1;
          if (paid > 0n && rulingAccount !== undefined) vaultPaid = true;
        }
        // 지배 가문 금고를 쓰는 규칙(서버 — NPC 지배 가문이 국고로 돌려보내기 등, 2223 고침)
        if (vaultPaid) hooks?.rulingVaultPaid?.(faction, asset, nowMs);
      }
    },
    collectResidentTax(nowMs, day) {
      const b = c.business;
      // 설정 칸 0이고 나라 값 고리도 없으면 아무것도 하지 않는다(유닛 훑기·계정 만들기 없음 — 시뮬 출력 그대로)
      if (Math.trunc(b.residentTaxPm ?? 0) <= 0 && !hooks?.residentTaxOf) return;
      const propertyOf = hooks?.residentProperty?.(nowMs);
      if (!propertyOf) return;
      let residents: Map<number, Set<number>> | undefined;
      for (const faction of sortedFactions()) {
        if (!faction.alive || faction.cities.size === 0) continue;
        const own = hooks?.residentTaxOf?.(faction);
        const ratePm = own?.ratePm ?? b.residentTaxPm ?? 0;
        const everyMs = own?.everyMs ?? b.residentTaxEveryMs ?? 7 * DAY_MS;
        if (Math.trunc(ratePm) <= 0 || day % Math.max(1, Math.floor(everyMs / DAY_MS)) !== 0) continue;
        if (!residents) {
          residents = new Map();
          for (const unit of world.units.values()) {
            const owners = residents.get(unit.city) ?? new Set<number>();
            owners.add(unit.owner);
            residents.set(unit.city, owners);
          }
        }
        const asset = treasuryAsset(faction);
        const result = collectResidentTax(book, {
          nation: faction.id,
          asset,
          assessments: residentAssessments(faction.id, faction.cities, residents, (payer, city) =>
            propertyOf(payer, city, asset),
          ),
          ratePm,
          nationSharePm: b.residentTaxNationPm ?? 0,
          atMs: nowMs,
        });
        // 도시 몫은 지금 그 나라 도시일 때만 도시 세금 수입으로(넘어간 도시의 옛 빚 갚은 몫은 국고에 남는다 — 질문 2375)
        for (const city of result.cities)
          if (city.cityPart > 0n && faction.cities.has(city.city))
            residentRevenue.set(city.city, (residentRevenue.get(city.city) ?? 0n) + city.cityPart);
        if (result.arrears.length > 0) hooks?.residentTaxArrears?.(faction, result.arrears, nowMs);
      }
    },
    payTribute(nowMs) {
      for (const vassal of sortedFactions()) {
        const lord = vassal.overlord === null ? undefined : world.factions.get(vassal.overlord);
        if (!vassal.alive || !lord?.alive) continue;
        const asset = treasuryAsset(vassal);
        const tribute = (book.balanceOf(vassal.id, asset) * BigInt(c.tributePm)) / 1000n;
        if (tribute <= 0n) continue;
        book.post({
          kind: "tribute",
          atMs: nowMs,
          entries: [
            { account: book.ownerAccount(vassal.id, asset), amount: -tribute },
            { account: book.ownerAccount(lord.id, asset), amount: tribute },
          ],
        });
        counts.tributes += 1;
      }
    },
  };
}
