// 유닛 생활 규칙 저장소(쉬러 가는 피로·다시 일하는 피로) — 사용자 결정 2026-11-26, docs/adr/2026-11-26-unit-life-rules.md. 값 모양·성향 기본값은
// @terra/shared/unitLife. 틀은 유닛 AI 작전 저장소(tactics/store.ts)와 같다.
// - 표 unit_life_rules(유닛당 한 줄)를 세계가 준비된 뒤 한 번 읽어 메모리에 들고(정산은 동기로 묻는다), 저장은 메모리 + 월드 쓰기 대기열.
// - 저장(프로토콜 75 unit_life → travel/gateway.ts): 로그인한 사용자의 판단하는 유닛(사이보그 본체·휴먼·사이보그 유닛)만. 저장하기 전에 그 주체를
//   지금까지 정산한다(지난 시간은 옛 규칙으로 — 상호작용 전 정산).
// - 저장한 줄이 없으면 성향 기본값(of): 첫 불이익 구간 시작 ± 규율 성향. 저장한 값은 실효 피로 상한에 맞게 잘라 쓴다.
// 세계 저장 층마다 하나(WeakMap).
import type { TravelResultCode } from "@terra/protocol";
import {
  type UnitLifeRules,
  clampLifeRules,
  defaultLifeRules,
  isUnitLifeRules,
} from "@terra/shared/unitLife";
import type { SocietyCoefficients } from "@terra/sim";
import { TACTICS_KINDS } from "../tactics/store.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { isGuardianUnit } from "../world/unitKinds.ts";

/** 규율 성향의 자리(@terra/shared/unitTraits UNIT_TRAIT_AXES — belligerence·greed·boldness·communalism·autonomy·openness·discipline) */
const DISCIPLINE_AXIS = 6;

export type LifeSetResult = { readonly ok: true } | { readonly ok: false; readonly code: TravelResultCode };

/** 화면·정산이 읽는 한 유닛의 규칙(saved = 주인이 정한 값인가) */
export interface UnitLifeView extends UnitLifeRules {
  readonly saved: boolean;
}

export interface UnitLifeStore {
  /** 주인이 저장한 규칙(없으면 undefined) */
  get(unitId: number): UnitLifeRules | undefined;
  /** 실효 규칙: 저장한 값(실효 상한에 맞게 자름) → 없으면 성향 기본값 */
  of(unitId: number): UnitLifeView;
  /** 피로 상한(설정 칸 실효 값 — 운영 조회가 NPC 일꾼의 어림 피로 ‰를 같은 눈금으로 바꾼다) */
  fatigueMax(): number;
  /** 내 유닛의 규칙을 저장한다(소유·종류·모양 검사) */
  set(userId: string, unitId: number, rules: UnitLifeRules): LifeSetResult;
  /** 표를 다 읽었을 때 끝난다(시험) */
  readonly loaded: Promise<void>;
}

/** 저장소가 읽는 세계 몫 */
export interface LifeWorld {
  readonly maps: ReadonlyMap<number, Pick<SecondMap, "unitInfo">>;
  readonly persistence:
    | {
        readonly pool: QueryPool;
        readonly writer: Pick<WorldWriter, "upsert">;
        readonly settlement: {
          findOwnerOfUser(userId: string): number | undefined;
          settleOwner(ownerId: number, toMs: number): unknown;
        };
      }
    | undefined;
  readonly now: () => number;
  /** 설정 칸 실효 값(피로 상한·구간) */
  readonly rules: () => Pick<SocietyCoefficients, "fatigueMax" | "fatigueBands">;
}

const stores = new WeakMap<object, UnitLifeStore>();

/** 세계 저장 층에 붙은 저장소(없으면 undefined) */
export function unitLifeOf(persistence: object | undefined): UnitLifeStore | undefined {
  return persistence ? stores.get(persistence) : undefined;
}

/** 첫 불이익 구간의 시작 피로(능력 ‰가 1000보다 작은 첫 구간). 없으면 피로 상한 */
export function penaltyFromOf(c: Pick<SocietyCoefficients, "fatigueMax" | "fatigueBands">): number {
  let from = c.fatigueMax;
  for (const band of c.fatigueBands) if (band.abilityPm < 1000 && band.from < from) from = band.from;
  return from;
}

/** 저장소를 만들어 세계 저장 층에 붙인다(이미 있으면 그것). 세계 저장 층이 없으면 undefined */
export function attachUnitLife(
  world: LifeWorld,
  log?: { error(obj: object, message: string): void },
  key?: object,
): UnitLifeStore | undefined {
  const persistence = world.persistence;
  if (!persistence) return undefined;
  const owner = key ?? persistence;
  const known = stores.get(owner);
  if (known) return known;
  const table = new Map<number, UnitLifeRules>();
  /** 읽는 동안 저장한 유닛(읽은 옛 줄로 덮지 않는다) */
  const touched = new Set<number>();
  const loaded = persistence.pool
    .query("select unit_id, rest_at, resume_at from unit_life_rules")
    .then((result) => {
      for (const row of result.rows) {
        const unitId = Number(row.unit_id);
        const value = { restAt: Number(row.rest_at), resumeAt: Number(row.resume_at) };
        if (isUnitLifeRules(value) && !touched.has(unitId)) table.set(unitId, value);
      }
    })
    .catch((error: unknown) => log?.error({ err: error }, "unit life: load failed"));

  const infoOf = (unitId: number) => {
    for (const map of world.maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info;
    }
    return undefined;
  };

  const store: UnitLifeStore = {
    get: (unitId) => table.get(unitId),
    fatigueMax: () => world.rules().fatigueMax,
    of(unitId) {
      const c = world.rules();
      const saved = table.get(unitId);
      if (saved) return { ...clampLifeRules(saved, c.fatigueMax), saved: true };
      const rules = defaultLifeRules({
        penaltyFrom: penaltyFromOf(c),
        fatigueMax: c.fatigueMax,
        discipline: infoOf(unitId)?.traits?.[DISCIPLINE_AXIS],
      });
      return { ...rules, saved: false };
    },
    set(userId, unitId, rules) {
      if (!isUnitLifeRules(rules, world.rules().fatigueMax)) return { ok: false, code: "forbidden" };
      const ownerId = persistence.settlement.findOwnerOfUser(userId);
      if (ownerId === undefined) return { ok: false, code: "unknown_unit" };
      const info = infoOf(unitId);
      if (!info) return { ok: false, code: "unknown_unit" };
      if (info.ownerId !== ownerId || isGuardianUnit(info) || !TACTICS_KINDS.has(info.kind))
        return { ok: false, code: "forbidden" };
      // 지난 시간은 옛 규칙으로 정산한 뒤 바꾼다
      persistence.settlement.settleOwner(ownerId, world.now());
      const value: UnitLifeRules = { restAt: rules.restAt, resumeAt: rules.resumeAt };
      table.set(unitId, value);
      touched.add(unitId);
      persistence.writer.upsert("unitLifeRules", {
        unit_id: unitId,
        rest_at: value.restAt,
        resume_at: value.resumeAt,
        updated_at_ms: world.now(),
      });
      return { ok: true };
    },
    loaded: loaded.then(() => undefined),
  };
  stores.set(owner, store);
  return store;
}
