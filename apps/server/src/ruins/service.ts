// 폐허 복원(서버 권위) — 기획 D-510(정부를 먼저 지은 쪽이 주인, 복원 사업으로 지분 투자 모집)·D-339·D-343·D-344,
// docs/adr/2026-11-07-ruins-restoration.md.
// 규칙(정부 짓기·모금·복원·지분)은 시뮬과 같은 함수(@terra/sim SocietyRuins, NPC 사회 런타임의 거울 세계)다. 여기는 유저 쪽 길만 둔다:
// - 정부 짓기 = 건물 서비스의 행정 건물 짓기(시설 단계 government) 고리: 그 칸에서 가장 가까운 도시·폐허가 주인 없는 폐허면 짓기 시작한 쪽이
//   주인이 된다(값 없이 — 재료·시간은 건물 규칙). 복원하면 도시가 드는 세력 = 그 유저의 나라(사이보그 세력, 확인 대기 질문 481).
// - 모금 열기·넣기(restoration_open·restoration_fund): 거울 세계 규칙을 부르고, 바뀐 폐허·낸 값·복원한 도시 행을 같은 동기 처리에서 쓰기
//   대기열에 넣는다(flushRuins — 원장 거래와 같은 커밋). 커밋 뒤 답한다(S3 U2).
// - 화폐 = 도시가 드는 세력의 국고 화폐(서버는 시험 화폐 하나, D-441 해석과 같은 [임시]).
// - 개발 시험 폐허(dev_make_ruin): 내 시작 도시 둘레 빈 자리에 주인 없는 폐허를 하나 둔다(옛 주인 = 내 나라, 웨이브를 켜지 않고 시험하려고).
// - 폐허 2(기획 답 480 다·485 다·487 다·489 다, ADR "바뀜 (기획 답 480~489, 472, 535)"): 정부 건물 상태(짓는 중·서 있음·0%·사라짐)를 거울
//   세계 규칙에 고리로 알려 준다(attachGovernment) — 다 지어야 모금을 열고 넣고, 0%·사라지면 다시 지은 쪽이 주인(낸 값은 사업에 남음). 모금
//   기한이 지나면 하루 끝에 돌려준다. 행정 건물은 그 폐허(되살아날 도시)의 시설로 적는다(시설 줄 도시 = 폐허 ID) — 되살아난 도시의 행정 레벨 =
//   그 건물 레벨(govLevels, NPC 사회 런타임이 모든 도시에 맞춘다).
import type { RestorationResultCode } from "@terra/protocol";
import { buildCostAt } from "@terra/shared/facilityBuild";
import { type CityCell, cityOfCell } from "@terra/shared/goodsPlaces";
import type { RuinFactionView, RuinView, RuinsOverviewResponse } from "@terra/shared/ruins";
import type { GovernmentStatus, RuinResult, SimRuin } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import { currencyCode } from "../market/fxViews.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { CityPlace } from "../npc/persist.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";

/** 정부 짓기 자리를 찾는 반지름(칸, 폐허 칸 둘레) */
const BUILD_SEARCH_RADIUS = 12;
/** 개발 시험 폐허 자리: 시작 도시에서 떨어진 거리·다른 자리와 띄울 거리·2차맵 가장자리(칸) — 마을 자리(persist.ts)와 같은 값 */
const DEV_DISTANCES = [32, 44] as const;
const DEV_SPACING = 14;
const DEV_MARGIN = 8;
const MAP_SIZE = 256;
/** 개발 시험 폐허의 주거 수 */
const DEV_HOUSING = 8;
/** 개발 시험 폐허 방향(8방위, 정수) */
const DEV_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

export type RuinCommandResult =
  | {
      readonly ok: true;
      readonly ruinId?: number;
      readonly accepted?: string;
      readonly raised?: string;
      readonly restored?: boolean;
    }
  | { readonly ok: false; readonly code: RestorationResultCode };

export interface RuinReadServices {
  overview(
    viewer: { readonly id: string; readonly devGrant: boolean },
    nowMs: number,
  ): RuinsOverviewResponse | undefined;
}

