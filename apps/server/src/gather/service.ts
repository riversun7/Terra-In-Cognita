// 원자재 오브젝트 채집·건물 들어가기 서비스 — docs/adr/2026-11-07-gather-objects.md 3·5절, 사용자 지적(2026-11-07) 문제 2·3과 사용자 답(원문은 ADR).
// - 채집 줄(유닛 하나에 하나): 오브젝트 옆 설 칸으로 걷기 → 캐기(일 ÷ 진행 속도) → 화물(원장 유닛 화물 위치)에 넣기 → 화물이 차면 넣는 곳(맡는 시설·
//   창고·도시)으로 걷기 → 넣기 → 오브젝트로 돌아오기를 멈출 때·넣는 곳이 찰 때·피로 상한·둘레 같은 종류가 모두 떨어질 때까지 되풀이한다.
//   오브젝트가 떨어지면 반경 안 가장 가까운 같은 종류 오브젝트로 옮긴다. 걷기는 그 2차맵 길 찾기(moveUnit)이고 도착 시각에 확인한다(이동 서비스와 같은 틀).
// - 들어가기: 건물 둘레 설 칸으로 걷고 닿으면 차례로 — 화물 넣기(내 창고·맡는 시설·시청) → 직무 받기(내 채집 시설, 기존 직무 배치) → 안에 머물기.
//   안에 머문 유닛은 움직임이 바뀌면(다른 명령) 나간 것으로 본다.
// - 서버 권위: 소유·거리·오브젝트 상태·원장은 서버가 정한다. 기기는 유닛·오브젝트 번호·건물만 보낸다.
// - 길에서 벗어남(확인할 때 움직임이 바뀜·유닛 없음) = interrupted. 같은 유닛에 새 명령이 오면 앞 줄을 버린다.
// [임시] 채집 줄·안에 머묾은 메모리에만 둔다(다시 켜면 유닛은 그 자리에 선다. 든 화물은 원장에 남는다 — 확인 대기, 질문 670).
import type { GatherResultCode, ResultCode } from "@terra/protocol";
import type { GatherLoopView, GatherPhase, GatherStop } from "@terra/shared/gather";
import {
  type CellPoint,
  JOB_NONE,
  type Motion,
  PLACEMENT_SIZE,
  type Primaries,
  type SizeClass,
  type SocietyCoefficients,
  anchorAt,
  anchorCenter,
  arrivalAt,
  positionAt,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import { type StorageContext, roomGrams } from "../facilities/storage.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { type GatherInjuryHook, unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_BOT, UNIT_KIND_GUARDIAN } from "../world/unitKinds.ts";
import { statOf } from "../labor/gatherWork.ts";
import {
  type Deposit,
  campDeposit,
  campFor,
  carriedGrams,
  depositCargo,
  gatherIntoCargo,
  nearestStore,
} from "./deposit.ts";
import { enterBuilding } from "./enter.ts";
import type { GatherKind } from "./kinds.ts";
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
import type { ObjectStore } from "./state.ts";
import { mapLayers } from "./terrainLayers.ts";

/** 끝난 줄을 화면에 보이는 시간(ms) */
export const RECENT_MS = 10 * 60_000;
/** 길 찾기가 밀렸을 때 다시 해 보기까지(ms) */
const RETRY_MS = 2_000;
/** 오브젝트 둘레 설 칸 찾는 반경(배치 칸) */
const OBJECT_STAND_CELLS = 4;
/** 건물·도시 둘레 설 칸 찾는 반경(배치 칸) */
const BUILDING_STAND_CELLS = 14;
/** setTimeout 지연 상한 */
const MAX_TIMER_MS = 0x7fff_ffff;

export type GatherCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: GatherResultCode };

