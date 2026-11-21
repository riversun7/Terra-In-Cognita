// 개별 유닛 7축 성향 레지스트리 — docs/adr/2026-11-20-npc-autonomous-ai.md
// world_units.traits(길이 7 smallint[])가 저장돼 있으면 그대로 복원하고,
// 없으면 (세계 시드, 유닛 ID, 직군, 소속 국가 바탕 성향, AI 생성 범위)로 결정적 생성 후 캐시·저장한다.
import { createRng } from "@terra/shared";
import {
  DEFAULT_UNIT_TRAITS,
  type TraitRole,
  type UnitTraits,
  driftUnitTraits,
  rollUnitTraits,
  unitTraitsFromArray,
  unitTraitsToArray,
} from "@terra/shared/unitTraits";
import { mix32 } from "@terra/sim";
import { type NpcAiCoefficients, roleRangesFromAi } from "@terra/sim/npcAi";

export interface UnitTraitStore {
  /** 유닛의 7축 성향을 조회한다(캐시 → 저장 배열 → 결정적 생성) */
  getOrCreate(input: {
    readonly unitId: number;
    readonly role: TraitRole;
    readonly persisted?: readonly number[] | null | undefined;
    readonly anchor?: UnitTraits | undefined;
    readonly ai: NpcAiCoefficients;
    /** 처음 생성한 성향을 2차맵/DB에 저장하는 선택 콜백 */
    readonly persist?: ((values: readonly number[]) => void) | undefined;
  }): UnitTraits;
  /** 캐시된 성향만 조회(없으면 undefined) */
  peek(unitId: number): UnitTraits | undefined;
  /** 성향 직접 지정(운영자 수정·환생·DB 복원) */
  set(unitId: number, traits: UnitTraits): void;
  /** 유닛 사망·제거 시 캐시 정리 */
  delete(unitId: number): void;
  /** 캐시에 들어 있는 유닛 ID 목록 */
  keys(): Iterable<number>;
  readonly size: number;
}

/** (세계 시드, 유닛 ID) → 결정적 성향 생성용 난수 */
function traitRng(worldSeed: number, unitId: number) {
  return createRng(mix32(worldSeed ^ Math.imul(unitId, 0x9e37_79b1) ^ 0x51f1_5e13));
}

export function createUnitTraitRegistry(worldSeed: number): UnitTraitStore {
  const cache = new Map<number, UnitTraits>();

  return {
    getOrCreate(input) {
      const cached = cache.get(input.unitId);
      if (cached) return cached;
      const restored = unitTraitsFromArray(input.persisted);
      if (restored) {
        cache.set(input.unitId, restored);
        return restored;
      }
      const ranges = roleRangesFromAi(input.role, input.ai);
      const rng = traitRng(worldSeed, input.unitId);
      const anchor = input.anchor ?? DEFAULT_UNIT_TRAITS;
      const generated =
        input.anchor !== undefined
          ? driftUnitTraits(anchor, input.ai.unitTraitSpread, rng, ranges)
          : rollUnitTraits(rng, ranges);
      cache.set(input.unitId, generated);
      input.persist?.(unitTraitsToArray(generated));
      return generated;
    },

    peek(unitId) {
      return cache.get(unitId);
    },

    set(unitId, traits) {
      cache.set(unitId, traits);
    },

    delete(unitId) {
      cache.delete(unitId);
    },

    keys() {
      return cache.keys();
    },

    get size() {
      return cache.size;
    },
  };
}
