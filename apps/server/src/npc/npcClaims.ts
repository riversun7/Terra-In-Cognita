// 서버 NPC 빈 2차맵 알박기(3단계) — 빈틈 2243, 질문 docs/questions/2026-11-21-npc-claim.md 2331 가·2332 가·2333 가·2334 가·2336 가(기획 D-212·
// D-555 1505·1509·D-564 1626·D-554·D-572·D-574·D-575). 판단(@terra/sim decide의 행동 claim — 성향 가중 점수)은 시뮬과 같고, 재료·운반·짓는 시간은
// 시뮬과 같은 함수(@terra/sim/claim)다. 여기는 서버 실행 자리(NpcClaimRun)만 둔다:
// - 켬: 설정 칸 npc_claim_server(기본 0 = 끔 — 운영 세계에서 보기 전까지). 상한·조건은 시뮬과 같은 claimGate + 세계 상한 = 도시·폐허 2차맵 +
//   알박기 중 2차맵 < MAX_CITY_MAPS(부팅이 띄우는 도시 2차맵 상한 — 다 지으면 도시 2차맵이 된다).
// - 자리(2334 가): 내 도시 2차맵에서 행성 칸 이웃(neighbors8, 반경 = 설정 칸 npc_claim_radius 겹) 안의 같은 레벨 2차맵 가운데 도시·폐허가 없고,
//   띄웠거나 지금 띄울 수 있는(그때 띄우기 상한 안 — map_spawn_max_loaded, 꽉 차면 후보 아님) 것. 차례 = 남이 짓는 중이 아닌 것 → 가까운 것 →
//   도시 ID → 이웃 차례. 하루 안에 자리를 못 찾은 2차맵(바다 등)은 건너뛴다. 플레이어 자리(2332 가): 설정 칸 npc_claim_avoid_players가 1이면
//   플레이어가 정부를 짓는 중이거나 플레이어 유닛이 있는 2차맵을 고르지 않는다(기본 0 = 먼저 다 짓는 쪽이 이긴다, D-572).
// - 재료(2331 가): 그 2차맵에서 가장 가까운 내 도시의 도시 창고에 행정 건물 레벨 1 재료가 모두 있어야 후보다. 모자라면 판단 끝(prepare)에 그 도시
//   목표 재고(Economy.claimWants)에 넣어 증축처럼 산다(시뮬과 같다). 재료 값(지난 값)이 판단 틀의 국고 예비금 cost.
// - 짓기(act → 2333 가 "짓는 동안 띄워 둔다", 순간이동 없음): ① 2차맵을 띄운다(그때 띄우기 — 건물이 서면 쉬어도 내리지 않고 다시 켜면 부팅이 함께
//   띄운다) ② 가운데부터 행정 건물 자리(네모 나선)를 찾아 레벨 0 행정 건물을 놓는다(도시 없음 — 플레이어 알박기와 같은 시설 줄, 고르기는 기본값.
//   짓는 중 모습이 보여 플레이어가 경쟁할 수 있다) ③ 재료를 도시 창고 → 그 건물 창고로 운반 일(npcCarry.ts 빈 일꾼 운반 — 보는 2차맵은 휴먼이
//   화물을 지고 출발 2차맵 변 쪽으로 걷고, 보지 않으면 시간 셈, 운반꾼이 없으면 기다림)로 나른다. 시간 = 옮김 셈(claimHaulMs) ④ 닿으면 그 건물
//   창고 재료로 짓기 작업(건물 서비스 npcJob kind build, 짓는 시간 = claimBuildMs) ⑤ 다 지으면 ruins/landClaim.ts foundPending이 그 세력 도시를
//   세운다. TODO(D-580 — 질문 2335 나): 시뮬은 다 지으면 지은 NPC 가문이 새 세력(봉신 | 독립 = 성향 규칙식, 지분 = 그 가문 — @terra/sim
//   SocietyRun.claimHouse)이지만, 서버 다 지음(landClaim.ts foundPending → houses.foundVillage)은 아직 그 세력 도시·지분 = 그 세력이다. 서버를 켜기
//   (npc_claim_server 1) 전에 foundPending의 세력 주체 길을 claimHouse로 바꾼다. 모자라게 닿으면(약탈·그새 쓰임) 창고에 모자란 만큼이 생길 때 다시 나른다.
// - 경쟁(2336 가 — 같은 세력만 같은 편): 먼저 다 지은 쪽이 도시, 도시가 서면 다른 편 짓는 중은 멈춘다(landClaim haltRivals). 나르는 중에 그
//   2차맵에 도시·폐허가 서면 그 알박기는 버린다(재료는 그 건물 창고에 남는다 — "자원과 시간만 날릴수있음").
// - 다시 켜면: 운반·띄우는 중 기억은 잃는다. NPC 세력의 레벨 0·도시 없는·작업 없는 행정 건물(도시·폐허 없는 2차맵)을 틱이 다시 맡아 모자란
//   재료를 다시 나른다(쉬는 날 기억은 잃는다 [임시]).
// 정수·BigInt만 쓴다. 서버 권위(판정은 여기와 건물 서비스).
import { isCellKey } from "@terra/planet";
import { DEFAULT_LAND_CLAIM_MODE } from "@terra/shared/facilities";
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { buildingLocation, cityLocation } from "@terra/shared/goodsPlaces";
import type { Economy, LedgerBook, NpcContext, SimFaction, SimWorld, SocietyCoefficients } from "@terra/sim";
import {
  type BuildStackJson,
  claimBuildMs,
  claimGate,
  claimHaulMs,
  claimHelpers,
  claimMaterialPlan,
  claimMaterialsOf,
  claimValue,
  claimWeightG,
} from "@terra/sim/claim";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import type { FacilityService } from "../facilities/service.ts";
import type { OpenOutcome } from "../world/mapSpawn.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { MAX_CITY_MAPS } from "../world/worldBoot.ts";
import { MAP_CENTER, edgeToward, ringsOf, spotOf } from "./claimSites.ts";
import type { CarryBoard, CarryStack } from "./npcCarry.ts";
import type { CityPlace } from "./persist.ts";

