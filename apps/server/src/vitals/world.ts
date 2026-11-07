// 유닛 생명 수치 서비스를 월드에 잇는다 — 기획 D-512. world.ts가 부팅 복구 때 한 번 부른다.
// - 세계 유닛이 있는지는 2차맵 메모리에서, 사이보그 본체의 몸 자료(최대 HP·아머·쉴드, 쉴드 재생)는 사이보그 화면과 같은 셈
//   (config.cyborgBody)에서 읽는다. 그 밖 유닛은 저장한 줄(전투 사양 값)이나 유닛 화면 기본 몸 자료(config.defaultBody)다.
// - 1분마다 세계에 없는 유닛의 줄과 다 찬 줄을 지운다(값은 읽을 때 셈하므로 주기 타이머가 값을 고치지는 않는다).
import type { VitalsListResponse, VitalsView } from "@terra/shared/vitals";
import type { CyborgService } from "../cyborg/service.ts";
import type { CyborgRecord } from "../cyborg/state.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";
import { type VitalsService, createVitalsService } from "./service.ts";
import type { VitalsBody, VitalsRecord } from "./state.ts";

/** 월드 설정의 생명 수치 칸(app.ts가 팩 가중치 표로 만든다). 없으면 몸 자료를 모른다(저장한 줄만 보인다) */
export interface VitalsConfig {
  /** 사이보그 본체의 몸 자료(사이보그 화면 realCyborgBody의 2차 스탯) */
  readonly cyborgBody?: ((record: CyborgRecord) => VitalsBody) | undefined;
  /** 그 밖 유닛의 화면 기본 몸 자료(유닛 화면 baselineBody, [임시] 1차 모두 10) */
  readonly defaultBody?: (() => VitalsBody) | undefined;
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
}): WorldVitals {
  const { maps, cyborgs, config } = input;
  const infoOf = (unitId: number) => {
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info;
    }
    return undefined;
  };
  const service = createVitalsService({
    loaded: input.loaded,
    writer: input.writer,
    world: {
      exists: (unitId) => infoOf(unitId) !== undefined,
      bodyOf: (unitId) => {
        const userId = cyborgs.userOfUnit(unitId);
        const record = userId === undefined ? undefined : cyborgs.record(userId);
        return record && config?.cyborgBody ? config.cyborgBody(record) : undefined;
      },
      defaultBody: () => config?.defaultBody?.(),
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
          return snapshot ? [{ unit: unit.id, cyborg: unit.cyborg, ...snapshot }] : [];
        });
      return { hasOwner: true, units, generatedAt: nowMs };
    },
    stop: () => clearInterval(timer),
  };
}
