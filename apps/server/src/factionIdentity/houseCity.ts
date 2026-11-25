// 가문 도시(WebSocket house_village·house_ruin, 프로토콜 24) — 질문 1005 가(기획 정리 D-216 포인터: 플레이어 마을 세우기를 폐허 복원과 함께
// 열고 봉신·독립 고르기 하나를 함께 쓴다), D-213·D-216·D-340·D-339. docs/adr/2026-11-11-house-village.md.
// - 고르기(둘이 같은 함수 settle): 가문이 처음 도시를 얻을 때 가문장이 봉신(가문 나라의 봉신 — 공물) | 독립(새 도시국가 + 체제)을 고른다.
//   그때 가문에 소유 주체를 만들어 NPC 사회 런타임 거울 세계에 들인다(npc/houseRuntime.ts). 이미 고른 가문은 그 상태 그대로다(mode_locked —
//   봉신의 독립 선언은 46 §3.2 독립 규칙 몫, 이 명령으로 바꾸지 않는다).
// - 마을 세우기: 가문장만. 자리 = NPC 마을과 같은 규칙(다른 도시·폐허와 띄움, 다른 세력 영향권 밖 — 봉신은 자기 나라 영향권 안도 된다).
//   그 칸에 놓을 수 있어야 한다(물·건물이 아님). 값 = 설정 칸 house_village_cost(가문장 지갑 → 소각 [임시], 기기가 본 값과 다르면
//   terms_changed). 새 마을: 주거 = 설정 칸 house_village_housing, 행정 Lv1, 지분 1,000주를 가문 국고에.
// - 폐허 고르기: 가문장이 정부를 지어 주인이 된 폐허(주인 = 가문장 유저 주체)를 되살리면 가문 도시가 되게 한다(복원하는 세력 = 가문). 이미
//   고른 가문의 가문장이 새로 지은 정부는 저절로 가문 도시로 간다(ruins/service.ts joinOf).
// - 쓰기: 거울 세계의 바뀜(소유 주체·세력 행·도시 행·폐허 줄)과 원장(값·지분)을 같은 동기 처리에서 쓰기 대기열에 넣고 커밋 뒤 답한다(S3 U2).
//   가문원에게 소식(city_gained), 시야 묶음 다시 읽기(world/houseTies.ts), 감사 기록 faction.house_village·faction.house_ruin.
import type { HouseCityMode, HouseCityResultCode, HouseRegime } from "@terra/protocol";
import type { HouseCityView } from "@terra/shared/house";
import { CELL_UNITS, positionAt } from "@terra/sim";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import { residenceBookOf } from "../residence/book.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import { moneyOf, moneySink } from "../world/money.ts";
import type { World } from "../world/world.ts";
import { claimCityIds, independenceOpen } from "./houseIndependence.ts";
import { houseRecruitView } from "./houseRecruit.ts";
import { membershipOf, notify } from "./members.ts";
import type { HouseRules } from "./rules.ts";
import type { IdentityQueryable } from "./store.ts";

export type HouseCityResult =
  | {
      readonly ok: true;
      readonly factionId: number;
      readonly mode: HouseCityMode;
      readonly cityId: number;
      readonly paid: string;
    }
  | { readonly ok: false; readonly code: HouseCityResultCode };

export interface HouseCityChoice {
  readonly mode: HouseCityMode;
  readonly regime?: HouseRegime | undefined;
}

export interface HouseCityService {
  village(
    userId: string,
    input: HouseCityChoice & { mapKey: number; x: number; y: number; cost: string },
  ): Promise<HouseCityResult>;
  ruin(userId: string, input: HouseCityChoice & { ruinId: number }): Promise<HouseCityResult>;
  /**
   * 주인 없는 빈 정부 건물을 가문이 차지한다(사용자 결정 2026-11-25 "그걸 차지한 가문이 소유한다" — ruins/landClaim.ts takeVacant): 가문장의
   * 사이보그 본체가 그 2차맵에 있어야 하고(bad_spot), 빈 정부가 아니면 unknown_ruin. 그 가문이 이 정부로 도시를 세운다
   */
  hall(userId: string, input: HouseCityChoice & { buildingId: number }): Promise<HouseCityResult>;
  /** 봉신 가문 독립 선언(D-575 — houseIndependence.ts) */
  independence(userId: string, input: { regime: HouseRegime }): Promise<HouseCityResult>;
  /** 세력 화면 "내 가문" 칸의 도시 줄(가문장이면 마을 자리 제안·고를 폐허) */
  view(userId: string, house: { factionId: number; leader: boolean }): Promise<HouseCityView>;
  /** 그 사람의 돈(소속 국가 화폐, world/money.ts) — 가문 금고 칸이 이 화폐 잔고를 보인다. 세계가 준비되지 않았으면 undefined */
  moneyOf(userId: string): string | undefined;
  /**
   * 가문원 보유 유닛 가운데 대상 나라(targetNationId)와 전쟁 중인 세력의 도시에 거주 중인 유닛 수
   * (가입 경고 — ADR 2026-11-24-house-membership-separation.md). 세계가 준비되지 않았으면 0
   */
  hostileResidentUnits?(memberUserIds: readonly string[], targetNationId: number): number;
}