/** 실행 자리(NpcContext.claims) */
type NpcClaimRun = NonNullable<NpcContext["claims"]>;

/** 그때 띄우기(world/mapSpawn.ts MapSpawner 몫) */
export interface ClaimSpawner {
  canOpen(mapKey: number): boolean;
  hasRoom(): boolean;
  open(mapKey: number): Promise<OpenOutcome>;
}

export interface ServerClaimDeps {
  readonly world: SimWorld;
  /** 도시·폐허 자리(NPC 런타임) */
  readonly places: ReadonlyMap<number, CityPlace>;
  readonly planetId: string;
  readonly economy: Economy;
  readonly carry: Pick<CarryBoard, "post" | "finish" | "stateOf">;
  readonly ledger: LedgerBook;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly service: Pick<FacilityService, "facilities" | "jobs" | "npcJob" | "seedBuilt" | "places">;
  readonly catalog: () => FacilityCatalog;
  /** 그때 띄우기. 없으면 띄운 2차맵만 후보 */
  readonly spawner: () => ClaimSpawner | undefined;
  /** 유저 소유 주체인가(플레이어 자리 피하기) */
  readonly isUser: (ownerId: number) => boolean;
  readonly rules: () => SocietyCoefficients;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; warn(obj: object, message: string): void };
}

export interface ServerClaims extends NpcClaimRun {
  /** 운반이 닿은 알박기의 짓기를 걸고, 버릴 것을 버리고, 다시 켠 뒤 맡을 것을 맡는다(런타임 틱). 바꾼 수 */
  tick(nowMs: number): number;
  /** 지금 맡은 알박기(띄우는 중·나르는 중) 수(시험) */
  readonly tracked: () => number;
}

/** 자리를 못 찾은 2차맵을 건너뛰는 시간(ms) */
const REFUSE_MS = 86_400_000;
/** 맡은 알박기 하나 */
interface Tracked {
  readonly faction: number;
  readonly site: number;
  readonly source: number;
  readonly distance: number;
  readonly startedAtMs: number;
  buildingId: number | null;
  carryKey: string | null;
}

