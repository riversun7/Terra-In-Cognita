// 유닛 생명 수치 서비스를 월드에 잇는다 — 기획 D-512. world.ts가 부팅 복구 때 한 번 부른다.
// - 세계 유닛이 있는지는 2차맵 메모리에서, 사이보그 본체의 몸 자료(최대 HP·아머·쉴드, 쉴드 재생)는 사이보그 화면과 같은 셈
//   (config.cyborgBody)에서 읽는다. 그 밖 유닛은 저장한 줄(전투 사양 값)이나 유닛 상세와 같은 기본 몸 자료(config.defaultBody)다.
//   둘 다 입은 장비·1차 스탯 버프를 넣는다(gearOf = 보유 물건, 최대 HP·쉴드가 장비를 따른다).
// - 1분마다 세계에 없는 유닛의 줄과 다 찬 줄을 지운다(값은 읽을 때 셈하므로 주기 타이머가 값을 고치지는 않는다).
import type { VitalsListResponse, VitalsView } from "@terra/shared/vitals";
import { TEST_SOCIETY_COEFFICIENTS, stageHealMs } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { CyborgRecord } from "../cyborg/state.ts";
import { type BodyBase, NO_GEAR, type UnitGear } from "../roster/unitBody.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";
import { injuryNowOf, injuryRules } from "../world/unitCondition.ts";
import type { VitalsModifiers } from "./phases.ts";
import { type VitalsService, createVitalsService } from "./service.ts";
import type { VitalsBody, VitalsRecord } from "./state.ts";

/** 월드 설정의 생명 수치 칸(app.ts가 팩 가중치 표로 만든다). 없으면 몸 자료를 모른다(저장한 줄만 보인다) */
export interface VitalsConfig {
  /** 사이보그 본체의 몸 자료(사이보그 화면과 같은 셈의 2차 스탯, 입은 장비·버프 포함) */
  readonly cyborgBody?: ((record: CyborgRecord, gear: UnitGear) => VitalsBody) | undefined;
  /** 그 밖 유닛의 몸 자료(유닛 상세와 같은 셈: [임시] 1차 모두 10 + 입은 장비·버프) */
  readonly defaultBody?: ((gear: UnitGear, base?: BodyBase) => VitalsBody) | undefined;
  /** 부상 단계별 HP 회복 속도(‰, 설정 칸 n54_injury_regen_1~3 — 세력·사회 계수표 vitals). 없으면 시험 계수표 */
  readonly rules?: (() => { readonly injuryRegenPm: readonly number[] }) | undefined;
}

/** 줄을 정리하는 간격(값은 읽을 때 셈한다) */
export const VITALS_SWEEP_MS = 60_000;

export interface WorldVitals {
  readonly service: VitalsService;
  /** 로그인한 사용자의 사이보그·보유 유닛 생명 수치(tRPC vitals.list) */
  list(userId: string, nowMs: number): VitalsListResponse;
  stop(): void;
}

export function createWorldVitals(input: {
  readonly loaded: readonly VitalsRecord[];
  readonly writer: WorldWriter;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly cyborgs: CyborgService;
  readonly settlement: Settlement;
  readonly config: VitalsConfig | undefined;
  readonly now: () => number;
  /** 유닛이 지닌 것(보유 물건, 보유 물건 서비스를 이 뒤에 만들므로 부를 때 찾는다). 없으면 빈 몸 */
  readonly gearOf?: ((unitId: number, nowMs: number) => UnitGear) | undefined;
  /** 유닛 성장 거울(growth/store.ts baseOf — 휴먼·사이보그 유닛의 저장된 스탯 + 레벨 성장). 없으면 기본 몸 */
  readonly baseOf?: ((unitId: number) => BodyBase | undefined) | undefined;
}): WorldVitals {
  const { maps, cyborgs, config } = input;
  const gearOf = (unitId: number, nowMs: number): UnitGear => input.gearOf?.(unitId, nowMs) ?? NO_GEAR;
  const infoOf = (unitId: number) => {
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info;
    }
    return undefined;
  };
  /**
   * 회복을 바꾸는 것(D-514): 부상(나을 때까지 HP 회복 × 단계 ‰)과 전투 밖 주기 회복(걸린 heal 효과 — unit_effects에 들어가는 heal은
   * 보유 물건 use가 넣는 전투 밖 주기 회복뿐이다, 값 = 분당 HP)
   */
  const modifiersOf = (unitId: number, nowMs: number): VitalsModifiers => {
    const condition = infoOf(unitId)?.condition;
    const injury = condition ? injuryNowOf(condition, nowMs) : undefined;
    const regenPm = (config?.rules?.() ?? TEST_SOCIETY_COEFFICIENTS.vitals).injuryRegenPm;
    const hot = gearOf(unitId, nowMs)
      .effects.filter((effect) => effect.kind === "heal")
      .map((effect) => ({ untilMs: effect.untilMs, hpPerMinute: effect.value }));
    if (!injury || injury.stage <= 0 || injury.untilMs === null) return { hot };
    // 부상 4단계(D-521): 지금 단계 끝 뒤로 아래 단계마다 구간(그 단계 자연 치유 시간 ÷ 치료 배율)
    const later: { untilMs: number; regenPm: number }[] = [];
    let until = injury.untilMs;
    for (let stage = injury.stage - 1; stage > 0; stage--) {
      until += stageHealMs(stage, injury.healPm, injuryRules());
      later.push({ untilMs: until, regenPm: regenPm[stage] ?? 1000 });
    }
    return {
      injury: { stage: injury.stage, untilMs: injury.untilMs, regenPm: regenPm[injury.stage] ?? 1000 },
      later,
      hot,
    };
  };
  const service = createVitalsService({
    loaded: input.loaded,
    writer: input.writer,
    world: {
      exists: (unitId) => infoOf(unitId) !== undefined,
      bodyOf: (unitId, nowMs) => {
        const userId = cyborgs.userOfUnit(unitId);
        const record = userId === undefined ? undefined : cyborgs.record(userId);
        return record && config?.cyborgBody ? config.cyborgBody(record, gearOf(unitId, nowMs)) : undefined;
      },
      defaultBody: (unitId, nowMs) => config?.defaultBody?.(gearOf(unitId, nowMs), input.baseOf?.(unitId)),
      modifiersOf: (unitId, nowMs) => modifiersOf(unitId, nowMs),
    },
  });
  const timer = setInterval(() => service.sweep(input.now()), VITALS_SWEEP_MS);
  timer.unref();
  return {
    service,
    list(userId, nowMs) {
      const ownerId = input.settlement.findOwnerOfUser(userId);
      if (ownerId === undefined) return { hasOwner: false, units: [], generatedAt: nowMs };
      const mine: { id: number; cyborg: boolean }[] = [];
      for (const map of maps.values())
        map.forEachUnit((unit) => {
          if (unit.ownerId === ownerId) mine.push({ id: unit.id, cyborg: unit.kind === UNIT_KIND_CYBORG });
        });
      const units = mine
        .toSorted((a, b) => Number(b.cyborg) - Number(a.cyborg) || a.id - b.id)
        .flatMap((unit): VitalsView[] => {
          const snapshot = service.read(unit.id, nowMs);
          if (!snapshot) return [];
          const injury = modifiersOf(unit.id, nowMs).injury;
          return [
            {
              unit: unit.id,
              cyborg: unit.cyborg,
              ...snapshot,
              ...(injury ? { injury: { stage: injury.stage, until: injury.untilMs } } : {}),
            },
          ];
        });
      return { hasOwner: true, units, generatedAt: nowMs };
    },
    stop: () => clearInterval(timer),
  };
}
