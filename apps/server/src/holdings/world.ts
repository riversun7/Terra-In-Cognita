// 보유 물건 서비스를 월드에 잇는다 — docs/adr/2026-11-03-item-holdings.md 4절. world.ts가 부팅 복구 때 한 번 부른다.
// - 유닛 주인·종류는 2차맵 메모리에서, 사이보그 본체의 1차 스탯은 유닛 화면과 같은 셈(config.cyborgPrimaries)에서 읽는다.
//   그 밖 유닛(시험 일꾼·봇)은 [임시] 기본값(1차 모두 10, roster/body.ts BASELINE_PRIMARY — 저장된 스탯이 아직 없다).
// - 유닛 종류 코드(world_units.kind) → 팩 unit_kinds: 사이보그(3) = cyborg, 그 밖 = human(유닛 화면 baselineBody와 같다).
// - 1분마다 썩은 묶음을 바꾸고 끝난 효과를 지운다(목록을 읽을 때도 먼저 셈한다).
import type { Primaries } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { CyborgRecord } from "../cyborg/state.ts";
import { BASELINE_PRIMARY } from "../roster/body.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";
import type { HoldingsAccess } from "./gateway.ts";
import { type HoldingRules, TEST_HOLDING_RULES } from "./rules.ts";
import {
  type HoldingContent,
  type HoldingService,
  type HoldingVitals,
  createHoldingService,
} from "./service.ts";
import type { LoadedHoldings } from "./state.ts";

/** 월드 설정의 보유 물건 칸(app.ts가 실효 콘텐츠·설정 칸 접근자를 넘긴다) */
export interface HoldingsConfig {
  readonly content: () => HoldingContent;
  readonly rules?: (() => HoldingRules) | undefined;
  /** 사이보그 본체의 1차 스탯(장비 포함, 유닛 화면 bodySheet와 같은 셈). 없으면 기본값 */
  readonly cyborgPrimaries?: ((record: CyborgRecord) => Primaries) | undefined;
}

/** 팩이 없을 때(시험): 아무 아이템도 없다 */
const EMPTY_CONTENT: HoldingContent = {
  items: [],
  itemSubcategories: [],
  effects: [],
  unitKinds: [],
  weaponTypes: [],
};

const BASELINE: Primaries = {
  str: BASELINE_PRIMARY,
  dex: BASELINE_PRIMARY,
  agi: BASELINE_PRIMARY,
  vit: BASELINE_PRIMARY,
  int: BASELINE_PRIMARY,
  wis: BASELINE_PRIMARY,
};

/** 썩기·효과 정리 간격 */
export const HOLDINGS_SWEEP_MS = 60_000;

export interface WorldHoldings {
  readonly service: HoldingService;
  readonly access: HoldingsAccess;
  stop(): void;
}

export function createWorldHoldings(input: {
  readonly loaded: LoadedHoldings;
  readonly writer: WorldWriter;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly cyborgs: CyborgService;
  readonly settlement: Settlement;
  readonly config: HoldingsConfig | undefined;
  readonly now: () => number;
  readonly seed: () => number;
  /** 전투 밖 HP(D-512, 생명 수치 서비스). 없으면 회복 물약은 전투 중에만 */
  readonly vitals?: HoldingVitals | undefined;
}): WorldHoldings {
  const { maps, cyborgs, config } = input;
  const infoOf = (unitId: number) => {
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info;
    }
    return undefined;
  };
  const service = createHoldingService({
    loaded: input.loaded,
    writer: input.writer,
    content: config?.content ?? (() => EMPTY_CONTENT),
    rules: config?.rules ?? (() => TEST_HOLDING_RULES),
    world: {
      unitOwner: (unitId) => infoOf(unitId)?.ownerId,
      unitKind: (unitId) => {
        const info = infoOf(unitId);
        if (!info) return undefined;
        return info.kind === UNIT_KIND_CYBORG ? "cyborg" : "human";
      },
      unitPrimaries: (unitId) => {
        const userId = cyborgs.userOfUnit(unitId);
        const record = userId === undefined ? undefined : cyborgs.record(userId);
        return record && config?.cyborgPrimaries ? config.cyborgPrimaries(record) : BASELINE;
      },
      vitals: input.vitals,
    },
  });
  const timer = setInterval(() => {
    const at = input.now();
    service.spoilDue(at);
    service.sweepEffects(at);
  }, HOLDINGS_SWEEP_MS);
  timer.unref();
  const access: HoldingsAccess = {
    service,
    ownerOf: (userId) => input.settlement.findOwnerOfUser(userId),
    cyborgUnitOf: (userId) => cyborgs.record(userId)?.unitId ?? undefined,
    unitOwner: (unitId) => infoOf(unitId)?.ownerId,
    durable: () => input.writer.durable(),
    seed: input.seed,
  };
  return {
    service,
    access,
    stop: () => clearInterval(timer),
  };
}