export function createServerClaims(d: ServerClaimDeps): ServerClaims {
  const { world, economy, ledger } = d;
  const tracked = new Map<number, Tracked>();
  /** 띄우는 중(아직 건물 없음): 열쇠 = 맡은 번호 */
  let nextTrack = 0;
  let carrySeq = 0;
  const lastStart = new Map<number, number>();
  const refused = new Map<number, number>();
  const wanted = new Map<number, number>();

  const on = (): boolean => Math.trunc(d.rules().npc.claimServer) === 1;
  const governmentDef = () =>
    d.catalog().facilities.find((def) => def.stage === "government" && def.build && def.footprint);
  const isGovernment = (facilityId: string): boolean =>
    d.catalog().facility(facilityId)?.stage === "government";

  /** 도시·폐허가 선 2차맵 */
  const settledMaps = (): Set<number> => {
    const out = new Set<number>();
    for (const cell of d.service.places.cities()) out.add(cell.mapKey);
    for (const [id, place] of d.places)
      if (place.planetId === d.planetId && (world.cities.has(id) || world.ruins.has(id)))
        out.add(place.mapKey);
    return out;
  };

  /** 짓는 중(레벨 0)·도시 없는 행정 건물(알박기 중): 건물 ID → 2차맵·주인·작업 여부 */
  const claimBuildings = (): Map<number, { mapKey: number; owner: number | null; job: boolean }> => {
    const jobs = new Set<number>();
    for (const job of d.service.jobs.values())
      if (job.kind === "build" && job.buildingId !== null) jobs.add(job.buildingId);
    const out = new Map<number, { mapKey: number; owner: number | null; job: boolean }>();
    for (const record of d.service.facilities.values()) {
      if (record.level >= 1 || record.cityId !== null || !isGovernment(record.facilityId)) continue;
      for (const map of d.maps.values()) {
        const owner = map.buildingOwner(record.buildingId);
        if (owner === undefined) continue;
        out.set(record.buildingId, { mapKey: map.mapKey, owner, job: jobs.has(record.buildingId) });
        break;
      }
    }
    return out;
  };

  /** 그 2차맵에 플레이어가 정부를 짓는 중이거나 플레이어 유닛이 있나(2332 나 — 설정 칸으로 켤 때만) */
  const playerOn = (
    mapKey: number,
    buildings: ReadonlyMap<number, { mapKey: number; owner: number | null }>,
  ): boolean => {
    for (const entry of buildings.values())
      if (entry.mapKey === mapKey && entry.owner !== null && d.isUser(entry.owner)) return true;
    let found = false;
    d.maps.get(mapKey)?.forEachUnit((unit) => {
      if (!found && d.isUser(unit.ownerId)) found = true;
    });
    return found;
  };

  /** 그 세력이 지금 짓는(띄우는 중·나르는 중·짓는 중) 알박기 수, 그리고 알박기 중 2차맵(모든 주인) */
  const activity = (
    settled: ReadonlySet<number>,
    buildings: ReadonlyMap<number, { mapKey: number; owner: number | null }>,
  ) => {
    const byFaction = new Map<number, number>();
    const maps = new Set<number>();
    const counted = new Set<number>();
    for (const [id, entry] of buildings) {
      if (settled.has(entry.mapKey)) continue;
      maps.add(entry.mapKey);
      counted.add(id);
      if (entry.owner !== null) byFaction.set(entry.owner, (byFaction.get(entry.owner) ?? 0) + 1);
    }
    for (const t of tracked.values()) {
      maps.add(t.site);
      if (t.buildingId !== null && counted.has(t.buildingId)) continue;
      byFaction.set(t.faction, (byFaction.get(t.faction) ?? 0) + 1);
    }
    return { byFaction, maps };
  };

  /** 그 세력의 가장 좋은 빈 2차맵과 재료를 낼 내 도시. 없으면 undefined */
  const bestSite = (
    faction: SimFaction,
    nowMs: number,
  ): { site: number; source: number; d: number; first: number; contested: boolean } | undefined => {
    const c = d.rules();
    if (!on() || !claimMaterialsOf(economy)) return undefined;
    const settled = settledMaps();
    const buildings = claimBuildings();
    const act = activity(settled, buildings);
    if (!claimGate(faction, nowMs, act.byFaction.get(faction.id) ?? 0, lastStart.get(faction.id), c))
      return undefined;
    if (settled.size + act.maps.size >= MAX_CITY_MAPS) return undefined;
    const radius = Math.min(8, Math.max(1, Math.trunc(c.npc.claimRadius)));
    const avoid = Math.trunc(c.npc.claimAvoidPlayers) === 1;
    const spawner = d.spawner();
    const room = spawner?.hasRoom() ?? false;
    const mine = new Set<number>();
    const others = new Set<number>();
    for (const entry of buildings.values())
      if (!settled.has(entry.mapKey)) (entry.owner === faction.id ? mine : others).add(entry.mapKey);
    for (const t of tracked.values()) (t.faction === faction.id ? mine : others).add(t.site);
    // 2차맵마다 가장 가까운 내 도시(같으면 작은 ID) — 그 도시가 재료를 낸다
    const near = new Map<number, { d: number; source: number; first: number; order: number }>();
    let order = 0;
    for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
      const place = d.places.get(cityId);
      if (!place || place.planetId !== d.planetId || !isCellKey(place.mapKey)) continue;
      for (const [key, ring] of ringsOf(place.mapKey, radius)) {
        order += 1;
        if (ring.d === 0) continue;
        const before = near.get(key);
        if (!before || ring.d < before.d)
          near.set(key, { d: ring.d, source: cityId, first: ring.first, order });
      }
    }
    let best:
      | { site: number; source: number; d: number; first: number; contested: boolean; order: number }
      | undefined;
    for (const [site, at] of near) {
      if (settled.has(site) || mine.has(site) || (refused.get(site) ?? 0) > nowMs) continue;
      if (!d.maps.has(site) && !(room && spawner?.canOpen(site))) continue;
      if (avoid && playerOn(site, buildings)) continue;
      const contested = others.has(site);
      if (
        !best ||
        Number(contested) < Number(best.contested) ||
        (contested === best.contested && (at.d < best.d || (at.d === best.d && at.order < best.order)))
      )
        best = { site, contested, ...at };
    }
    return best;
  };

  const planOf = (factionId: number, cityId: number, materials: readonly BuildStackJson[]) =>
    claimMaterialPlan(economy, materials, (item) =>
      ledger.balanceOf(factionId, `item:${item}`, cityLocation(cityId)),
    );

  /** 재료(또는 모자란 몫)를 도시 창고 → 그 건물 창고로 나르는 운반 일을 건다. 걸었나 */
  const haul = (t: Tracked, faction: SimFaction, nowMs: number): boolean => {
    const materials = claimMaterialsOf(economy);
    if (!materials || t.buildingId === null) return false;
    const at = buildingLocation(t.buildingId);
    // 이미 닿은 만큼은 빼고 나른다
    const short: BuildStackJson[] = [];
    const plain = claimMaterialPlan(economy, materials, (item) =>
      ledger.balanceOf(t.faction, `item:${item}`, at),
    );
    if (plain) return false;
    for (const stack of materials) {
      const have = ledger.balanceOf(t.faction, `item:${stack.item}`, at);
      const missing = BigInt(stack.qty) - have;
      if (missing > 0n) short.push({ item: stack.item, qty: Number(missing) });
    }
    const plan = planOf(t.faction, t.source, short);
    if (!plan) return false;
    const stacks: CarryStack[] = [...plan]
      .filter(([, qty]) => qty > 0n)
      .map(([item, qty]) => ({ asset: `item:${item}`, qty }));
    if (stacks.length === 0) return false;
    const c = d.rules();
    const place = d.places.get(t.source);
    const home = place ? { x: place.cellX, y: place.cellY } : { x: MAP_CENTER, y: MAP_CENTER };
    const sourceKey = place && isCellKey(place.mapKey) ? place.mapKey : undefined;
    const first = sourceKey === undefined ? undefined : ringsOf(sourceKey, t.distance).get(t.site)?.first;
    const drop =
      (sourceKey !== undefined && first !== undefined ? edgeToward(sourceKey, first) : undefined) ?? home;
    carrySeq += 1;
    const key = `k:${String(carrySeq)}`;
    const durMs = claimHaulMs(
      claimWeightG(economy, short),
      t.distance,
      claimHelpers(economy, world, faction, t.source, c),
      c,
    );
    d.carry.post({
      key,
      cityId: t.source,
      owner: t.faction,
      stacks,
      from: cityLocation(t.source),
      to: at,
      x: drop.x,
      y: drop.y,
      atMs: nowMs,
      durMs,
    });
    t.carryKey = key;
    return true;
  };

  /** 띄운 2차맵에 레벨 0 행정 건물을 놓고 재료 운반을 건다. 못 하면 그 자리를 하루 건너뛴다 */
  const place = (id: number, t: Tracked): void => {
    const nowMs = d.now();
    const faction = world.factions.get(t.faction);
    const def = governmentDef();
    const map = d.maps.get(t.site);
    const drop = (why: string) => {
      tracked.delete(id);
      refused.set(t.site, nowMs + REFUSE_MS);
      d.log.info({ owner: t.faction, mapKey: t.site, why }, "npc land claim dropped");
    };
    if (!faction?.alive || !def?.footprint || !map) return drop("gone");
    if (settledMaps().has(t.site)) return drop("settled");
    const spot = spotOf(map, def.footprint.width, def.footprint.height);
    if (!spot) return drop("no_spot");
    const placed = map.placeBuilding(
      { x: spot.x, y: spot.y, width: def.footprint.width, height: def.footprint.height, rotation: 0 },
      t.faction,
    );
    if (!placed.ok || placed.buildingId === undefined) return drop("place_failed");
    d.service.seedBuilt({
      buildingId: placed.buildingId,
      facilityId: def.id,
      level: 0,
      conditionPpm: CONDITION_FULL,
      conditionAtMs: nowMs,
      builtAtMs: nowMs,
      builtBy: null,
      cityId: null,
      claim: { mode: DEFAULT_LAND_CLAIM_MODE, regime: null },
    });
    t.buildingId = placed.buildingId;
    haul(t, faction, nowMs);
    d.log.info(
      {
        owner: t.faction,
        mapKey: t.site,
        buildingId: placed.buildingId,
        source: t.source,
        carry: t.carryKey,
      },
      "npc land claim placed",
    );
  };

  return {
    options(faction, nowMs) {
      const best = bestSite(faction, nowMs);
      const materials = claimMaterialsOf(economy);
      // 재료가 그 도시 창고에 모두 있어야 후보(모자라면 prepare가 산다)
      if (!best || !materials || !planOf(faction.id, best.source, materials)) return [];
      return [
        { site: best.site, cost: claimValue(economy, best.source, materials), contested: best.contested },
      ];
    },

    prepare(faction, nowMs) {
      const before = wanted.get(faction.id);
      wanted.delete(faction.id);
      const materials = claimMaterialsOf(economy);
      const best = materials ? bestSite(faction, nowMs) : undefined;
      const buy =
        best !== undefined &&
        materials !== undefined &&
        planOf(faction.id, best.source, materials) === undefined;
      const wants = (economy.claimWants ??= new Map());
      if (before !== undefined && (!buy || before !== best?.source)) wants.delete(before);
      if (!buy || !best || !materials) return;
      // 증축과 같은 예비: 국고가 재료 값 × 예비 ‰을 덮을 때만 도시 목표 재고에 넣는다
      const asset = economy.currencyOf.get(faction.id) ?? economy.base;
      const value = claimValue(economy, best.source, materials);
      if (ledger.balanceOf(faction.id, asset) * 1000n < value * BigInt(d.rules().npc.reservePm)) return;
      const need = new Map<string, bigint>();
      for (const stack of materials)
        need.set(`item:${stack.item}`, (need.get(`item:${stack.item}`) ?? 0n) + BigInt(stack.qty));
      wants.set(best.source, need);
      wanted.set(faction.id, best.source);
    },

    act(faction, site, nowMs) {
      const best = bestSite(faction, nowMs);
      const materials = claimMaterialsOf(economy);
      // 판단 뒤 바뀌었을 수 있다: 지금도 가장 좋은 자리이고 재료가 있을 때만
      if (!best || best.site !== site || !materials || !planOf(faction.id, best.source, materials))
        return false;
      nextTrack += 1;
      const id = nextTrack;
      const t: Tracked = {
        faction: faction.id,
        site,
        source: best.source,
        distance: best.d,
        startedAtMs: nowMs,
        buildingId: null,
        carryKey: null,
      };
      tracked.set(id, t);
      lastStart.set(faction.id, nowMs);
      const wantedCity = wanted.get(faction.id);
      if (wantedCity !== undefined) {
        economy.claimWants?.delete(wantedCity);
        wanted.delete(faction.id);
      }
      d.log.info(
        { owner: faction.id, mapKey: site, source: best.source, d: best.d },
        "npc land claim started",
      );
      if (d.maps.has(site)) place(id, t);
      else {
        const spawner = d.spawner();
        if (!spawner) {
          tracked.delete(id);
          return false;
        }
        void spawner
          .open(site)
          .then((outcome) => {
            if (outcome === "ok") place(id, t);
            else {
              tracked.delete(id);
              refused.set(site, d.now() + REFUSE_MS);
              d.log.info({ owner: faction.id, mapKey: site, outcome }, "npc land claim map not opened");
            }
          })
          .catch((error: unknown) => {
            tracked.delete(id);
            d.log.warn({ err: error, mapKey: site }, "npc land claim map open failed");
          });
      }
      return true;
    },

    tick(nowMs) {
      let changed = 0;
      const settled = settledMaps();
      const buildings = claimBuildings();
      for (const [id, t] of tracked) {
        if (t.buildingId === null) continue;
        const entry = buildings.get(t.buildingId);
        const faction = world.factions.get(t.faction);
        // 그 2차맵에 도시·폐허가 섰거나(늦은 쪽) 건물이 사라졌거나 세력이 사라졌다: 버린다(재료는 그 건물 창고에 남는다)
        if (!entry || settled.has(entry.mapKey) || !faction?.alive) {
          tracked.delete(id);
          changed += 1;
          continue;
        }
        if (entry.job) {
          tracked.delete(id);
          continue;
        }
        if (t.carryKey !== null) {
          const state = d.carry.stateOf(t.carryKey);
          if (state === "waiting" || (typeof state === "number" && state > nowMs)) continue;
          if (state !== undefined) d.carry.finish(t.carryKey, nowMs);
          t.carryKey = null;
          changed += 1;
        }
        const materials = claimMaterialsOf(economy);
        if (!materials) continue;
        const here = claimMaterialPlan(economy, materials, (item) =>
          ledger.balanceOf(t.faction, `item:${item}`, buildingLocation(t.buildingId ?? 0)),
        );
        if (!here) {
          // 모자라게 닿았다(약탈·그새 쓰임): 창고에 모자란 만큼이 있으면 다시 나른다
          if (haul(t, faction, nowMs)) changed += 1;
          continue;
        }
        const ms = claimBuildMs(
          economy,
          d.rules(),
          claimHelpers(economy, world, faction, t.source, d.rules()),
        );
        const result = d.service.npcJob({
          kind: "build",
          ownerId: t.faction,
          buildingId: t.buildingId,
          materials,
          ms,
        });
        d.log.info(
          { owner: t.faction, mapKey: t.site, buildingId: t.buildingId, ok: result.ok, nowMs },
          "npc land claim build started",
        );
        if (result.ok) tracked.delete(id);
        changed += 1;
      }
      // 다시 켠 뒤: 맡지 않은 NPC 알박기 건물(작업 없음, 도시·폐허 없는 2차맵)을 다시 맡는다
      if (on())
        for (const [buildingId, entry] of buildings) {
          if (entry.job || entry.owner === null || settled.has(entry.mapKey) || d.isUser(entry.owner))
            continue;
          if ([...tracked.values()].some((t) => t.buildingId === buildingId)) continue;
          const faction = world.factions.get(entry.owner);
          if (!faction?.alive) continue;
          let source: { id: number; d: number } | undefined;
          for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
            const at = d.places.get(cityId);
            if (!at || !isCellKey(at.mapKey)) continue;
            const ring = ringsOf(at.mapKey, 8).get(entry.mapKey);
            if (ring && (!source || ring.d < source.d)) source = { id: cityId, d: ring.d };
          }
          if (!source) continue;
          nextTrack += 1;
          tracked.set(nextTrack, {
            faction: faction.id,
            site: entry.mapKey,
            source: source.id,
            distance: source.d,
            startedAtMs: nowMs,
            buildingId,
            carryKey: null,
          });
          changed += 1;
        }
      return changed;
    },
    tracked: () => tracked.size,
  };
}

