// 유저 구인(정부기관 구인 카드) — 기획 D-469(출생 없음, 인구는 행정 건물 구인 카드로만. 유저 유닛의 소유자 = 그 사이보그), 49 N45,
// docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)".
// - 구인 도시 = NPC 사회 런타임의 거울 도시(행정 건물 레벨 = SimCity.adminLevel). [임시] 유저는 어느 도시 정부기관에서든 고용한다
//   (어느 도시에서 고용할 수 있는지·행정 건물 화면은 UX가 정해지지 않았다).
// - 카드 묶음 = @terra/sim recruitCards(세계 시드 = NPC 사회 시드, 도시, 고용 주체 = 내 소유 주체, 창). NPC 세력과 같은 함수·같은 규칙이고
//   고용 주체마다 묶음이 따로다. 산 칸은 recruit_draws(고용 주체 × 도시, 창이 지나면 0 — 쌓이지 않음).
// - 고용 = 한 번의 동기 처리: 값 소각(원장 recruit: 내 시험 화폐 → sink, 옛 코드는 지갑에서 빼기만 했다) → 도시 둘레에 휴먼 유닛
//   (종류 4)을 세움 → 휴먼 행(레벨 1·카드 스탯·속성, 고용한 때부터 수명) → 산 칸. 커밋 뒤 답한다.
// - [임시] 도시 화폐 = 시험 화폐(서버에 세력 화폐가 아직 없다, 정착 지원금·유지비와 같은 자산).
// - 아직 안 하는 것: 유저 휴먼의 수명·만족도·상속(NPC 사회 런타임은 시험 봇 휴먼만 돌린다), 직무 배치(노동 계약 줄기).
import {
  type RecruitCard,
  type RecruitDraw,
  type SocietyCoefficients,
  STREAM_RECRUIT,
  WALK_SPEED,
  lifespanMs,
  recruitCards,
  recruitElementSlots,
  recruitWindow,
  recruitWindowEndMs,
  streamRng,
  takeRecruitSlot,
  takenNow,
} from "@terra/sim";
import type { RecruitResultCode } from "@terra/protocol";
import type { RecruitCardView, RecruitCityView } from "@terra/shared/recruit";
import { spiralCells } from "../cyborg/service.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { RecruitReadServices } from "../trpc/context.ts";
import type { RecruitDrawRow } from "../npc/state.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, SYSTEM_SINK_CREDIT, type Settlement } from "../world/settlement.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";

/** 고용한 휴먼을 세울 빈 칸을 찾는 반지름(칸) */
const PLACE_RADIUS = 24;
/** 고용한 휴먼의 처음 만족도(밀리점, 세계 차리기·NPC 들이기와 같다) */
const START_SATISFACTION = 60_000;

export type RecruitHireResult =
  | { readonly ok: true; readonly unitId: number }
  | { readonly ok: false; readonly code: RecruitResultCode };

export interface RecruitHireInput {
  readonly cityId: number;
  readonly window: number;
  readonly slot: number;
  readonly cost: string;
}

export interface RecruitService extends RecruitReadServices {
  hire(userId: string, input: RecruitHireInput): Promise<RecruitHireResult>;
}

export interface RecruitServiceOptions {
  /** NPC 사회 런타임(거울 도시·시드). 없으면(끔·부팅 전) 구인할 수 없다 */
  readonly runtime: () => NpcRuntime | undefined;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly settlement: Settlement;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly nextUnitId: () => number;
  /** 사이보그가 있는지와 시작 도시(기본으로 고르는 도시) */
  readonly cyborgOf: (userId: string) => { readonly startCityId: number } | undefined;
  /** 설정 칸 실효 값(부를 때마다 읽는다: 카드 규칙 N45·수명 T4) */
  readonly rules: () => SocietyCoefficients;
  readonly now: () => number;
  /** 부팅 때 읽은 산 칸(recruit_draws) */
  readonly draws: readonly RecruitDrawRow[];
}

/** STR·DEX·AGI·VIT·INT·WIS 배열 → 화면 스탯 */
function statsView(stats: readonly number[]): RecruitCardView["stats"] {
  const at = (index: number): number => stats[index] ?? 0;
  return { str: at(0), dex: at(1), agi: at(2), vit: at(3), int: at(4), wis: at(5) };
}

function cardView(card: RecruitCard, taken: number): RecruitCardView {
  return {
    slot: card.slot,
    level: card.level,
    total: card.total,
    stats: statsView(card.stats),
    elements: { ...card.elements },
    cost: String(card.cost),
    taken: (taken & (1 << card.slot)) !== 0,
  };
}

const fail = (code: RecruitResultCode): RecruitHireResult => ({ ok: false, code });

/** 구인 도시 목록(ID 차례) */
function citiesOf(runtime: NpcRuntime): RecruitCityView[] {
  const population = new Map<number, number>();
  for (const unit of runtime.world.units.values())
    population.set(unit.city, (population.get(unit.city) ?? 0) + 1);
  return [...runtime.world.cities.values()]
    .filter((city) => runtime.places.has(city.id))
    .toSorted((a, b) => a.id - b.id)
    .map((city) => ({
      id: city.id,
      adminLevel: city.adminLevel,
      factionCode: runtime.world.factions.get(city.owner)?.code ?? null,
      start: city.start,
      population: population.get(city.id) ?? 0,
      housing: city.housing,
    }));
}

