// 가문 도시 구인 명령·조회(WebSocket house_recruit_auto·house_recruit_hire, 프로토콜 25) — 질문 1041 다(기획 D-533 "자동 구인"),
// docs/adr/2026-11-11-house-village.md "바뀜 (2026-11-12)". 규칙은 npc/houseRecruit.ts(자동 = NPC와 같은 구인 규칙식).
// - 켬·끔: 가문장만, 가문을 거울 세계에 들인 뒤(도시를 얻은 뒤)만. factions.recruit_auto에 쓰고(쓰기 대기열) 감사 기록 faction.house_recruit_auto.
// - 사기: 가문장만, 가문 도시만. 기기가 본 창·자리·값이 지금 카드와 같아야 한다(cards_changed). 값은 가문 국고(가문 화폐)에서 소각하고,
//   국고가 모자라면 가문장 지갑(가문장 주체의 돈 = 소속 국가 화폐, 같은 수)에서 소각한다 [임시](질문 1097 — 가문 국고에 돈을 넣는 길이 아직 없어 첫 주민을 들일 수
//   없다). 산 휴먼은 가문 소유 주체의 도시 주민이고, 저장(2차맵 봇 세우기·휴먼 행)은 NPC 사회 런타임 처리가 한다.
import type { HouseRecruitPayer, HouseRecruitResultCode } from "@terra/protocol";
import type { HouseRecruitView } from "@terra/shared/house";
import { cityHousingCap } from "@terra/sim";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import { cardView } from "../recruit/service.ts";
import { moneyBalance, moneyOf, moneySink } from "../world/money.ts";
import type { World } from "../world/world.ts";
import { houseRowOf } from "./houseCity.ts";
import { membershipOf } from "./members.ts";
import type { IdentityQueryable } from "./store.ts";

export type HouseRecruitResult =
  | {
      readonly ok: true;
      readonly auto: boolean;
      readonly unitId?: number | undefined;
      readonly payer?: HouseRecruitPayer | undefined;
    }
  | { readonly ok: false; readonly code: HouseRecruitResultCode };

export interface HouseRecruitHireInput {
  readonly cityId: number;
  readonly window: number;
  readonly slot: number;
  readonly cost: string;
}

export interface HouseRecruitService {
  setAuto(userId: string, on: boolean): Promise<HouseRecruitResult>;
  hire(userId: string, input: HouseRecruitHireInput): Promise<HouseRecruitResult>;
}

type RecruitWorld = Pick<World, "status" | "persistence" | "npc">;
type Persistence = NonNullable<RecruitWorld["persistence"]>;

const fail = (code: HouseRecruitResultCode): HouseRecruitResult => ({ ok: false, code });

/**
 * 가문 도시 구인 칸(세력 화면 "내 가문" — houseCity.ts view가 부른다). 가문을 아직 들이지 않았으면 null. 카드·가문장 지갑은 가문장만
 */
export function houseRecruitView(
  npc: NpcRuntime,
  p: Persistence,
  input: { readonly factionId: number; readonly leader: boolean; readonly userId: string },
  nowMs: number,
): HouseRecruitView | null {
  const owner = npc.houses.ownerOfRow(input.factionId);
  const faction = owner === undefined ? undefined : npc.world.factions.get(owner);
  if (owner === undefined || !faction?.player) return null;
  const population = new Map<number, number>();
  for (const unit of npc.world.units.values())
    if (unit.owner === owner) population.set(unit.city, (population.get(unit.city) ?? 0) + 1);
  let window = 0;
  let endsAtMs = nowMs;
  const cities = [...faction.cities]
    .toSorted((a, b) => a - b)
    .flatMap((cityId) => {
      const city = npc.world.cities.get(cityId);
      if (!city) return [];
      const view = npc.houseRecruit.view(owner, cityId, nowMs);
      if (view) {
        window = view.window;
        endsAtMs = view.endsAtMs;
      }
      return [
        {
          id: cityId,
          population: population.get(cityId) ?? 0,
          // 인구 상한 = 주거 + 숙소 침대(질문 1089 나)
          housing: cityHousingCap(city),
          cards: input.leader && view ? view.cards.map((card) => cardView(card, view.taken)) : [],
        },
      ];
    });
  const asset = npc.economy?.hooks.treasuryAsset(faction) ?? moneyOf(p.ledger, owner);
  const me = input.leader ? p.settlement.findOwnerOfUser(input.userId) : undefined;
  return {
    auto: npc.houseRecruit.auto(owner),
    treasury: String(p.ledger.balanceOf(owner, asset)),
    leaderWallet: me === undefined ? null : String(moneyBalance(p.ledger, me)),
    window,
    endsAtMs,
    cities,
  };
}