/** 런타임이 붙이는 알박기 실행 자리(경제·건물 서비스가 있을 때만). 없으면 undefined(서버 NPC는 알박기하지 않는다) */
export function npcClaimsOf(
  o: {
    readonly ledger: LedgerBook;
    readonly maps: ReadonlyMap<number, SecondMap>;
    readonly owners: ReadonlyMap<number, { readonly userId: string | null }>;
    readonly planetId: string;
    readonly rules: () => SocietyCoefficients;
    readonly now: () => number;
    readonly log: ServerClaimDeps["log"];
    readonly economy?:
      | {
          readonly build?:
            | { readonly service: FacilityService; readonly catalog: () => FacilityCatalog }
            | undefined;
        }
      | undefined;
    readonly ruins?: { readonly spawner?: (() => ClaimSpawner | undefined) | undefined } | undefined;
  },
  world: SimWorld,
  places: ReadonlyMap<number, CityPlace>,
  econ: { readonly economy: Economy; readonly carry: CarryBoard } | undefined,
): ServerClaims | undefined {
  const build = o.economy?.build;
  if (!econ || !build) return undefined;
  return createServerClaims({
    world,
    places,
    planetId: o.planetId,
    economy: econ.economy,
    carry: econ.carry,
    ledger: o.ledger,
    maps: o.maps,
    service: build.service,
    catalog: build.catalog,
    spawner: () => o.ruins?.spawner?.(),
    isUser: (ownerId) => (o.owners.get(ownerId)?.userId ?? null) !== null,
    rules: o.rules,
    now: o.now,
    log: o.log,
  });
}