export interface RuinService extends RuinReadServices {
  open(userId: string, ruinId: number): Promise<RuinCommandResult>;
  fund(userId: string, ruinId: number, amount: string): Promise<RuinCommandResult>;
  devMakeRuin(userId: string): Promise<RuinCommandResult>;
  /**
   * 이 유저가 폐허에 넣는 화폐 = 들어갈 나라의 화폐(시뮬 treasuryAsset — 거래소 나라 화폐 534 가 뒤 나라 화폐, 질문 546). 사이보그·나라·경제가
   * 없으면 undefined(개발 시험 화폐 받기가 이 화폐도 같이 준다)
   */
  fundCurrencyOf(userId: string): string | undefined;
  /** 정부 건물 상태(건물 서비스 시설 줄): 짓는 중·서 있음·0%·사라짐(기획 답 480 다·487 다) */
  governmentStatus(buildingId: number): GovernmentStatus;
  /**
   * 도시마다 행정 건물 레벨(기획 답 489 다 — 모든 도시의 행정 레벨 = 그 도시 안 행정 건물 레벨): 시설 줄 도시가 그 도시인 행정 단계 시설
   * 가운데 다 지은 것의 가장 높은 레벨. 행정 건물이 없는 도시는 없다(그 도시 레벨은 그대로)
   */
  governmentLevels(): ReadonlyMap<number, number>;
}

export interface RuinDeps {
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly ledger: Ledger;
  readonly settlement: Settlement;
  readonly writer: WorldWriter;
  readonly cyborgs: CyborgService;
  readonly facilities: WorldFacilities;
  readonly now: () => number;
}

const fail = (code: RestorationResultCode): RuinCommandResult => ({ ok: false, code });

/** 거울 세계 규칙 결과 → 프로토콜 코드 */
const CODE_OF: Readonly<Record<Exclude<RuinResult, "ok">, RestorationResultCode>> = {
  unknown_ruin: "unknown_ruin",
  claimed: "unknown_ruin",
  not_claimed: "not_claimed",
  not_owner: "not_owner",
  not_open: "not_open",
  already_open: "already_open",
  insufficient_funds: "insufficient_funds",
  no_faction: "no_faction",
  invalid_amount: "invalid_amount",
  not_built: "not_built",
  expired: "expired",
};

/** 세력 이름표(이름은 아직 없음 — 코드만, 화면이 코드를 보인다) */
const factionView = (runtime: NpcRuntime, id: number | null): RuinFactionView | null => {
  const faction = id === null ? undefined : runtime.world.factions.get(id);
  return faction ? { code: faction.code, name: null } : null;
};

const amountOf = (text: string): bigint | undefined =>
  /^[1-9][0-9]{0,30}$/.test(text) ? BigInt(text) : undefined;