export function createRecruitService(o: RecruitServiceOptions): RecruitService {
  const draws = new Map<string, RecruitDraw>();
  for (const row of o.draws)
    draws.set(`${row.ownerId}:${row.cityId}`, { window: row.window, taken: row.taken });

  return {
    board(viewer, cityId, nowMs) {
      const runtime = o.runtime();
      if (!runtime) return undefined;
      const rules = o.rules().recruit;
      const window = recruitWindow(nowMs, rules);
      const cities = citiesOf(runtime);
      const record = o.cyborgOf(viewer.id);
      const chosen =
        cities.find((city) => city.id === cityId) ??
        cities.find((city) => city.id === record?.startCityId) ??
        cities[0];
      const ownerId = o.settlement.findOwnerOfUser(viewer.id);
      const base = {
        cities,
        window,
        endsAtMs: recruitWindowEndMs(window, rules),
        refreshMs: rules.refreshMs,
        balance: String(ownerId === undefined ? 0n : o.ledger.balanceOf(ownerId, ASSET_CREDIT)),
        hasCyborg: record !== undefined,
        generatedAt: nowMs,
      };
      const city = chosen ? runtime.world.cities.get(chosen.id) : undefined;
      if (!chosen || !city) return { ...base, cityId: null, level: 0, cards: [], owner: null };
      const seed = runtime.world.seed;
      // 아직 소유 주체가 없는 사용자(사이보그 전)는 고용할 수 없다 → 카드는 보이되(주체 0) 살 수 없다
      const mine = recruitCards(seed, city.id, ownerId ?? 0, window, city.adminLevel, rules);
      const myTaken = takenNow(
        ownerId === undefined ? undefined : draws.get(`${ownerId}:${city.id}`),
        window,
      );
      const ownerDraw =
        city.recruitDraw && city.recruitDraw.hirer === city.owner ? city.recruitDraw : undefined;
      return {
        ...base,
        cityId: city.id,
        level: city.adminLevel,
        cards: mine.map((card) => cardView(card, myTaken)),
        owner: viewer.owner
          ? {
              cards: recruitCards(seed, city.id, city.owner, window, city.adminLevel, rules).map((card) =>
                cardView(card, takenNow(ownerDraw, window)),
              ),
            }
          : null,
      };
    },

    async hire(userId, input) {
      const runtime = o.runtime();
      if (!runtime) return fail("busy");
      const record = o.cyborgOf(userId);
      if (!record) return fail("no_cyborg");
      const city = runtime.world.cities.get(input.cityId);
      const place = runtime.places.get(input.cityId);
      const map = place ? o.maps.get(place.mapKey) : undefined;
      if (!city || !place || !map) return fail("unknown_city");
      // 이 명령은 시작할 때 받은 설정 칸 값 한 벌만 쓴다(카드 규칙·수명). 커밋 전까지 기다림이 없다
      const society = o.rules();
      const at = o.now();
      const window = recruitWindow(at, society.recruit);
      if (input.window !== window) return fail("cards_changed");
      const owner = o.settlement.ownerOfUser(userId, at);
      const cards = recruitCards(
        runtime.world.seed,
        city.id,
        owner.id,
        window,
        city.adminLevel,
        society.recruit,
      );
      const card = cards[input.slot];
      if (!card || String(card.cost) !== input.cost) return fail("cards_changed");
      const key = `${owner.id}:${city.id}`;
      const next = takeRecruitSlot(draws.get(key), window, input.slot, cards.length);
      if (!next) return fail("taken");
      if (o.ledger.balanceOf(owner.id, ASSET_CREDIT) < card.cost) return fail("insufficient_funds");
      // 여기부터 한 번의 동기 처리: 유닛 → 값 소각 → 휴먼 행 → 산 칸(같은 커밋)
      const unitId = o.nextUnitId();
      let placed = false;
      for (const cell of spiralCells(place.cellX, place.cellY, PLACE_RADIUS)) {
        if (
          map.addUnit({
            id: unitId,
            size: 1,
            speed: WALK_SPEED,
            cellX: cell.x,
            cellY: cell.y,
            ownerId: owner.id,
            kind: UNIT_KIND_HUMAN,
          })
        ) {
          placed = true;
          break;
        }
      }
      if (!placed) return fail("no_room");
      if (card.cost > 0n)
        o.ledger.post({
          kind: "recruit",
          atMs: at,
          entries: [
            { account: o.ledger.ownerAccount(owner.id, ASSET_CREDIT), amount: -card.cost },
            { account: o.ledger.systemAccount(SYSTEM_SINK_CREDIT, ASSET_CREDIT), amount: card.cost },
          ],
        });
      // 수명 굴림은 시뮬 구인과 같은 흐름(세계 시드 × 유닛 ID)
      const rng = streamRng(runtime.world.seed, STREAM_RECRUIT, unitId, 0);
      o.writer.upsert("humans", {
        unit_id: unitId,
        city_id: city.id,
        satisfaction_milli: START_SATISFACTION,
        born_at_ms: at,
        lifespan_ms: lifespanMs(rng.nextInt(10_000), society),
        rebirths: 0,
        level: Math.max(1, society.recruit.startLevel),
        stats: [...card.stats],
        elements: recruitElementSlots(card.elements),
      });
      draws.set(key, next);
      o.writer.upsert("recruitDraws", {
        owner_id: owner.id,
        city_id: city.id,
        window_index: next.window,
        taken: next.taken,
      });
      await o.writer.durable();
      return { ok: true, unitId };
    },
  };
}