type CityWorld = Pick<World, "status" | "persistence" | "npc" | "maps">;

const fail = (code: HouseCityResultCode): HouseCityResult => ({ ok: false, code });

/** 자리 검사 결과 → 결과 코드 */
const SITE_CODE = {
  edge: "bad_spot",
  too_close: "too_close",
  foreign_influence: "foreign_influence",
} as const;

interface HouseRow {
  readonly id: number;
  readonly name: string;
  readonly nation: number | null;
}

export async function houseRowOf(q: IdentityQueryable, factionId: number): Promise<HouseRow | null> {
  const { rows } = await q.query<{ id: string; born_of: string | null; name: string | null }>(
    `select f.id, f.born_of, p.name from factions f left join faction_profiles p on p.faction_id = f.id
      where f.id = $1 and f.kind = 'player' and f.dissolved_at_ms is null`,
    [factionId],
  );
  const row = rows[0];
  return row
    ? {
        id: Number(row.id),
        name: row.name ?? `#${row.id}`,
        nation: row.born_of === null ? null : Number(row.born_of),
      }
    : null;
}

/** 고르기 검사: 이미 고른 가문은 그 상태여야, 처음이면 독립은 체제가 있어야 */
const choiceProblem = (
  npc: NpcRuntime,
  house: HouseRow,
  input: HouseCityChoice,
): HouseCityResultCode | null => {
  const mirror = npc.houses.mirrorOf(house.id);
  if (mirror) return (mirror.vassal ? "vassal" : "independent") === input.mode ? null : "mode_locked";
  if (input.mode === "independent" && input.regime === undefined) return "regime_required";
  // 봉신은 나라가 거울 세계에 살아 있어야 한다
  if (input.mode === "vassal" && (house.nation === null || npc.houses.ownerOfRow(house.nation) === undefined))
    return "busy";
  return null;
};

/** 가문을 들인다(이미 들였으면 그 주체) */
const settle = (npc: NpcRuntime, house: HouseRow, input: HouseCityChoice, at: number): number | undefined =>
  npc.houses.adopt({
    rowId: house.id,
    nationRowId: house.nation,
    vassal: input.mode === "vassal",
    regime: input.regime ?? "democracy",
    nowMs: at,
  });

/** 내 편 세력(그 영향권 안에 세워도 된다): 가문 자신 + 봉신이면 나라 */
const ownSide = (npc: NpcRuntime, house: HouseRow, mode: HouseCityMode): number[] => {
  const out: number[] = [];
  const mirror = npc.houses.mirrorOf(house.id);
  if (mirror) out.push(mirror.ownerId);
  const nation = house.nation === null ? undefined : npc.houses.ownerOfRow(house.nation);
  if (mode === "vassal" && nation !== undefined) out.push(nation);
  return out;
};

/** 가문원들이 보유한 유닛 가운데 대상 나라와 전쟁 중인 도시에 거주하는 유닛 수(ADR 2026-11-24) */
export function countHostileResidentUnits(
  world: Pick<World, "status" | "persistence" | "npc"> | undefined,
  memberUserIds: readonly string[],
  targetNationId: number,
): number {
  const p = world?.status().state === "ready" ? world.persistence : undefined;
  const npc = world?.npc;
  if (!p || !npc) return 0;
  const book = residenceBookOf(p.ledger);
  if (!book) return 0;
  const targetOwner = npc.houses.ownerOfRow(targetNationId);
  const wars = targetOwner === undefined ? undefined : npc.world.factions.get(targetOwner)?.wars;
  if (!wars || wars.size === 0) return 0;
  const owners = new Set<number>();
  for (const uid of memberUserIds) {
    const owner = p.settlement.findOwnerOfUser(uid);
    if (owner !== undefined) owners.add(owner);
  }
  if (owners.size === 0) return 0;
  let count = 0;
  for (const choice of book.all()) {
    if (!owners.has(choice.ownerId)) continue;
    const place = book.chosenPlace(choice.unitId);
    if (!place) continue;
    let cityOwner: number | undefined = npc.world.cities.get(place.cityId)?.owner;
    for (let depth = 0; depth < 8 && cityOwner !== undefined; depth++) {
      if (wars.has(cityOwner)) {
        count += 1;
        break;
      }
      cityOwner = npc.world.factions.get(cityOwner)?.overlord ?? undefined;
    }
  }
  return count;
}

