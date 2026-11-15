// 원자재 오브젝트 채집·건물 들어가기 서비스 — docs/adr/2026-11-07-gather-objects.md 3·5절, 사용자 지적(2026-11-07) 문제 2·3과 사용자 답(원문은 ADR).
// - 채집 줄(유닛 하나에 하나): 오브젝트 옆 설 칸으로 걷기 → 캐기(일 ÷ 진행 속도) → 화물(원장 유닛 화물 위치)에 넣기 → 화물이 차면 넣는 곳(맡는 시설·
//   창고·도시)으로 걷기 → 넣기 → 오브젝트로 돌아오기를 멈출 때·넣는 곳이 찰 때·피로 상한·둘레 같은 종류가 모두 떨어질 때까지 되풀이한다.
//   오브젝트가 떨어지면 반경 안 가장 가까운 같은 종류 오브젝트로 옮긴다. 걷기는 그 2차맵 길 찾기(moveUnit)이고 도착 시각에 확인한다(이동 서비스와 같은 틀).
// - 들어가기: 건물 둘레 설 칸으로 걷고 닿으면 차례로 — 화물 넣기(내 창고·맡는 시설·시청) → 직무 받기(내 채집 시설, 기존 직무 배치) → 안에 머물기.
//   안에 머문 유닛은 움직임이 바뀌면(다른 명령) 나간 것으로 본다.
// - 서버 권위: 소유·거리·오브젝트 상태·원장은 서버가 정한다. 기기는 유닛·오브젝트 번호·건물만 보낸다.
// - 길에서 벗어남(확인할 때 움직임이 바뀜·유닛 없음) = interrupted. 같은 유닛에 새 명령이 오면 앞 줄을 버린다.
// [임시] 채집 줄·안에 머묾은 메모리에만 둔다(다시 켜면 유닛은 그 자리에 선다. 든 화물은 원장에 남는다 — 확인 대기, 질문 670).
// 배에서 캐기(기획 D-541 1280 가, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B3)"): 배에 탄 유닛(승객)은 바다 오브젝트(배로만 닿는 것·어군)만 캐고,
// 채집 줄이 배를 몬다(승객에게 내린 이동 = 배 이동, D-541 1279 나). 설 칸은 배가 설 물 칸, 거리는 배에서 캐는 거리(stand.ts). 캔 것은 승객 화물에
// 들고(걷는 채집과 같은 원장 위치), 차면 배가 넣는 곳 둘레 물(없으면 내 부두)로 가서 넣는다(닿을 물이 없으면 no_deposit — 화물은 승객이 든 채).
// 한 배의 승객들은 같은 오브젝트만 함께 캔다(다른 오브젝트를 시키면 앞 줄이 끝난다). 같은 배의 다른 승객 채집 줄이 배를 옮긴 것은 벗어남으로
// 보지 않고 다시 찾아간다(steer).
import type { GatherResultCode } from "@terra/protocol";
import type { GatherLoopView, GatherPhase, GatherStop } from "@terra/shared/gather";
import {
  type CellPoint,
  JOB_NONE,
  type Motion,
  type SizeClass,
  anchorAt,
  anchorCenter,
  arrivalAt,
  positionAt,
} from "@terra/sim";
import { type StorageContext, roomGrams } from "../facilities/storage.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_BOT, UNIT_KIND_GUARDIAN } from "../world/unitKinds.ts";
import { statOf } from "../labor/gatherWork.ts";
import {
  type Deposit,
  campDeposit,
  campFor,
  carriedGrams,
  depositCargo,
  dockDeposits,
  gatherIntoCargo,
  nearestStore,
} from "./deposit.ts";
import { enterBuilding } from "./enter.ts";
import type { GatherKind } from "./kinds.ts";
import { objectYieldItem } from "./objectYield.ts";
import { schoolCell } from "@terra/shared/fishSchool";
import { type GatherObject, placeGatherObjects } from "./objects.ts";
import {
  cellDistance2,
  gatherDurationMs,
  gatherEfficiencyPm,
  gatherFatiguePm,
  gatherYieldPm,
  regrowMs,
  splitPm,
} from "./rules.ts";
import { mapLayers } from "./terrainLayers.ts";
import type { GatherCommandResult, GatherDeps, GatherService } from "./serviceTypes.ts";

export type { GatherCommandResult, GatherDeps, GatherService } from "./serviceTypes.ts";
import { BOAT_BODY_SIZE, boatReach, commandCode, onLand, onWater, seaObject, standNear } from "./stand.ts";

/** 끝난 줄을 화면에 보이는 시간(ms) */
export const RECENT_MS = 10 * 60_000;
/** 길 찾기가 밀렸을 때 다시 해 보기까지(ms) */
const RETRY_MS = 2_000;
/** 오브젝트 둘레 설 칸 찾는 반경(배치 칸) */
const OBJECT_STAND_CELLS = 4;
/** 어군을 낚는 동안 봐 주는 여유(배치 칸) — 캐는 사이 어군이 조금 헤엄쳐도 놓치지 않게 [임시] */
const SCHOOL_REACH_SLACK = 2;