export interface GatherDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
  readonly kinds: () => readonly GatherKind[];
  readonly rules: () => SocietyCoefficients;
  readonly ledger: Ledger;
  readonly store: ObjectStore;
  /** 사용자의 소유 주체(없으면 내 유닛 없음) */
  ownerOf(userId: string): number | undefined;
  /** 물자 자리 세계(건물 서비스가 만든다) */
  places(): PlaceWorld | undefined;
  /** 그 건물이 일하나(상태 문턱) */
  works(buildingId: number): boolean;
  /** 직무 배치·노동 계약·건물 작업에 묶였나 */
  unitBusy(unitId: number): boolean;
  /** 내가 내 시설에 배치한 유닛이면 그 시설(직무를 풀고 채집을 시킬 수 있다), 아니면 undefined */
  assignedBy?: ((ownerId: number, unitId: number) => number | undefined) | undefined;
  /** 직무 배치 풀기(채집을 시키기 전) */
  unassign?: ((userId: string, unitId: number) => Promise<{ readonly ok: boolean }>) | undefined;
  /** 직무 배치(들어가기: 내 채집 시설) */
  assign?:
    | ((userId: string, buildingId: number, unitId: number) => Promise<{ readonly ok: boolean }>)
    | undefined;
  /** 그 시설에서 일하는 유닛(건물 판) */
  workersAt?: ((buildingId: number) => readonly { readonly unitId: number }[]) | undefined;
  /** 유닛 1차 스탯(입은 장비·버프 포함) */
  primaries(unitId: number): Primaries;
  /** 2차맵(= 1차맵 칸)의 오염 값(0 ~ 100,000) */
  pollution(mapKey: number): number;
  /**
   * 2차맵(1차맵 칸) 행성 값의 원자재 비트(@terra/shared/catchment cellMaterials — 밭·목초지의 기후 조건). 없거나 undefined면 보지 않는다
   * (행성 값 없는 임시 지형). 오브젝트 목록은 지형 판 표지마다 한 번 만들므로 문턱 설정 칸을 바꾸면 다음 시작 때 든다
   */
  materials?(mapKey: number): number | undefined;
  /**
   * 채집 중 부상(docs/adr/2026-11-08-injury.md 5절, world/unitCondition.ts createGatherInjury): 캐기가 끝날 때마다 지난번 뒤로 지난 작업 주기
   * 경계를 굴린다. 없으면 다치지 않는다(시험)
   */
  workInjury?: GatherInjuryHook | undefined;
  ready(): boolean;
}

