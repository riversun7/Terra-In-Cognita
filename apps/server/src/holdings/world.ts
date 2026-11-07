// 보유 물건 서비스를 월드에 잇는다 — docs/adr/2026-11-03-item-holdings.md 4절. world.ts가 부팅 복구 때 한 번 부른다.
// - 유닛 주인·종류는 2차맵 메모리에서, 쓰는 유닛의 1차 스탯은 유닛 화면과 같은 셈(config.cyborgPrimaries·defaultPrimaries — 입은 장비·
//   1차 스탯 버프 포함, roster/unitBody.ts)에서 읽는다. 설정이 없으면 [임시] 기본값(1차 모두 10, roster/body.ts BASELINE_PRIMARY).
// - 유닛이 지닌 것(gearOf: 입은 물건·걸린 효과 + 효과 사전 칸)과 부상 불이익(D-514 — 부상 단계 × 설정 칸)을 사이보그 화면·유닛 상세·
//   생명 수치·세계 전투 시작이 읽는다(docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)").
// - 유닛 종류 코드(world_units.kind) → 팩 unit_kinds: 사이보그(3) = cyborg, 그 밖 = human(유닛 화면 baselineBody와 같다).
// - 1분마다 썩은 묶음을 바꾸고 끝난 효과를 지운다(목록을 읽을 때도 먼저 셈한다).
import type { EffectEntry } from "@terra/content";
import type { Primaries, StatRow } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { CyborgRecord } from "../cyborg/state.ts";
import { BASELINE_PRIMARY } from "../roster/body.ts";
import type { UnitGear } from "../roster/unitBody.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { Settlement } from "../world/settlement.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_CYBORG_UNIT } from "../world/unitKinds.ts";
import { injuryAt } from "../world/unitCondition.ts";
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
  /** 사이보그 본체의 1차 스탯(입은 장비·1차 스탯 버프 포함, 사이보그 화면과 같은 셈). 없으면 기본값 */
  readonly cyborgPrimaries?: ((record: CyborgRecord, gear: UnitGear) => Primaries) | undefined;
  /** 그 밖 유닛의 1차 스탯([임시] 기본 몸 + 입은 장비·버프, 유닛 상세와 같은 셈). 없으면 기본값 */
  readonly defaultPrimaries?: ((gear: UnitGear) => Primaries) | undefined;
  /** 가중치 표 실효 값(수리 장인 실력의 제작 직무 행, D-512 323). 없으면 시험 표 */
  readonly statTable?: (() => readonly StatRow[]) | undefined;
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

/** 건물 서비스가 잇기 전: 고치는 중인 물건 없음 */
const NEVER_LOCKED = (_holdingId: number): boolean => false;

/** 썩기·효과 정리 간격 */
export const HOLDINGS_SWEEP_MS = 60_000;