/** 오브젝트의 시각 nowMs 자리(배치 칸). 어군은 길 위 지금 자리, 그 밖은 놓인 자리 */
function livePlace(object: GatherObject, nowMs: number): CellPoint {
  return object.route ? schoolCell(object.route, nowMs) : { x: object.x, y: object.y };
}
/** 건물·도시 둘레 설 칸 찾는 반경(배치 칸) */
const BUILDING_STAND_CELLS = 14;
/** setTimeout 지연 상한 */
const MAX_TIMER_MS = 0x7fff_ffff;

interface Action {
  readonly unitId: number;
  readonly ownerId: number;
  /** 배에서 캐는 줄이면 그 배(시작할 때 탄 배), 아니면 null */
  readonly boatId: number | null;
  readonly userId: string;
  readonly mapKey: number;
  readonly kind: "gather" | "enter";
  objectId: number | null;
  kindIndex: number;
  buildingId: number | null;
  phase: GatherPhase;
  motion: Motion | null;
  checkAtMs: number | null;
  /** 지금 단계를 시작한 시각(캐는 중 진행바 — 보기 값) */
  phaseAtMs: number | null;
  seq: number;
  deposit: Deposit | null;
  /** 넣을 때 건너뛸 넣는 곳(가득 찬 창고) */
  readonly skip: Set<string>;
  /** 이 오브젝트를 맡는 내 시설 레벨(반경 안이면), 아니면 null */
  campLevel: number | null;
  /** 캐기 차례(굴림표·사다리 굴림 시드, objectYield.ts) */
  yieldSeq: number;
  yieldCarryPm: number;
  fatigueCarryPm: number;
  /** 채집 중 부상을 마지막으로 굴린 시각(이 뒤의 작업 주기 경계를 굴린다) */
  injuryCheckedMs: number;
  readonly assets: Set<string>;
  gatheredLots: number;
  depositedUnits: number;
  /** 넣은 뒤 끝낼 까닭(피로·떨어짐) */
  endAfterDeposit: GatherStop | null;
  stop: GatherStop | null;
  enterResult: GatherLoopView["enterResult"];
  updatedAt: number;
}

const fail = (code: GatherResultCode): GatherCommandResult => ({ ok: false, code });