interface Action {
  readonly unitId: number;
  readonly ownerId: number;
  readonly userId: string;
  readonly mapKey: number;
  readonly kind: "gather" | "enter";
  objectId: number | null;
  kindIndex: number;
  buildingId: number | null;
  phase: GatherPhase;
  motion: Motion | null;
  checkAtMs: number | null;
  seq: number;
  deposit: Deposit | null;
  /** 넣을 때 건너뛸 넣는 곳(가득 찬 창고) */
  readonly skip: Set<string>;
  /** 이 오브젝트를 맡는 내 시설 레벨(반경 안이면), 아니면 null */
  campLevel: number | null;
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

export interface GatherService {
  start(
    userId: string,
    input: { unitId: number; mapKey: number; objectId: number },
  ): Promise<GatherCommandResult>;
  /** 채집을 멈춘다(그 자리에 선다, 든 화물은 그대로) */
  halt(userId: string, unitId: number): GatherCommandResult;
  enter(userId: string, input: { unitId: number; buildingId: number }): Promise<GatherCommandResult>;
  /** 그 2차맵의 오브젝트(자리는 지형에서, 상태는 저장소에서) */
  objects(mapKey: number): readonly GatherObject[] | undefined;
  /** 내 줄(진행 중 + 최근 끝난 것) */
  loops(userId: string): GatherLoopView[];
  /** 그 건물 안 유닛(들어가기로 머묾) */
  insideOf(buildingId: number): readonly { readonly unitId: number; readonly ownerId: number }[];
  runDue(): void;
  readonly active: number;
  stop(): void;
}

const fail = (code: GatherResultCode): GatherCommandResult => ({ ok: false, code });

/** 2차맵 이동 명령 결과 → 채집 결과 코드 */
function commandCode(code: ResultCode): GatherResultCode {
  if (code === "busy" || code === "superseded") return "busy";
  if (code === "unknown_unit") return "unknown_unit";
  if (code === "invalid_request") return "unavailable";
  return "no_path";
}

/** 목표 칸에서 가장 가까운 설 칸(체비쇼프 고리, 고리 안은 from에 가까운 칸). 없으면 null */
function standNear(
  map: SecondMap,
  target: CellPoint,
  size: SizeClass,
  radius: number,
  from: CellPoint,
): CellPoint | null {
  const top = PLACEMENT_SIZE - size;
  for (let ring = 0; ring <= radius; ring++) {
    let best: CellPoint | null = null;
    let bestDistance = 0;
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cell = { x: target.x + dx, y: target.y + dy };
        if (cell.x < 0 || cell.y < 0 || cell.x > top || cell.y > top) continue;
        if (!map.isStandable(cell.x, cell.y, size)) continue;
        const distance = cellDistance2(cell.x, cell.y, from.x, from.y);
        if (!best || distance < bestDistance) {
          best = cell;
          bestDistance = distance;
        }
      }
    if (best) return best;
  }
  return null;
}

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
    const list = placeGatherObjects({ ...mapLayers(map), materials: deps.materials?.(mapKey) }, deps.kinds());
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

  /** 걸어서 그 칸(설 칸)으로 간다. 이미 서 있으면 바로 확인 */
  const walk = async (action: Action, goal: CellPoint, phase: GatherPhase): Promise<GatherCommandResult> => {
    action.seq += 1;
    const seq = action.seq;
    action.phase = phase;
    action.motion = null;
    action.checkAtMs = null;
    action.updatedAt = now();
    const where = unitAt(action);
    if (!where) {
      finish(action, "interrupted");
      return fail("unknown_unit");
    }
    const at = now();
    const here = anchorAt(positionAt(where.info.motion, at), where.info.size);
    if (here.x === goal.x && here.y === goal.y && at >= arrivalAt(where.info.motion)) {
      action.motion = where.info.motion;
      schedule(action, at);
      return { ok: true };
    }
    const result = await where.map.moveUnit(action.unitId, anchorCenter(goal.x, goal.y, where.info.size));
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
    schedule(action, arrivalAt(motion));
    return { ok: true };
  };

  /** 지금 유닛 칸 */
  const hereOf = (action: Action): CellPoint | undefined => {
    const where = unitAt(action);
    return where ? anchorAt(positionAt(where.info.motion, now()), where.info.size) : undefined;
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
    const here = anchorAt(positionAt(where.info.motion, now()), where.info.size);
    const goal = standNear(where.map, object, where.info.size, OBJECT_STAND_CELLS, here);
    if (!goal) {
      finish(action, "no_path");
      return Promise.resolve(fail("no_path"));
    }
    return walk(action, goal, "to_object");
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
    const goal = standNear(where.map, deposit, where.info.size, BUILDING_STAND_CELLS, here);
    if (!goal) {
      finish(action, "no_path");
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
    const primary = statOf(deps.primaries(action.unitId), kind.primary) ?? 0;
    const duration = gatherDurationMs(kind, primary, deps.rules().productionMainDivisor);
    action.phase = "gathering";
    action.motion = where.info.motion;
    action.updatedAt = now();
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
    // 수확: 묶음 × 수확량(보조 스탯·시설 규칙) × 효율 → 기본 단위
    const asset = `item:${kind.item}`;
    const catalog = world.catalog();
    const rule = kind.facility === null ? undefined : catalog.facility(kind.facility)?.gather;
    const secondary = statOf(deps.primaries(action.unitId), kind.secondary) ?? 0;
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
    const weight = BigInt(catalog.unitWeightOf(kind.item) ?? 0) * (catalog.lotSize.get(asset) ?? 1n);
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

  const check = async (action: Action): Promise<void> => {
    if (action.motion === null) {
      // 길 찾기가 밀렸다: 그 단계를 다시 시작한다
      if (action.phase === "to_deposit") await goToDeposit(action);
      else if (action.phase === "entering" && action.buildingId !== null) await walkToBuilding(action);
      else await goToObject(action);
      return;
    }
    const where = unitAt(action);
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
  ): Action => ({
    unitId,
    ownerId,
    userId,
    mapKey,
    kind,
    objectId: null,
    kindIndex: -1,
    buildingId: null,
    phase: kind === "gather" ? "to_object" : "entering",
    motion: null,
    checkAtMs: null,
    seq: 0,
    deposit: null,
    skip: new Set(),
    campLevel: null,
    yieldCarryPm: 0,
    fatigueCarryPm: 0,
    injuryCheckedMs: now(),
    assets: new Set(),
    gatheredLots: 0,
    depositedUnits: 0,
    endAfterDeposit: null,
    stop: null,
    enterResult: null,
    updatedAt: now(),
  });

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
      if (unit.map.mapKey !== input.mapKey) return fail("wrong_map");
      const objects = objectsOf(input.mapKey);
      const object = objects?.byId.get(input.objectId);
      const kind = object ? deps.kinds()[object.kind] : undefined;
      if (!object || !kind) return fail("unknown_object");
      // 밭·목초지·물터는 맡는 시설의 일꾼만 쓴다(사용자 답 D-519, docs/adr/2026-11-11-city-catchment.md)
      if (!kind.direct) return fail("unavailable");
      if (deps.store.read(input.mapKey, object.id, kind.uses, now()).usesLeft <= 0) return fail("depleted");
      if (!(await freeUnit(userId, unit.ownerId, input.unitId))) return fail("unavailable");
      const action = newAction(userId, unit.ownerId, input.unitId, input.mapKey, "gather");
      action.objectId = object.id;
      action.kindIndex = object.kind;
      replace(action);
      planCamp(action, object);
      return goToObject(action);
    },
    halt(userId, unitId) {
      const action = actions.get(unitId);
      const ownerId = deps.ownerOf(userId);
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
      const out: { unitId: number; ownerId: number }[] = [];
      for (const [unitId, entry] of inside) {
        if (entry.buildingId !== buildingId) continue;
        const info = maps.get(entry.mapKey)?.unitInfo(unitId);
        if (!info || info.motion !== entry.motion) {
          inside.delete(unitId);
          continue;
        }
        out.push({ unitId, ownerId: entry.ownerId });
      }
      return out.toSorted((a, b) => a.unitId - b.unitId);
    },
    runDue,
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