export function createHouseRecruitService(o: {
  readonly pool: IdentityQueryable;
  readonly db?: Database | undefined;
  readonly now: () => number;
  readonly world: () => RecruitWorld | undefined;
}): HouseRecruitService {
  /** 세계·런타임·사이보그·가문장·들인 가문을 차례로 본다 */
  const context = async (
    userId: string,
  ): Promise<
    | { ok: false; code: HouseRecruitResultCode }
    | { ok: true; p: Persistence; npc: NpcRuntime; rowId: number; owner: number }
  > => {
    const world = o.world();
    const p = world?.persistence;
    const npc = world?.npc;
    if (!world || world.status().state !== "ready" || !p || !npc) return { ok: false, code: "busy" };
    if (!p.cyborgs.record(userId)) return { ok: false, code: "no_cyborg" };
    const mine = await membershipOf(o.pool, userId);
    if (!mine) return { ok: false, code: "no_house" };
    if (mine.role !== "leader") return { ok: false, code: "not_leader" };
    const house = await houseRowOf(o.pool, mine.factionId);
    if (!house) return { ok: false, code: "no_house" };
    const owner = npc.houses.ownerOfRow(house.id);
    if (owner === undefined || !npc.world.factions.get(owner)?.player)
      return { ok: false, code: "not_house_city" };
    return { ok: true, p, npc, rowId: house.id, owner };
  };

  return {
    async setAuto(userId, on) {
      const ctx = await context(userId);
      if (!ctx.ok) return fail(ctx.code);
      const before = ctx.npc.houseRecruit.auto(ctx.owner);
      ctx.npc.houseRecruit.setAuto(ctx.owner, on);
      ctx.p.writer.upsert("houseRecruitAuto", { id: ctx.rowId, recruit_auto: on });
      await ctx.p.writer.durable();
      if (o.db && before !== on)
        await writeAudit(o.db, {
          actor: { kind: "user", id: userId, ip: null },
          action: "faction.house_recruit_auto",
          targetId: userId,
          before: { factionId: ctx.rowId, auto: before },
          after: { factionId: ctx.rowId, auto: on },
        });
      return { ok: true, auto: on };
    },

    async hire(userId, input) {
      const ctx = await context(userId);
      if (!ctx.ok) return fail(ctx.code);
      const { p, npc, owner } = ctx;
      const faction = npc.world.factions.get(owner);
      const city = npc.world.cities.get(input.cityId);
      if (!faction || !city || city.owner !== owner) return fail("not_house_city");
      // 여기부터 한 번의 동기 처리(카드 확인 → 값 → 휴먼). 커밋 전까지 기다림이 없다
      const at = o.now();
      const view = npc.houseRecruit.view(owner, city.id, at);
      if (!view) return fail("not_house_city");
      const card = view.cards[input.slot];
      if (input.window !== view.window || !card || String(card.cost) !== input.cost)
        return fail("cards_changed");
      if ((view.taken & (1 << input.slot)) !== 0) return fail("taken");
      const asset = npc.economy?.hooks.treasuryAsset(faction) ?? moneyOf(p.ledger, owner);
      let payer: HouseRecruitPayer = "treasury";
      let me: number | undefined;
      // 가문장 지갑 몫 = 가문장 주체의 돈(소속 국가 화폐 — 가문 국고 화폐와 다를 수 있다)
      let walletAsset = asset;
      if (p.ledger.balanceOf(owner, asset) < card.cost) {
        // 국고가 모자라면 가문장 지갑에서 [임시](질문 1097). 잔고는 지금까지 정산한 뒤 본다(유지비가 먼저 빠진다)
        payer = "leader";
        me = p.settlement.ownerOfUser(userId, at).id;
        p.settlement.settleOwner(me, at);
        walletAsset = moneyOf(p.ledger, me);
        if (p.ledger.balanceOf(me, walletAsset) < card.cost) return fail("insufficient_funds");
      }
      const unit = npc.houseRecruit.hire(owner, city.id, input.slot, at, payer === "leader");
      if (!unit) return fail(payer === "treasury" ? "insufficient_funds" : "taken");
      if (me !== undefined && card.cost > 0n)
        p.ledger.post({
          kind: "house_recruit",
          atMs: at,
          entries: [
            { account: p.ledger.ownerAccount(me, walletAsset), amount: -card.cost },
            { account: moneySink(p.ledger, walletAsset), amount: card.cost },
          ],
        });
      // 거울 세계의 새 휴먼을 저장한다(2차맵 봇·휴먼 행·산 칸 — 런타임 처리가 돌고 있으면 그 처리가 저장한다)
      await npc.tick(true);
      await p.writer.durable();
      return { ok: true, auto: npc.houseRecruit.auto(owner), unitId: unit.id, payer };
    },
  };
}