export function createGatherService(deps: GatherDeps): GatherService {
  const { maps, now, log } = deps;
  const works = (buildingId: number): boolean => deps.works(buildingId);
  const actions = new Map<number, Action>();
  const recent = new Map<number, GatherLoopView & { readonly ownerId: number }>();
  /** 안에 머문 유닛 → 건물·그때 움직임 */
  const inside = new Map<number, { buildingId: number; ownerId: number; mapKey: number; motion: Motion }>();
  const objectCache = new Map<
    number,
    { version: string; list: GatherObject[]; byId: Map<number, GatherObject> }
  >();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const objectsOf = (mapKey: number) => {
    const map = maps.get(mapKey);
    if (!map) return undefined;
    const cached = objectCache.get(mapKey);
    if (cached?.version === map.terrainVersion) return cached;
    const terrainKind = deps.terrainKind?.(mapKey);
    const list = placeGatherObjects(
      {
        ...mapLayers(map),
        materials: deps.materials?.(mapKey),
        oreSharePm: deps.oreSharePm?.(mapKey),
        woodSharePm: deps.woodSharePm?.(mapKey),
        biomeId: terrainKind?.biomeId,
        waterBits: terrainKind?.waterBits,
      },
      deps.kinds(),
    );
    const entry = {
      version: map.terrainVersion,
      list,
      byId: new Map(list.map((object) => [object.id, object])),
    };
    objectCache.set(mapKey, entry);
    return entry;
  };

  const storageCtx = (): StorageContext | undefined => {
    const world = deps.places();
    if (!world) return undefined;
    return { world, ledger: deps.ledger, catalog: world.catalog(), rules: deps.rules().facilityRuntime };
  };

  const arm = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (stopped) return;
    let next: number | undefined;
    for (const action of actions.values())
      if (action.checkAtMs !== null && (next === undefined || action.checkAtMs < next))
        next = action.checkAtMs;
    if (next === undefined) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        runDue();
      },
      Math.min(MAX_TIMER_MS, Math.max(0, next - now())),
    );
    timer.unref();
  };

  const schedule = (action: Action, atMs: number): void => {
    action.checkAtMs = atMs;
    arm();
  };

  const kindOf = (action: Action): GatherKind | undefined => deps.kinds()[action.kindIndex];

  const capacity = (): number => Math.max(0, deps.rules().gatherObjects.carryGrams);

  const carried = (action: Action): bigint => {
    const ctx = storageCtx();
    return ctx ? carriedGrams(ctx, action.ownerId, action.unitId, action.assets) : 0n;
  };

  const viewOf = (action: Action): GatherLoopView => ({
    unitId: action.unitId,
    mapKey: action.mapKey,
    objectId: action.objectId,
    kindId: action.kind === "gather" ? (kindOf(action)?.id ?? null) : null,
    buildingId: action.buildingId,
    phase: action.phase,
    carriedGrams: Number(carried(action)),
    capacityGrams: capacity(),
    deposit: action.deposit?.kind ?? null,
    gatheredLots: action.gatheredLots,
    depositedUnits: action.depositedUnits,
    efficiencyPm: gatherEfficiencyPm(deps.rules().gatherObjects, action.campLevel),
    nextAt: action.checkAtMs,
    phaseAt: action.phaseAtMs,
    stop: action.stop,
    enterResult: action.enterResult,
    updatedAt: action.updatedAt,
  });

  const prune = (): void => {
    const cutoff = now() - RECENT_MS;
    for (const [unitId, view] of recent) if (view.updatedAt < cutoff) recent.delete(unitId);
  };

  const finish = (action: Action, stop: GatherStop): void => {
    if (actions.get(action.unitId) !== action) return;
    actions.delete(action.unitId);
    action.seq += 1;
    action.checkAtMs = null;
    action.phase = "done";
    action.stop = stop;
    action.updatedAt = now();
    recent.set(action.unitId, { ...viewOf(action), ownerId: action.ownerId });
    prune();
  };

  const unitAt = (action: Action) => {
    const map = maps.get(action.mapKey);
    const info = map?.unitInfo(action.unitId);
    return map && info ? { map, info } : undefined;
  };
  /** 움직이는 몸 크기: 배에서 캐는 줄이면 배(승객 움직임 = 배 움직임), 아니면 그 유닛 */
  const bodySize = (action: Action, size: SizeClass): SizeClass =>
    action.boatId === null ? size : BOAT_BODY_SIZE;
  /** 같은 배의 채집 줄이 마지막으로 배에 준 움직임(배 ID → 움직임) — 그 움직임으로 바뀐 것은 벗어남이 아니다 */
  const steer = new Map<number, Motion>();

  /** 걸어서 그 칸(설 칸)으로 간다. 이미 서 있으면 바로 확인 */
  const walk = async (action: Action, goal: CellPoint, phase: GatherPhase): Promise<GatherCommandResult> => {
    action.seq += 1;
    const seq = action.seq;
    action.phase = phase;
    action.motion = null;
    action.checkAtMs = null;
    action.updatedAt = now();
    action.phaseAtMs = now();
    const where = unitAt(action);
    if (!where) {
      finish(action, "interrupted");
      return fail("unknown_unit");
    }
    const at = now();
    const size = bodySize(action, where.info.size);
    const here = anchorAt(positionAt(where.info.motion, at), size);
    if (here.x === goal.x && here.y === goal.y && at >= arrivalAt(where.info.motion)) {
      action.motion = where.info.motion;
      schedule(action, at);
      return { ok: true };
    }
    // 승객이면 2차맵이 배를 옮긴다(D-541 1279 나)
    const result = await where.map.moveUnit(action.unitId, anchorCenter(goal.x, goal.y, size));
    if (actions.get(action.unitId) !== action || action.seq !== seq) return fail("busy");
    if (!result.ok) {
      const code = commandCode(result.code);
      if (code === "busy") {
        schedule(action, now() + RETRY_MS);
        return fail("busy");
      }
      finish(action, code === "unknown_unit" ? "interrupted" : "no_path");
      return fail(code);
    }
    const motion = where.map.unitInfo(action.unitId)?.motion;
    if (!motion) {
      finish(action, "interrupted");
      return fail("unknown_unit");
    }
    action.motion = motion;
    if (action.boatId !== null) steer.set(action.boatId, motion);
    schedule(action, arrivalAt(motion));
    return { ok: true };
  };

  /** 지금 유닛 칸 */
  const hereOf = (action: Action): CellPoint | undefined => {
    const where = unitAt(action);
    return where
      ? anchorAt(positionAt(where.info.motion, now()), bodySize(action, where.info.size))
      : undefined;
  };

  /** 오브젝트를 맡는 내 시설(그 레벨의 반경 안)을 다시 본다. 시설 창고가 가득이면 버프만 받고 넣기는 창고·도시로 */
  const planCamp = (action: Action, object: GatherObject): void => {
    const world = deps.places();
    const kind = kindOf(action);
    const camp =
      world && kind
        ? campFor(
            world,
            action.mapKey,
            kind.facility,
            object,
            deps.rules().gatherObjects,
            action.ownerId,
            works,
          )
        : undefined;
    const ctx = storageCtx();
    const room = camp && ctx ? roomGrams(ctx, camp.buildingId) : undefined;
    action.campLevel = camp?.level ?? null;
    action.deposit = camp && (room === undefined || room > 0n) ? campDeposit(camp) : null;
  };

  const goToObject = (action: Action): Promise<GatherCommandResult> => {
    const where = unitAt(action);
    const object = action.objectId === null ? undefined : objectsOf(action.mapKey)?.byId.get(action.objectId);
    if (!where || !object) {
      finish(action, "interrupted");
      return Promise.resolve(fail("unknown_object"));
    }
    const size = bodySize(action, where.info.size);
    const here = anchorAt(positionAt(where.info.motion, now()), size);
    // 어군(기획 D-536)은 지금 자리에서 낚는 거리(reach) 안 물가 설 칸으로. reach 0(배로만)이면 설 칸이 없다.
    // 배에서 캐는 줄은 배에서 캐는 거리 안 물 칸 가운데 배에서 가장 가까운 칸(이미 닿으면 그 자리)
    const afloat = action.boatId !== null;
    const reach = afloat
      ? reachOf(action, object)
      : object.route
        ? (deps.kinds()[object.kind]?.reach ?? 0)
        : OBJECT_STAND_CELLS;
    const goal =
      reach > 0
        ? standNear(
            where.map,
            livePlace(object, now()),
            size,
            reach,
            here,
            afloat || object.route !== undefined,
            afloat ? onWater : onLand,
          )
        : null;
    if (!goal) {
      finish(action, "no_path");
      return Promise.resolve(fail("no_path"));
    }
    return walk(action, goal, "to_object");
  };

  /** 배에서 캐는 거리(배치 칸, stand.ts boatReach) */
  const reachOf = (action: Action, object: GatherObject): number =>
    boatReach(deps.kinds()[object.kind] ?? {}, deps.rules().boats.gatherCells);

  /** 어군이 지금 유닛에서 낚는 거리(reach + 여유 2칸) 안인가. 어군이 아니면 늘 true(배에서 캐는 줄은 모든 오브젝트를 배에서 캐는 거리로 본다) */
  const withinReach = (action: Action, object: GatherObject): boolean => {
    if (!object.route && action.boatId === null) return true;
    const here = hereOf(action);
    if (!here) return false;
    const place = livePlace(object, now());
    const reach =
      (action.boatId === null ? (deps.kinds()[object.kind]?.reach ?? 0) : reachOf(action, object)) +
      SCHOOL_REACH_SLACK;
    return Math.max(Math.abs(place.x - here.x), Math.abs(place.y - here.y)) <= reach;
  };

  const goToDeposit = async (action: Action): Promise<void> => {
    const ctx = storageCtx();
    const here = hereOf(action);
    if (!ctx || !here) {
      finish(action, "interrupted");
      return;
    }
    if (!action.deposit || action.deposit.kind !== "camp")
      action.deposit = nearestStore(ctx, action.mapKey, action.ownerId, here, works, action.skip) ?? null;
    const deposit = action.deposit;
    const where = unitAt(action);
    if (!deposit || !where) {
      finish(action, deposit ? "interrupted" : "no_deposit");
      return;
    }
    const afloat = action.boatId !== null;
    const size = bodySize(action, where.info.size);
    const fits = afloat ? onWater : onLand;
    let goal = standNear(where.map, deposit, size, BUILDING_STAND_CELLS, here, false, fits);
    // 배: 창고·도시 둘레에 물이 없으면 내 부두에 대고 그 도시 창고로(deposit.ts dockDeposits)
    if (!goal && afloat && deposit.kind !== "camp")
      for (const dock of dockDeposits(ctx.world, action.mapKey, action.ownerId, here, works)) {
        goal = standNear(where.map, dock, size, BUILDING_STAND_CELLS, here, false, fits);
        if (!goal) continue;
        action.deposit = dock;
        break;
      }
    if (!goal) {
      // 배가 닿을 물이 넣는 곳 둘레에 없으면 승객이 든 채 끝(내린 뒤 들어가기로 넣는다)
      finish(action, afloat ? "no_deposit" : "no_path");
      return;
    }
    await walk(action, goal, "to_deposit");
  };

  /** 둘레 같은 종류의 남은 오브젝트(지금 오브젝트에서 가장 가까운 것) */
  const nextObject = (action: Action, from: GatherObject): GatherObject | undefined => {
    const kind = kindOf(action);
    const list = objectsOf(action.mapKey)?.list ?? [];
    const radius = deps.rules().gatherObjects.nextRadiusCells;
    const limit = radius * radius;
    let best: GatherObject | undefined;
    let bestDistance = 0;
    for (const object of list) {
      if (object.kind !== action.kindIndex || object.id === from.id) continue;
      const distance = cellDistance2(object.x, object.y, from.x, from.y);
      if (distance > limit) continue;
      if (!kind || deps.store.read(action.mapKey, object.id, kind.uses, now()).usesLeft <= 0) continue;
      if (!best || distance < bestDistance || (distance === bestDistance && object.id < best.id)) {
        best = object;
        bestDistance = distance;
      }
    }
    return best;
  };

  /** 지금 오브젝트가 떨어졌을 때: 다음 오브젝트로, 없으면 넣고 끝(든 것이 없으면 바로 끝) */
  const moveOn = async (action: Action): Promise<void> => {
    const object = action.objectId === null ? undefined : objectsOf(action.mapKey)?.byId.get(action.objectId);
    const next = object ? nextObject(action, object) : undefined;
    if (next) {
      action.objectId = next.id;
      planCamp(action, next);
      await goToObject(action);
      return;
    }
    if (carried(action) > 0n) {
      action.endAfterDeposit = "depleted";
      await goToDeposit(action);
      return;
    }
    finish(action, "depleted");
  };

  const beginGather = async (action: Action): Promise<void> => {
    const kind = kindOf(action);
    const where = unitAt(action);
    if (!kind || !where || action.objectId === null) {
      finish(action, "interrupted");
      return;
    }
    if (deps.store.read(action.mapKey, action.objectId, kind.uses, now()).usesLeft <= 0) {
      await moveOn(action);
      return;
    }
    // 어군이 헤엄쳐 멀어졌으면 다시 쫓아간다(물가 설 칸으로)
    const target = objectsOf(action.mapKey)?.byId.get(action.objectId);
    if (target && !withinReach(action, target)) {
      await goToObject(action);
      return;
    }
    const primary = statOf(deps.primaries(action.unitId), kind.primary) ?? 0;
    const duration = gatherDurationMs(kind, primary, deps.rules().productionMainDivisor);
    action.phase = "gathering";
    action.motion = where.info.motion;
    action.updatedAt = now();
    action.phaseAtMs = now();
    schedule(action, now() + duration);
  };

  /** 캐기 끝: 오브젝트 한 번 → 화물, 피로. 다음 단계를 고른다 */
  const doGather = async (action: Action): Promise<void> => {
    const kind = kindOf(action);
    const where = unitAt(action);
    const world = deps.places();
    if (!kind || !where || !world || action.objectId === null) {
      finish(action, "interrupted");
      return;
    }
    const object = objectsOf(action.mapKey)?.byId.get(action.objectId);
    if (!object) {
      finish(action, "interrupted");
      return;
    }
    // 캐는 동안 어군이 낚는 거리 밖으로 헤엄쳐 갔으면 이번 한 번은 놓치고 다시 쫓아간다
    if (!withinReach(action, object)) {
      await goToObject(action);
      return;
    }
    const rules = deps.rules();
    const at = now();
    const taken = deps.store.take(action.mapKey, object.id, kind.uses, at, () => {
      const camp = campFor(world, action.mapKey, kind.facility, object, rules.gatherObjects, null, works);
      return regrowMs(kind, rules.gatherObjects, deps.pollution(action.mapKey), camp?.level ?? null);
    });
    if (!taken) {
      await moveOn(action);
      return;
    }
    // 수확: 묶음 × 수확량(보조 스탯·시설 규칙) × 효율 → 기본 단위. 아이템 = 대표·굴림표·사다리 굴림(D-540 1222, objectYield.ts)
    const catalog = world.catalog();
    const rule = kind.facility === null ? undefined : catalog.facility(kind.facility)?.gather;
    const secondary = statOf(deps.primaries(action.unitId), kind.secondary) ?? 0;
    const asset = `item:${objectYieldItem(kind, catalog, {
      unitId: action.unitId,
      objectId: object.id,
      seq: action.yieldSeq++,
      primary: statOf(deps.primaries(action.unitId), kind.primary) ?? 0,
      secondary,
      level: action.campLevel ?? 1,
      levelBonus: rules.gatherLevelBonus,
    })}`;
    const efficiency = gatherEfficiencyPm(rules.gatherObjects, action.campLevel);
    const lots = splitPm(
      gatherYieldPm(kind, secondary, rule, rules.productionSubYieldPm, efficiency),
      action.yieldCarryPm,
    );
    action.yieldCarryPm = lots.carryPm;
    if (lots.whole > 0) {
      const qty = BigInt(lots.whole) * (catalog.lotSize.get(asset) ?? 1n);
      gatherIntoCargo(deps.ledger, action.ownerId, action.unitId, asset, qty, at);
      action.assets.add(asset);
      action.gatheredLots += lots.whole;
    }
    // 피로(시설 반경 안이면 덜)
    const fatigue = splitPm(gatherFatiguePm(rules.gatherObjects, action.campLevel), action.fatigueCarryPm);
    action.fatigueCarryPm = fatigue.carryPm;
    let tired = false;
    if (fatigue.whole > 0) {
      const job = where.info.job;
      const value = Math.min(rules.fatigueMax, job.fatigue + fatigue.whole);
      where.map.setJob(action.unitId, { ...job, fatigue: value });
      tired = value >= rules.fatigueMax;
    }
    // 채집 중 부상(D-521): 지난번 뒤로 지난 작업 주기 경계를 굴린다. 빨강(활동 불가)이면 그 자리에서 끝(든 화물은 그대로)
    if (deps.workInjury) {
      const fatigueNow = where.map.unitInfo(action.unitId)?.job.fatigue ?? where.info.job.fatigue;
      deps.workInjury(where.map, action.unitId, fatigueNow, rules.fatigueMax, action.injuryCheckedMs, at);
      action.injuryCheckedMs = at;
      const condition = where.map.unitInfo(action.unitId)?.condition;
      if (condition && unavailable(condition, at)) {
        finish(action, "interrupted");
        return;
      }
    }
    action.updatedAt = at;
    // 다음: 화물이 차면 넣으러, 피로 상한이면 넣고 끝, 오브젝트가 남았으면 또 캐기, 떨어졌으면 다음 오브젝트
    const weight =
      BigInt(catalog.unitWeightOf(asset.slice("item:".length)) ?? 0) * (catalog.lotSize.get(asset) ?? 1n);
    const full = carried(action) + weight > BigInt(capacity());
    if (tired) {
      action.endAfterDeposit = "tired";
      if (carried(action) > 0n) await goToDeposit(action);
      else finish(action, "tired");
      return;
    }
    if (full) {
      await goToDeposit(action);
      return;
    }
    if (deps.store.read(action.mapKey, object.id, kind.uses, now()).usesLeft > 0) {
      await beginGather(action);
      return;
    }
    await moveOn(action);
  };

  /** 넣는 곳에 닿음: 화물 → 넣는 곳. 다음: 끝낼 까닭이 있으면 끝, 아니면 오브젝트로 돌아가기 */
  const doDeposit = async (action: Action): Promise<void> => {
    const ctx = storageCtx();
    const deposit = action.deposit;
    if (!ctx || !deposit) {
      finish(action, "interrupted");
      return;
    }
    const before = carried(action);
    const moved = depositCargo(ctx, action.ownerId, action.unitId, action.assets, deposit, now());
    action.depositedUnits += Number(moved);
    if (carried(action) > 0n && before > 0n) {
      // 창고가 찼다: 다른 넣는 곳으로(시설이었으면 시설은 그대로 — 시설 창고 상한은 도시가 없는 시설만)
      action.skip.add(`${deposit.kind === "city" ? "city" : "storage"}:${deposit.id}`);
      const here = hereOf(action);
      const other =
        ctx && here ? nearestStore(ctx, action.mapKey, action.ownerId, here, works, action.skip) : undefined;
      if (!other) {
        finish(action, "storage_full");
        return;
      }
      action.deposit = other;
      await goToDeposit(action);
      return;
    }
    if (action.endAfterDeposit) {
      finish(action, action.endAfterDeposit);
      return;
    }
    const object = action.objectId === null ? undefined : objectsOf(action.mapKey)?.byId.get(action.objectId);
    if (object) planCamp(action, object);
    await goToObject(action);
  };

  /** 배에서 캐는 줄이 아직 그 배에 탔고, 배 움직임이 채집 줄이 준 것인가 */
  const shared = (action: Action, info: { readonly aboard: number | undefined; readonly motion: Motion }) =>
    action.boatId !== null && info.aboard === action.boatId && steer.get(action.boatId) === info.motion;

  const check = async (action: Action): Promise<void> => {
    if (action.motion === null) {
      // 길 찾기가 밀렸다: 그 단계를 다시 시작한다
      if (action.phase === "to_deposit") await goToDeposit(action);
      else if (action.phase === "entering" && action.buildingId !== null) await walkToBuilding(action);
      else await goToObject(action);
      return;
    }
    const where = unitAt(action);
    if (where && where.info.motion !== action.motion && shared(action, where.info)) {
      // 같은 배의 다른 승객 채집 줄이 배를 옮겼다: 하던 단계를 다시 찾아간다
      action.motion = null;
      if (action.phase === "to_deposit") await goToDeposit(action);
      else await goToObject(action);
      return;
    }
    if (!where || where.info.motion !== action.motion) {
      finish(action, "interrupted");
      return;
    }
    const arrive = arrivalAt(where.info.motion);
    if (now() < arrive) {
      schedule(action, arrive);
      return;
    }
    switch (action.phase) {
      case "to_object":
        await beginGather(action);
        return;
      case "gathering":
        await doGather(action);
        return;
      case "to_deposit":
        await doDeposit(action);
        return;
      case "entering":
        await arriveAtBuilding(action);
        return;
      default:
        finish(action, "interrupted");
    }
  };

  function runDue(): void {
    const at = now();
    const due = [...actions.values()]
      .filter((action) => action.checkAtMs !== null && action.checkAtMs <= at)
      .toSorted((a, b) => (a.checkAtMs ?? 0) - (b.checkAtMs ?? 0) || a.unitId - b.unitId);
    for (const action of due) {
      if (actions.get(action.unitId) !== action || action.checkAtMs === null || action.checkAtMs > at)
        continue;
      action.checkAtMs = null;
      check(action).catch((error: unknown) => {
        log.error({ err: error, unitId: action.unitId }, "gather step failed");
        finish(action, "interrupted");
      });
    }
    arm();
  }

  /** 내가 움직일 수 있는 유닛(내 소유, 수호신·봇 아님)과 그 자리 */
  const ownUnit = (userId: string, unitId: number) => {
    const ownerId = deps.ownerOf(userId);
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (!info) continue;
      if (
        ownerId === undefined ||
        info.ownerId !== ownerId ||
        info.kind === UNIT_KIND_GUARDIAN ||
        info.kind === UNIT_KIND_BOT
      )
        return { problem: "forbidden" as const };
      if (unavailable(info.condition, now())) return { problem: "unavailable" as const };
      return { ownerId, map, info };
    }
    return { problem: "unknown_unit" as const };
  };

  const newAction = (
    userId: string,
    ownerId: number,
    unitId: number,
    mapKey: number,
    kind: Action["kind"],
    boatId: number | null = null,
  ): Action => ({
    unitId,
    ownerId,
    boatId,
    userId,
    mapKey,
    kind,
    objectId: null,
    kindIndex: -1,
    buildingId: null,
    phase: kind === "gather" ? "to_object" : "entering",
    motion: null,
    checkAtMs: null,
    phaseAtMs: null,
    seq: 0,
    deposit: null,
    skip: new Set(),
    campLevel: null,
    yieldCarryPm: 0,
    fatigueCarryPm: 0,
    injuryCheckedMs: now(),
    assets: new Set(),
    yieldSeq: 0,
    gatheredLots: 0,
    depositedUnits: 0,
    endAfterDeposit: null,
    stop: null,
    enterResult: null,
    updatedAt: now(),
  });

  /** 아직 안에 머무는 유닛(움직였거나 사라진 유닛은 지운다 — 움직이면 나간다), 유닛 번호 차례 */
  const stillInside = (
    keep: (entry: { buildingId: number; mapKey: number }) => boolean,
  ): { unitId: number; buildingId: number; ownerId: number }[] => {
    const out: { unitId: number; buildingId: number; ownerId: number }[] = [];
    for (const [unitId, entry] of inside) {
      if (!keep(entry)) continue;
      const info = maps.get(entry.mapKey)?.unitInfo(unitId);
      if (!info || info.motion !== entry.motion) {
        inside.delete(unitId);
        continue;
      }
      out.push({ unitId, buildingId: entry.buildingId, ownerId: entry.ownerId });
    }
    return out.toSorted((a, b) => a.unitId - b.unitId);
  };

  /** 앞 줄을 버리고 새 줄을 둔다(안에 머묾도 끝) */
  const replace = (action: Action): void => {
    const old = actions.get(action.unitId);
    if (old) {
      actions.delete(action.unitId);
      old.seq += 1;
      old.checkAtMs = null;
    }
    inside.delete(action.unitId);
    recent.delete(action.unitId);
    actions.set(action.unitId, action);
  };

  /** 채집 줄 시작(소유·상태는 부르는 쪽이 봤다) */
  async function begin(
    userId: string,
    unit: {
      readonly ownerId: number;
      readonly map: SecondMap;
      readonly info: { readonly aboard: number | undefined };
    },
    input: { unitId: number; mapKey: number; objectId: number },
  ): Promise<GatherCommandResult> {
    if (unit.map.mapKey !== input.mapKey) return fail("wrong_map");
    const object = objectsOf(input.mapKey)?.byId.get(input.objectId);
    const kind = object ? deps.kinds()[object.kind] : undefined;
    if (!object || !kind) return fail("unknown_object");
    // 밭·목초지·물터는 맡는 시설의 일꾼만 쓴다(사용자 답 D-519, docs/adr/2026-11-11-city-catchment.md)
    if (!kind.direct) return fail("unavailable");
    // 배에 탄 유닛은 바다 오브젝트만, 걷는 유닛은 배로만 닿는 오브젝트를 못 캔다(D-541 1280 가). 남의 배면 배를 몰 수 없다
    const boatId = unit.info.aboard ?? null;
    const boat = boatId === null ? undefined : unit.map.unitInfo(boatId);
    if (boatId !== null && (boat?.ownerId !== unit.ownerId || !seaObject(kind, object.route !== undefined)))
      return fail("unavailable");
    if (boatId === null && kind.boat === true) return fail("unavailable");
    if (deps.store.read(input.mapKey, object.id, kind.uses, now()).usesLeft <= 0) return fail("depleted");
    if (!(await freeUnit(userId, unit.ownerId, input.unitId))) return fail("unavailable");
    // 한 배의 승객들은 같은 오브젝트만 함께 캔다: 다른 오브젝트를 캐던 같은 배의 줄은 끝낸다(배가 오가지 않게, 질문 1400)
    if (boatId !== null)
      for (const other of actions.values())
        if (other.boatId === boatId && other.unitId !== input.unitId && other.objectId !== object.id)
          finish(other, "interrupted");
    const action = newAction(userId, unit.ownerId, input.unitId, input.mapKey, "gather", boatId);
    action.objectId = object.id;
    action.kindIndex = object.kind;
    replace(action);
    planCamp(action, object);
    return goToObject(action);
  }

  /** 묶인 유닛: 내가 내 시설에 배치한 유닛이면 배치를 풀고 쓴다(채집을 시킨다), 아니면 unavailable */
  const freeUnit = async (userId: string, ownerId: number, unitId: number): Promise<boolean> => {
    if (!deps.unitBusy(unitId)) return true;
    if (deps.assignedBy?.(ownerId, unitId) === undefined || !deps.unassign) return false;
    return (await deps.unassign(userId, unitId)).ok && !deps.unitBusy(unitId);
  };

  async function walkToBuilding(action: Action): Promise<GatherCommandResult> {
    const world = deps.places();
    const where = unitAt(action);
    const cell =
      world && action.buildingId !== null
        ? (() => {
            let found: CellPoint | undefined;
            maps.get(action.mapKey)?.forEachBuilding((building) => {
              if (building.id === action.buildingId) found = { x: building.x, y: building.y };
            });
            return found;
          })()
        : undefined;
    if (!where || !cell) {
      finish(action, "interrupted");
      return fail("unknown_building");
    }
    const here = anchorAt(positionAt(where.info.motion, now()), where.info.size);
    const goal = standNear(where.map, cell, where.info.size, BUILDING_STAND_CELLS, here);
    if (!goal) {
      finish(action, "no_path");
      return fail("no_path");
    }
    return walk(action, goal, "entering");
  }

  async function arriveAtBuilding(action: Action): Promise<void> {
    const ctx = storageCtx();
    const where = unitAt(action);
    if (!ctx || !where || action.buildingId === null) {
      finish(action, "interrupted");
      return;
    }
    const result = await enterBuilding({
      ctx,
      kinds: deps.kinds(),
      ownerId: action.ownerId,
      userId: action.userId,
      unitId: action.unitId,
      buildingId: action.buildingId,
      idle: where.info.job.job === JOB_NONE && !deps.unitBusy(action.unitId),
      works,
      assign: deps.assign,
      atMs: now(),
    });
    if (actions.get(action.unitId) !== action) return;
    action.enterResult = result.result;
    action.depositedUnits += result.moved;
    finish(action, "entered");
    const motion = maps.get(action.mapKey)?.unitInfo(action.unitId)?.motion;
    if (result.result === "inside" && motion)
      inside.set(action.unitId, {
        buildingId: action.buildingId,
        ownerId: action.ownerId,
        mapKey: action.mapKey,
        motion,
      });
  }

  return {
    async start(userId, input) {
      if (!deps.ready()) return fail("busy");
      const unit = ownUnit(userId, input.unitId);
      if ("problem" in unit) return fail(unit.problem);
      return begin(userId, unit, input);
    },
    async startAs(ownerId, input) {
      if (!deps.ready()) return fail("busy");
      const map = maps.get(input.mapKey);
      const info = map?.unitInfo(input.unitId);
      if (!map || !info) return fail("unknown_unit");
      if (info.ownerId !== ownerId) return fail("forbidden");
      if (unavailable(info.condition, now())) return fail("unavailable");
      return begin("", { ownerId, map, info }, input);
    },
    halt(userId, unitId) {
      const action = actions.get(unitId);
      const ownerId = deps.ownerOf(userId);
      // 건물 안에 머무는 내 유닛이면 나온다(건물 판 [나가기], 사용자 답 2026-11-15 "숨기고 건물에 표시") — 자리는 그대로(건물 둘레 설 칸)
      const stay = action ? undefined : inside.get(unitId);
      if (stay && ownerId !== undefined && stay.ownerId === ownerId) {
        inside.delete(unitId);
        return { ok: true };
      }
      if (!action || ownerId === undefined || action.ownerId !== ownerId) return fail("not_gathering");
      maps.get(action.mapKey)?.halt(unitId);
      finish(action, "stopped");
      return { ok: true };
    },
    async enter(userId, input) {
      if (!deps.ready()) return fail("busy");
      const unit = ownUnit(userId, input.unitId);
      if ("problem" in unit) return fail(unit.problem);
      let found = false;
      unit.map.forEachBuilding((building) => {
        if (building.id === input.buildingId) found = true;
      });
      if (!found) {
        for (const map of maps.values())
          map.forEachBuilding((building) => {
            if (building.id === input.buildingId) found = true;
          });
        return fail(found ? "wrong_map" : "unknown_building");
      }
      const action = newAction(userId, unit.ownerId, input.unitId, unit.map.mapKey, "enter");
      action.buildingId = input.buildingId;
      replace(action);
      return walkToBuilding(action);
    },
    objects: (mapKey) => objectsOf(mapKey)?.list,
    objectsAt(mapKey, nowMs) {
      const list = objectsOf(mapKey)?.list;
      if (!list) return undefined;
      return list.some((object) => object.route)
        ? list.map((object) => (object.route ? { ...object, ...livePlace(object, nowMs) } : object))
        : list;
    },
    loops(userId) {
      const ownerId = deps.ownerOf(userId);
      if (ownerId === undefined) return [];
      prune();
      const out: GatherLoopView[] = [];
      for (const action of actions.values()) if (action.ownerId === ownerId) out.push(viewOf(action));
      for (const view of recent.values())
        if (view.ownerId === ownerId && !actions.has(view.unitId)) {
          const { ownerId: _owner, ...rest } = view;
          out.push(rest);
        }
      return out.toSorted((a, b) => a.unitId - b.unitId);
    },
    insideOf(buildingId) {
      return stillInside((entry) => entry.buildingId === buildingId).map(({ unitId, ownerId }) => ({
        unitId,
        ownerId,
      }));
    },
    insideOn(mapKey) {
      return stillInside((entry) => entry.mapKey === mapKey);
    },
    runDue,
    acting: (unitId) => actions.has(unitId),
    get active() {
      return actions.size;
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
