// 시뮬 구인(D-469 출생 없음 → 인구는 행정 건물 구인 카드로만) — docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)"
// 세력이 자기 도시 행정 건물(SimCity.adminLevel)의 구인 카드를 산다. 규칙은 society/recruitment.ts(옛 hq_routes.js, 49 N45):
// - 카드 묶음 = (세계 시드, 도시, 고용 주체, 갱신 창). 산 칸은 도시의 recruitDraw에 적는다(서버는 recruit_draws 표에 저장).
// - 값은 고용 주체 국고(도시 화폐 = 도시 주인 국고 화폐)에서 소각한다(원장 거래 recruit → sink. 옛 코드는 지갑에서 빼기만 했다).
// - 새 휴먼 = 카드의 레벨·스탯·속성, 만족도 = 그 도시 휴먼 평균(없으면 60), 수명 = T4 굴림(시각 = 고용한 때, [임시] 어른으로 와서
//   수명을 처음부터 센다). 수명·위치 난수는 카드 난수와 다른 흐름(세계 시드 × 유닛 ID).
// 언제 살지는 부르는 쪽이 정한다(NPC = npc/policy.ts recruitPicks, 유저 = 서버 명령).
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { lifespanMs } from "../society/population.ts";
import {
  type RecruitCard,
  recruitCards,
  recruitProfileOf,
  recruitWindow,
  recruitWindowEndMs,
  takeRecruitSlot,
  takenNow,
} from "../society/recruitment.ts";
import { JOB_GATHER, JOB_NONE, PHASE_WORK } from "../settle/settle.ts";
import type { SimHooks } from "./npcRun.ts";
import { type SimCity, type SimFaction, type SimUnit, type SimWorld, streamRng } from "./world.ts";

/** 난수 흐름: 구인으로 온 휴먼의 수명·처음 자리(흐름 7은 경제 채집, 8은 여기) */
export const STREAM_RECRUIT = 8;
/** 사람이 없는 도시에 온 휴먼의 처음 만족도(세계 차리기와 같다) */
const EMPTY_CITY_SATISFACTION = 60_000;
/** 처음 자리 범위(2차맵 한 변, 합성 이동 부하와 같다) */
const POS_SPAN = 0x4_0000;

/** 한 고용 주체가 한 도시에서 지금 보는 구인 카드 */
export interface RecruitView {
  readonly window: number;
  /** 다음 갱신 시각 */
  readonly endsAtMs: number;
  readonly level: number;
  readonly cards: readonly RecruitCard[];
  /** 지금 창에서 산 칸 비트 */
  readonly taken: number;
}

export interface SocietyRecruit {
  /** 도시 주인(세력)이 그 도시에서 지금 보는 카드. 도시가 없거나 주인이 아니면 undefined */
  view(hirer: SimFaction, cityId: number, nowMs: number): RecruitView | undefined;
  /**
   * 카드 한 장을 산다(도시 주인만). 산 휴먼. 이미 샀거나 자리가 틀리거나 국고가 모자라면 undefined. guard면 경비대로 들인다(직무 없음 —
   * 세계 차리기의 경비대와 같은 모양, 기획 답 920 나)
   */
  hire(hirer: SimFaction, cityId: number, slot: number, nowMs: number, guard?: boolean): SimUnit | undefined;
  /** 하루 끝: 오늘 센 세력별 고용 수를 "어제"로 넘긴다(하루 줄이 읽는다) */
  rollDay(): void;
  /** 지난 하루 끝까지 하루 동안 그 세력이 고용한 수 */
  dayCount(factionId: number): number;
  readonly counts: { recruited: number; readonly spent: Map<string, bigint> };
}

export interface SocietyRecruitOptions {
  readonly world: SimWorld;
  readonly c: SocietyCoefficients;
  readonly hooks: SimHooks | undefined;
  readonly treasuryAsset: (faction: SimFaction) => string;
  readonly scheduleUnit: (unitId: number, nowMs: number) => void;
}

export function createSocietyRecruit(o: SocietyRecruitOptions): SocietyRecruit {
  const { world, c } = o;
  const book: LedgerBook = world.book;
  const counts = { recruited: 0, spent: new Map<string, bigint>() };
  let today = new Map<number, number>();
  let yesterday = new Map<number, number>();

  const viewOf = (hirer: SimFaction, city: SimCity, nowMs: number): RecruitView => {
    const window = recruitWindow(nowMs, c.recruit);
    const draw = city.recruitDraw && city.recruitDraw.hirer === hirer.id ? city.recruitDraw : undefined;
    return {
      window,
      endsAtMs: recruitWindowEndMs(window, c.recruit),
      level: city.adminLevel,
      cards: recruitCards(world.seed, city.id, hirer.id, window, city.adminLevel, c.recruit),
      taken: takenNow(draw, window),
    };
  };

  const average = (cityId: number): number => {
    let n = 0;
    let sum = 0;
    for (const unit of world.units.values())
      if (unit.city === cityId) {
        n += 1;
        sum += unit.satisfactionMilli;
      }
    return n === 0 ? EMPTY_CITY_SATISFACTION : Math.floor(sum / n);
  };

  return {
    view(hirer, cityId, nowMs) {
      const city = world.cities.get(cityId);
      if (!city || city.owner !== hirer.id) return undefined;
      return viewOf(hirer, city, nowMs);
    },
    hire(hirer, cityId, slot, nowMs, guard) {
      const city = world.cities.get(cityId);
      if (!hirer.alive || !city || city.owner !== hirer.id) return undefined;
      const view = viewOf(hirer, city, nowMs);
      const card = view.cards[slot];
      const draw = takeRecruitSlot(
        { window: view.window, taken: view.taken },
        view.window,
        slot,
        view.cards.length,
      );
      if (!card || !draw) return undefined;
      const asset = o.treasuryAsset(hirer);
      if (book.balanceOf(hirer.id, asset) < card.cost) return undefined;
      if (card.cost > 0n)
        book.post({
          kind: "recruit",
          atMs: nowMs,
          entries: [
            { account: book.ownerAccount(hirer.id, asset), amount: -card.cost },
            { account: book.systemAccount(`sink:${asset}`, asset), amount: card.cost },
          ],
        });
      city.recruitDraw = { ...draw, hirer: hirer.id };
      const id = world.nextUnitId();
      const rng = streamRng(world.seed, STREAM_RECRUIT, id, 0);
      const unit: SimUnit = {
        id,
        city: city.id,
        owner: hirer.id,
        job: { job: guard === true ? JOB_NONE : JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 },
        pos: { x: rng.nextInt(POS_SPAN), y: rng.nextInt(POS_SPAN) },
        tripStep: 0,
        eventId: undefined,
        satisfactionMilli: average(city.id),
        bornAtMs: nowMs,
        lifespanMs: lifespanMs(rng.nextInt(10_000), c),
        recruit: recruitProfileOf(card, c.recruit),
        rebirths: 0,
        ...(guard === true ? { guard: true } : {}),
      };
      world.units.set(unit.id, unit);
      hirer.units.add(unit.id);
      o.hooks?.unitsChanged?.(city.id, 1);
      o.scheduleUnit(unit.id, nowMs);
      counts.recruited += 1;
      counts.spent.set(asset, (counts.spent.get(asset) ?? 0n) + card.cost);
      today.set(hirer.id, (today.get(hirer.id) ?? 0) + 1);
      return unit;
    },
    rollDay() {
      yesterday = today;
      today = new Map();
    },
    dayCount: (factionId) => yesterday.get(factionId) ?? 0,
    counts,
  };
}