export interface WorldHoldings {
  readonly service: HoldingService;
  readonly access: HoldingsAccess;
  /** 유닛이 지닌 것: 입은 물건(칸 차례)과 nowMs에 걸린 효과(효과 사전에 있는 항목 — 꺼진 것 포함, 종류·수치·값 방식을 붙임) */
  readonly gearOf: (unitId: number, nowMs: number) => UnitGear;
  /** 유닛의 1차 스탯(입은 장비·버프 포함, 사이보그 화면과 같은 셈) — 공방 장인 실력·수리 시간(건물 서비스) */
  readonly primariesOf: (unitId: number) => Primaries;
  /** 가중치 표 실효 값(제작 직무 행) */
  readonly statTable: () => readonly StatRow[] | undefined;
  /** 공방 수리 작업 중인 물건 확인을 잇는다(건물 서비스가 만들어진 뒤) */
  setLocked(locked: (holdingId: number) => boolean): void;
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
  const content = config?.content ?? (() => EMPTY_CONTENT);
  let effectDefs: { source: readonly EffectEntry[]; byId: ReadonlyMap<string, EffectEntry> } | undefined;
  /** 효과 사전 찾기 표(실효 콘텐츠가 바뀌면 다시 만든다) */
  const effectDef = (id: string): EffectEntry | undefined => {
    const list = content().effects;
    if (effectDefs?.source !== list) effectDefs = { source: list, byId: new Map(list.map((e) => [e.id, e])) };
    return effectDefs.byId.get(id);
  };
  /** 부상 불이익(D-514): 그 시각 부상 단계의 ‰(설정 칸 n54_injury_penalty_1~3) */
  const injuryPmOf = (unitId: number, nowMs: number): number => {
    const condition = infoOf(unitId)?.condition;
    const stage = condition ? injuryAt(condition, nowMs) : 0;
    if (stage === 0) return 0;
    return (config?.rules?.() ?? TEST_HOLDING_RULES).vitals.injuryPenaltyPm[stage] ?? 0;
  };
  const gearOf = (unitId: number, nowMs: number): UnitGear => ({
    injuryPm: injuryPmOf(unitId, nowMs),
    equipped: service.equippedOn(unitId).map((record) => ({
      item: record.itemId,
      slot: record.slot ?? 0,
      stats: record.stats,
      durability: record.durability,
    })),
    effects: service.effectsOn(unitId, nowMs).flatMap((record) => {
      const def = effectDef(record.effect);
      // 이미 걸린 효과는 사전 항목이 꺼져도 몸을 바꾼다(질문 355 → D-515·D-512 "콘텐츠에 켜고 끄기를 두지 않는다", 입은 물건과 같은 뜻).
      // 사전에서 사라진 효과만 뺀다(종류·수치를 모른다)
      return def
        ? [
            {
              effect: record.effect,
              value: record.value,
              untilMs: record.untilMs,
              kind: def.kind,
              stat: def.stat,
              valueMode: def.valueMode,
            },
          ]
        : [];
    }),
  });
  // 쓰는 유닛의 1차 스탯(소모품 효과량 D-501·장인 실력): 입은 장비·지금 걸린 1차 스탯 버프 포함
  const primariesOf = (unitId: number): Primaries => {
    const userId = cyborgs.userOfUnit(unitId);
    const record = userId === undefined ? undefined : cyborgs.record(userId);
    if (record) return config?.cyborgPrimaries?.(record, gearOf(unitId, input.now())) ?? BASELINE;
    return config?.defaultPrimaries?.(gearOf(unitId, input.now())) ?? BASELINE;
  };
  let locked: (holdingId: number) => boolean = NEVER_LOCKED;
  const service = createHoldingService({
    loaded: input.loaded,
    writer: input.writer,
    content,
    rules: config?.rules ?? (() => TEST_HOLDING_RULES),
    statTable: config?.statTable,
    locked: (holdingId) => locked(holdingId),
    world: {
      unitOwner: (unitId) => infoOf(unitId)?.ownerId,
      unitKind: (unitId) => {
        const info = infoOf(unitId);
        if (!info) return undefined;
        // 사이보그 본체·융합한 사이보그 유닛(D-470)은 사이보그 칸 배치(인공장기 칸). 휴먼 칸 배치의 앞 여섯 칸과 차례가 같다
        return info.kind === UNIT_KIND_CYBORG || info.kind === UNIT_KIND_CYBORG_UNIT ? "cyborg" : "human";
      },
      unitPrimaries: primariesOf,
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
    // 병원 치료(D-514, 옛 병원 코드: 부상을 지우고 HP를 최대로) — 병원 시설이 생기기 전 개발 시험 고리
    treat: (unitId, nowMs) => {
      for (const map of maps.values()) {
        const info = map.unitInfo(unitId);
        if (!info) continue;
        if (info.condition.injury > 0 || info.condition.injuryUntilMs !== null)
          map.setCondition(unitId, { ...info.condition, injury: 0, injuryUntilMs: null });
        input.vitals?.treat?.(unitId, nowMs);
        return true;
      }
      return false;
    },
  };
  return {
    service,
    access,
    gearOf,
    primariesOf,
    statTable: () => config?.statTable?.(),
    setLocked(next) {
      locked = next;
    },
    stop: () => clearInterval(timer),
  };
}