export function createRuins(d: RuinDeps, npc: () => NpcRuntime | undefined): RuinService {
  const places = d.facilities.service.places;

  /** 세력 행 ID → 그 세력의 소유 주체 ID */
  const ownerOfFactionRow = (rowId: number): number | undefined => {
    for (const owner of d.owners.values()) if (owner.factionId === rowId) return owner.id;
    return undefined;
  };
  /** 소유 주체가 복원하면 도시가 드는 세력(유저 = 사이보그 나라, 세력 주체 = 그 세력). 거울 세계에 산 세력이어야 한다 */
  const joinOf = (runtime: NpcRuntime, ownerId: number): number | undefined => {
    const owner = d.owners.get(ownerId);
    const record = owner?.userId ? d.cyborgs.record(owner.userId) : undefined;
    const join = record ? ownerOfFactionRow(record.factionId) : owner?.factionId ? ownerId : undefined;
    return join !== undefined && runtime.world.factions.get(join)?.alive ? join : undefined;
  };
  /** 그 칸의 가장 가까운 도시·폐허(같은 2차맵). 폐허면 그 폐허 */
  const ruinAt = (runtime: NpcRuntime, mapKey: number, x: number, y: number): SimRuin | undefined => {
    const anchors: CityCell[] = [...places.cities()];
    for (const ruin of runtime.world.ruins.values()) {
      const place = runtime.places.get(ruin.id);
      if (place?.mapKey === mapKey) anchors.push({ id: ruin.id, mapKey, x: place.cellX, y: place.cellY });
    }
    const near = cityOfCell(anchors, mapKey, x, y);
    return near ? runtime.world.ruins.get(near.id) : undefined;
  };
  const governmentDef = () => places.catalog().facilities.find((def) => def.stage === "government");
  const isGovernment = (facilityId: string): boolean =>
    places.catalog().facility(facilityId)?.stage === "government";
  /** 그 건물이 2차맵에 있나 */
  const standing = (buildingId: number): boolean => {
    for (const map of places.maps.values()) if (map.buildingOwner(buildingId) !== undefined) return true;
    return false;
  };
  /** 정부 건물 상태: 시설 줄·건물이 없으면 사라짐, 레벨 0 = 짓는 중, 상태 0% = 0%(폐허, 366 — 수리로 되돌림) */
  const governmentStatus = (buildingId: number): GovernmentStatus => {
    const record = d.facilities.service.facilities.get(buildingId);
    if (!record || !standing(buildingId)) return { state: "down", level: 0 };
    if (record.level < 1) return { state: "building", level: 0 };
    return { state: record.conditionPpm <= 0 ? "down" : "up", level: record.level };
  };
  /** 폐허 둘레에서 행정 건물을 놓을 수 있고 그 폐허 자리인 첫 칸(나선 차례) */
  const buildCellOf = (
    runtime: NpcRuntime,
    ruin: SimRuin,
    place: CityPlace,
  ): { x: number; y: number } | null => {
    const def = governmentDef();
    const map = places.maps.get(place.mapKey);
    if (!def?.footprint || !map) return null;
    for (let r = 0; r <= BUILD_SEARCH_RADIUS; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = place.cellX + dx;
          const y = place.cellY + dy;
          if (ruinAt(runtime, place.mapKey, x, y)?.id !== ruin.id) continue;
          const footprint = {
            x,
            y,
            width: def.footprint.width,
            height: def.footprint.height,
            rotation: 0,
          } as const;
          if (map.canPlace(footprint)) return { x, y };
        }
    return null;
  };
  /** 소유 주체 이름표: 세력이면 세력 코드, 유저면 사이보그 이름, 모르면 #ID */
  const labelOf = (runtime: NpcRuntime, ownerId: number): string => {
    const faction = runtime.world.factions.get(ownerId);
    if (faction) return faction.code;
    const userId = d.owners.get(ownerId)?.userId;
    return (userId ? d.cyborgs.record(userId)?.name : undefined) ?? `#${ownerId}`;
  };
  const commit = async (runtime: NpcRuntime, result: RuinCommandResult): Promise<RuinCommandResult> => {
    runtime.flushRuins();
    await d.writer.durable();
    return result;
  };

  // 정부 건물 상태 고리(거울 세계 규칙): NPC 사회 런타임이 다시 생겨도(시험) 부를 때마다 붙인다
  const attached = new WeakSet<NpcRuntime>();
  const live = (): NpcRuntime | undefined => {
    const runtime = npc();
    if (runtime && !attached.has(runtime)) {
      runtime.society.ruins.attachGovernment(governmentStatus);
      attached.add(runtime);
    }
    return runtime;
  };

  // 건물 서비스 고리: 행정 건물은 주인 없는(또는 정부 건물이 0%·사라진) 폐허 자리에만, 짓기 시작한 쪽이 주인(480 다 — 다 지어야 모금)
  d.facilities.service.attachGovernment({
    check(ownerId, mapKey, x, y) {
      const runtime = live();
      if (!runtime) return { ok: false, code: "not_ruin" };
      const ruin = ruinAt(runtime, mapKey, x, y);
      if (!ruin) return { ok: false, code: "not_ruin" };
      // 주인 없음, 또는 주인의 정부 건물이 0%·사라짐이면 다시 지은 쪽이 주인(487 다)
      if (!runtime.society.ruins.claimable(ruin.id)) return { ok: false, code: "ruin_claimed" };
      if (joinOf(runtime, ownerId) === undefined) return { ok: false, code: "forbidden" };
      return { ok: true, ruinId: ruin.id };
    },
    claimed(ruinId, ownerId, buildingId, atMs) {
      const runtime = live();
      const join = runtime ? joinOf(runtime, ownerId) : undefined;
      if (!runtime || join === undefined) return;
      runtime.society.ruins.claim(ruinId, ownerId, join, atMs, { pay: false, building: buildingId });
      runtime.flushRuins();
    },
  });

  return {
    governmentStatus,
    governmentLevels() {
      const out = new Map<number, number>();
      for (const record of d.facilities.service.facilities.values()) {
        if (record.cityId === null || record.level < 1 || !isGovernment(record.facilityId)) continue;
        if (!standing(record.buildingId)) continue;
        out.set(record.cityId, Math.max(out.get(record.cityId) ?? 0, record.level));
      }
      return out;
    },

    overview(viewer, nowMs) {
      const runtime = live();
      if (!runtime) return undefined;
      const me = d.settlement.findOwnerOfUser(viewer.id);
      const ruins: RuinView[] = [];
      for (const ruin of [...runtime.world.ruins.values()].toSorted((a, b) => a.id - b.id)) {
        const place = runtime.places.get(ruin.id);
        if (!place || !places.maps.has(place.mapKey)) continue;
        const claimed = ruin.claimant !== null;
        const raised = [...ruin.contributions.values()].reduce((sum, v) => sum + v, 0n);
        const rules = runtime.society.ruins;
        const ready = rules.ready(ruin.id);
        const deadline = rules.deadlineOf(ruin.id);
        const open = claimed && ready && nowMs < deadline;
        ruins.push({
          id: ruin.id,
          mapKey: place.mapKey,
          x: place.cellX,
          y: place.cellY,
          ruinedAtMs: ruin.ruinedAtMs,
          name: place.name ?? null,
          formerOwner: factionView(runtime, ruin.formerOwner),
          owner:
            ruin.claimant === null
              ? null
              : {
                  mine: ruin.claimant === me,
                  label: labelOf(runtime, ruin.claimant),
                  joins: factionView(runtime, ruin.joinFaction),
                  // 정부 건물(유저가 지은 것). NPC 주인은 건물 없이 값으로 지어 늘 서 있다
                  hall:
                    ruin.building === null
                      ? null
                      : { ...governmentStatus(ruin.building), buildingId: ruin.building },
                },
          project: claimed
            ? {
                goal: String(ruin.goal),
                raised: String(raised),
                currency: ruin.currency,
                currencyCode: currencyCode(ruin.currency),
                balance: String(me === undefined ? 0n : d.ledger.balanceOf(me, ruin.currency)),
                open: ruin.open,
                mine: String(me === undefined ? 0n : (ruin.contributions.get(me) ?? 0n)),
                canFund: open && me !== undefined && (ruin.claimant === me || ruin.open),
                ready,
                deadlineAtMs: deadline >= Number.MAX_SAFE_INTEGER ? null : deadline,
                shares: runtime.society.ruins
                  .previewShares(ruin.id)
                  .map((h) => ({
                    mine: h.owner === me,
                    label: labelOf(runtime, h.owner),
                    shares: Number(h.amount),
                  }))
                  .toSorted((a, b) => b.shares - a.shares),
              }
            : null,
          buildAt: rules.claimable(ruin.id) ? buildCellOf(runtime, ruin, place) : null,
        });
      }
      const def = governmentDef();
      const catalog = places.catalog();
      return {
        status: "ready",
        ruins,
        government:
          def?.build && def.footprint
            ? {
                facilityId: def.id,
                name: def.name,
                maxLevel: def.maxLevel,
                materials: buildCostAt(def.build, 1).map((stack) => ({
                  item: stack.item,
                  name: catalog.itemName(stack.item) ?? { ko: stack.item, en: stack.item },
                  qty: stack.qty,
                })),
              }
            : null,
        balance: String(me === undefined ? 0n : d.ledger.balanceOf(me, ASSET_CREDIT)),
        currency: ASSET_CREDIT,
        hasCyborg: d.cyborgs.record(viewer.id) !== undefined,
        dev: viewer.devGrant,
        generatedAt: nowMs,
      };
    },

    async open(userId, ruinId) {
      const runtime = live();
      if (!runtime) return fail("busy");
      const me = d.settlement.findOwnerOfUser(userId);
      if (me === undefined) return fail("not_owner");
      const result = runtime.society.ruins.open(ruinId, me, d.now());
      if (result !== "ok") return fail(CODE_OF[result]);
      return commit(runtime, { ok: true, ruinId });
    },

    async fund(userId, ruinId, text) {
      const runtime = live();
      if (!runtime) return fail("busy");
      const amount = amountOf(text);
      if (amount === undefined) return fail("invalid_amount");
      if (!d.cyborgs.record(userId)) return fail("no_cyborg");
      const at = d.now();
      const me = d.settlement.ownerOfUser(userId, at).id;
      // 잔고를 지금까지 정산한 뒤 본다(유지비가 먼저 빠진다)
      d.settlement.settleOwner(me, at);
      const outcome = runtime.society.ruins.fund(ruinId, me, amount, at);
      if (outcome.result !== "ok") return fail(CODE_OF[outcome.result]);
      const left = runtime.world.ruins.get(ruinId);
      const raised = left ? [...left.contributions.values()].reduce((sum, v) => sum + v, 0n) : 0n;
      return commit(runtime, {
        ok: true,
        ruinId,
        accepted: String(outcome.accepted),
        raised: String(outcome.restored ? 0n : raised),
        restored: outcome.restored,
      });
    },

    fundCurrencyOf(userId) {
      const runtime = live();
      const me = d.settlement.findOwnerOfUser(userId);
      if (!runtime || me === undefined) return undefined;
      const join = joinOf(runtime, me);
      const faction = join === undefined ? undefined : runtime.world.factions.get(join);
      return faction ? runtime.economy?.hooks.treasuryAsset(faction) : undefined;
    },

    async devMakeRuin(userId) {
      const runtime = live();
      if (!runtime) return fail("busy");
      const record = d.cyborgs.record(userId);
      if (!record) return fail("no_cyborg");
      const start = runtime.places.get(record.startCityId);
      const owner = ownerOfFactionRow(record.factionId);
      if (!start || owner === undefined || !places.maps.has(start.mapKey)) return fail("no_place");
      const taken = [...runtime.places.values()].filter((p) => p.mapKey === start.mapKey);
      let spot: { x: number; y: number } | undefined;
      for (const distance of DEV_DISTANCES)
        for (const [dx, dy] of DEV_DIRECTIONS) {
          if (spot) break;
          const x = start.cellX + dx * distance;
          const y = start.cellY + dy * distance;
          const inside =
            x >= DEV_MARGIN && y >= DEV_MARGIN && x < MAP_SIZE - DEV_MARGIN && y < MAP_SIZE - DEV_MARGIN;
          if (
            inside &&
            !taken.some((p) => Math.max(Math.abs(p.cellX - x), Math.abs(p.cellY - y)) < DEV_SPACING)
          )
            spot = { x, y };
        }
      if (!spot) return fail("no_place");
      const at = d.now();
      const id = runtime.world.nextCityId();
      // 시험 폐허는 이름이 없다(시작 도시 이름을 물려받지 않게)
      runtime.places.set(id, { ...start, cellX: spot.x, cellY: spot.y, foundedAtMs: at, name: undefined });
      runtime.society.ruins.record(
        {
          id,
          owner,
          start: false,
          housing: DEV_HOUSING,
          researchLevel: 0,
          adminLevel: 1,
          recruitDraw: null,
          development: 0,
          nextRebellionMs: at,
        },
        at,
      );
      return commit(runtime, { ok: true, ruinId: id });
    },
  };
}