export function createHouseCity(o: {
  readonly pool: IdentityQueryable;
  readonly db?: Database | undefined;
  readonly rules: () => HouseRules;
  readonly now: () => number;
  readonly world: () => CityWorld | undefined;
}): HouseCityService {
  /** 세계·런타임·가문장·가문을 차례로 본다 */
  const context = async (
    userId: string,
  ): Promise<
    | { ok: false; code: HouseCityResultCode }
    | {
        ok: true;
        world: CityWorld & { persistence: NonNullable<CityWorld["persistence"]> };
        npc: NpcRuntime;
        house: HouseRow;
      }
  > => {
    const world = o.world();
    const persistence = world?.persistence;
    const npc = world?.npc;
    if (!world || world.status().state !== "ready" || !persistence || !npc)
      return { ok: false, code: "busy" };
    if (!persistence.cyborgs.record(userId)) return { ok: false, code: "no_cyborg" };
    const mine = await membershipOf(o.pool, userId);
    if (!mine) return { ok: false, code: "no_house" };
    if (mine.role !== "leader") return { ok: false, code: "not_leader" };
    const house = await houseRowOf(o.pool, mine.factionId);
    if (!house) return { ok: false, code: "no_house" };
    return { ok: true, world: { ...world, persistence }, npc, house };
  };

  /** 커밋 뒤: 가문원 소식·시야 묶음·감사 기록 */
  const after = async (
    world: CityWorld & { persistence: NonNullable<CityWorld["persistence"]> },
    userId: string,
    house: HouseRow,
    action: string,
    detail: Record<string, unknown>,
    mode: HouseCityMode,
  ): Promise<void> => {
    const at = o.now();
    const { rows } = await o.pool.query<{ user_id: string }>(
      "select user_id from house_members where faction_id = $1 and user_id <> $2",
      [house.id, userId],
    );
    for (const row of rows)
      await notify(o.pool, {
        userId: row.user_id,
        factionId: house.id,
        kind: "city_gained",
        houseName: house.name,
        reason: mode,
        nowMs: at,
      });
    await houseTiesOf(world.persistence)?.reload();
    if (o.db)
      await writeAudit(o.db, {
        actor: { kind: "user", id: userId, ip: null },
        action,
        targetId: userId,
        before: null,
        after: { factionId: house.id, mode, ...detail },
      });
  };

  return {
    async village(userId, input) {
      const ctx = await context(userId);
      if (!ctx.ok) return fail(ctx.code);
      const { world, npc, house } = ctx;
      const p = world.persistence;
      const rules = o.rules();
      if (input.cost !== rules.villageCost.toString()) return fail("terms_changed");
      const problem = choiceProblem(npc, house, input);
      if (problem) return fail(problem);
      const map = world.maps.get(input.mapKey);
      if (!map) return fail("bad_spot");
      if (!map.canPlace({ x: input.x, y: input.y, width: 1, height: 1, rotation: 0 })) return fail("blocked");
      const site = npc.houses.siteCheck(input.mapKey, input.x, input.y, ownSide(npc, house, input.mode));
      if (site) return fail(SITE_CODE[site]);
      const at = o.now();
      const me = p.settlement.ownerOfUser(userId, at).id;
      // 잔고는 지금까지 정산한 뒤 본다(유지비가 먼저 빠진다)
      p.settlement.settleOwner(me, at);
      const cost = rules.villageCost;
      // 세우는 값 = 세우는 사람의 돈(소속 국가 화폐, world/money.ts)
      const asset = moneyOf(p.ledger, me);
      if (p.ledger.balanceOf(me, asset) < cost) return fail("insufficient_funds");
      const owner = settle(npc, house, input, at);
      if (owner === undefined) return fail("busy");
      const planetId = [...npc.places.values()].find((place) => place.mapKey === input.mapKey)?.planetId;
      const cityId = npc.houses.foundVillage(
        owner,
        { planetId: planetId ?? map.planetId, mapKey: input.mapKey, cellX: input.x, cellY: input.y },
        rules.villageHousing,
        at,
      );
      if (cost > 0n)
        p.ledger.post({
          kind: "house_village",
          atMs: at,
          entries: [
            { account: p.ledger.ownerAccount(me, asset), amount: -cost },
            { account: moneySink(p.ledger, asset), amount: cost },
          ],
        });
      npc.houses.flush(owner, cityId);
      await p.writer.durable();
      const mode = npc.houses.mirrorOf(house.id)?.vassal === false ? "independent" : "vassal";
      await after(
        world,
        userId,
        house,
        "faction.house_village",
        {
          cityId,
          mapKey: input.mapKey,
          x: input.x,
          y: input.y,
          paid: cost.toString(),
          regime: input.regime ?? null,
        },
        mode,
      );
      return { ok: true, factionId: house.id, mode, cityId, paid: cost.toString() };
    },

    async ruin(userId, input) {
      const ctx = await context(userId);
      if (!ctx.ok) return fail(ctx.code);
      const { world, npc, house } = ctx;
      const ruin = npc.world.ruins.get(input.ruinId);
      if (!ruin) return fail("unknown_ruin");
      const me = world.persistence.settlement.findOwnerOfUser(userId);
      if (me === undefined || ruin.claimant !== me) return fail("not_owner");
      const problem = choiceProblem(npc, house, input);
      if (problem) return fail(problem);
      const owner = settle(npc, house, input, o.now());
      if (owner === undefined) return fail("busy");
      ruin.joinFaction = owner;
      npc.flushRuins();
      npc.houses.flush(owner);
      await world.persistence.writer.durable();
      const mode = npc.houses.mirrorOf(house.id)?.vassal === false ? "independent" : "vassal";
      await after(
        world,
        userId,
        house,
        "faction.house_ruin",
        { ruinId: ruin.id, regime: input.regime ?? null },
        mode,
      );
      return { ok: true, factionId: house.id, mode, cityId: ruin.id, paid: "0" };
    },

    async hall(userId, input) {
      const ctx = await context(userId);
      if (!ctx.ok) return fail(ctx.code);
      const { world, npc, house } = ctx;
      const p = world.persistence;
      const vacant = p.ruins.vacantHall(input.buildingId);
      if (!vacant) return fail("unknown_ruin");
      // 차지하려면 가문장 사이보그 본체가 그 2차맵에 있어야 한다(순간이동 없음 — D-591)
      const body = p.cyborgs.record(userId)?.unitId;
      if (body === null || body === undefined || !world.maps.get(vacant.mapKey)?.unitInfo(body))
        return fail("bad_spot");
      const me = p.settlement.findOwnerOfUser(userId);
      if (me === undefined) return fail("busy");
      // 나라에 들지 않은 가문(국가 미소속 창설)은 귀속할 나라가 없다: 독립만
      if (input.mode === "vassal" && house.nation === null && !npc.houses.mirrorOf(house.id))
        return fail("mode_locked");
      const problem = choiceProblem(npc, house, input);
      if (problem) return fail(problem);
      const at = o.now();
      const owner = settle(npc, house, input, at);
      if (owner === undefined) return fail("busy");
      const mode = npc.houses.mirrorOf(house.id)?.vassal === false ? "independent" : "vassal";
      const cityId = p.ruins.takeVacantHall(
        {
          buildingId: input.buildingId,
          owner,
          house: house.id,
          me,
          mode,
          choice:
            mode === "vassal"
              ? { mode: "nation", regime: null }
              : { mode: "independent", regime: input.regime ?? "democracy" },
        },
        at,
      );
      // 그 사이 다른 가문이 차지했다
      if (cityId === undefined) return fail("unknown_ruin");
      npc.houses.flush(owner, cityId);
      await p.writer.durable();
      await after(
        world,
        userId,
        house,
        "faction.house_hall",
        { buildingId: input.buildingId, cityId, mapKey: vacant.mapKey, regime: input.regime ?? null },
        mode,
      );
      return { ok: true, factionId: house.id, mode, cityId, paid: "0" };
    },

    async independence(userId, input) {
      const ctx = await context(userId);
      if (!ctx.ok) return fail(ctx.code);
      const { world, npc, house } = ctx;
      const mirror = npc.houses.mirrorOf(house.id);
      const faction = mirror ? npc.world.factions.get(mirror.ownerId) : undefined;
      if (!mirror || !faction || !mirror.vassal) return fail("not_vassal");
      // 커밋 전 알박기 도시 줄(새 도시와 같은 묶음)이 DB에 닿은 뒤 본다
      await world.persistence.writer.durable();
      if (!independenceOpen(mirror.cities, await claimCityIds(o.pool, mirror.cities)))
        return fail("independence_blocked");
      npc.society.breakVassal(faction);
      faction.regime = input.regime;
      npc.houses.flush(mirror.ownerId);
      await world.persistence.writer.durable();
      await houseTiesOf(world.persistence)?.reload();
      if (o.db)
        await writeAudit(o.db, {
          actor: { kind: "user", id: userId, ip: null },
          action: "faction.house_independence",
          targetId: userId,
          before: { factionId: house.id, mode: "vassal" },
          after: { factionId: house.id, mode: "independent", regime: input.regime },
        });
      const cityId = mirror.cities[0] ?? house.id;
      return { ok: true, factionId: house.id, mode: "independent", cityId, paid: "0" };
    },

    moneyOf(userId) {
      const world = o.world();
      const p = world?.status().state === "ready" ? world.persistence : undefined;
      return p ? moneyOf(p.ledger, p.settlement.findOwnerOfUser(userId)) : undefined;
    },
    hostileResidentUnits(memberUserIds, targetNationId) {
      return countHostileResidentUnits(o.world(), memberUserIds, targetNationId);
    },
    async view(userId, input) {
      const rules = o.rules();
      const { rows } = await o.pool.query<{ parent_id: string | null; regime: string; owned: boolean }>(
        `select f.parent_id, f.regime, exists(select 1 from world_owners w where w.faction_id = f.id) as owned
           from factions f where f.id = $1`,
        [input.factionId],
      );
      const row = rows[0];
      const owned = row?.owned === true;
      const cities = await o.pool.query<{
        id: string;
        name: string | null;
        map_key: string;
        cell_x: number;
        cell_y: number;
      }>("select id, name, map_key, cell_x, cell_y from world_cities where faction_id = $1 order by id", [
        input.factionId,
      ]);
      const world = o.world();
      const npc = world?.status().state === "ready" ? world.npc : undefined;
      let site: HouseCityView["site"] = null;
      const ruins: { id: number; name: string | null }[] = [];
      if (npc && world?.persistence && input.leader) {
        const p = world.persistence;
        const unitId = p.cyborgs.record(userId)?.unitId ?? null;
        const house = await houseRowOf(o.pool, input.factionId);
        if (unitId !== null && house) {
          for (const map of world.maps.values()) {
            const info = map.unitInfo(unitId);
            if (!info) continue;
            const point = positionAt(info.motion, o.now());
            const mirror = npc.houses.mirrorOf(house.id);
            const mode: HouseCityMode = mirror && !mirror.vassal ? "independent" : "vassal";
            const near = npc.houses.siteNear(
              {
                planetId: map.planetId,
                mapKey: map.mapKey,
                cellX: Math.floor(point.x / CELL_UNITS),
                cellY: Math.floor(point.y / CELL_UNITS),
                foundedAtMs: o.now(),
              },
              ownSide(npc, house, mode),
            );
            if (near) site = { mapKey: near.mapKey, x: near.cellX, y: near.cellY };
            break;
          }
        }
        const me = p.settlement.findOwnerOfUser(userId);
        const houseOwner = npc.houses.ownerOfRow(input.factionId);
        for (const ruin of [...npc.world.ruins.values()].toSorted((a, b) => a.id - b.id))
          if (
            me !== undefined &&
            ruin.claimant === me &&
            (houseOwner === undefined || ruin.joinFaction !== houseOwner)
          )
            ruins.push({ id: ruin.id, name: npc.places.get(ruin.id)?.name ?? null });
      }
      const regime =
        row?.regime === "dictatorship" || row?.regime === "capitalism" ? row.regime : "democracy";
      // 봉신이면 독립 선언이 열리나(D-575 — 가문 도시가 모두 알박기로 선 도시)
      const cityIds = cities.rows.map((city) => Number(city.id));
      const vassal = owned && row?.parent_id !== null;
      const independence = vassal
        ? independenceOpen(cityIds, await claimCityIds(o.pool, cityIds))
          ? "open"
          : "blocked"
        : null;
      return {
        independence,
        status: owned ? (row?.parent_id === null ? "independent" : "vassal") : null,
        regime: owned && row?.parent_id === null ? regime : null,
        cities: cities.rows.map((city) => ({
          id: Number(city.id),
          name: city.name,
          mapKey: Number(city.map_key),
          x: city.cell_x,
          y: city.cell_y,
        })),
        villageCost: rules.villageCost.toString(),
        villageHousing: rules.villageHousing,
        site,
        ruins,
        ready: npc !== undefined,
        recruit:
          npc && world?.persistence
            ? houseRecruitView(npc, world.persistence, { ...input, userId }, o.now())
            : null,
      };
    },
  };
}
