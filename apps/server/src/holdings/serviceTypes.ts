// 보유 물건 서비스의 공개 타입(service.ts에서 나눔 — 파일 1,000줄 상한). 동작 코드는 service.ts에 있고, 이 파일은 타입만 둔다.
// 바깥 모듈은 지금처럼 service.ts에서 가져온다(service.ts가 다시 내보낸다).
import type {
  EffectEntry,
  ItemEntry,
  ItemSubcategoryEntry,
  UnitKindEntry,
  WeaponTypeEntry,
} from "@terra/content";
import type {
  BattlePotions,
  HoldableDef,
  Primaries,
  RepairMaterial,
  RepairRule,
  StatRange,
  StatRow,
  StoragePlace,
  WearOutcome,
} from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { GenePayload } from "./genePayload.ts";
import type { HoldingRules } from "./rules.ts";
import type {
  CooldownKind,
  HoldingRecord,
  LoadedHoldings,
  UnitCooldownRecord,
  UnitEffectRecord,
} from "./state.ts";

/** 서비스가 읽는 실효 콘텐츠(팩 + 그 세계의 덮어쓰기). 부를 때마다 읽는다 */
export interface HoldingContent {
  readonly items: readonly ItemEntry[];
  /** 중분류(식품 중분류 = 요리 쿨 종류, 그 밖 소모품 = 물약 쿨, D-509) */
  readonly itemSubcategories: readonly ItemSubcategoryEntry[];
  readonly effects: readonly EffectEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
  readonly weaponTypes: readonly WeaponTypeEntry[];
}

/** 세계에서 읽는 것 */
export interface HoldingWorld {
  /** 유닛 주인(소유 주체 ID). 없는 유닛이면 undefined */
  unitOwner(unitId: number): number | undefined;
  /** 유닛의 팩 unit_kinds ID(칸 배치). 없으면 undefined */
  unitKind(unitId: number): string | undefined;
  /** 쓰는 유닛의 1차 스탯(소모품 효과량 D-501) */
  unitPrimaries(unitId: number): Primaries;
  /**
   * 전투 밖 HP(D-512: HP는 전투 뒤에도 남고 회복 물약은 전투 밖에서도 채운다, 생명 수치 서비스 src/vitals/). 없으면 회복은 전투 중에만
   * (battle_only, 시험 세계)
   */
  readonly vitals?: HoldingVitals | undefined;
}

/** 보유 물건이 쓰는 생명 수치 고리(src/vitals/service.ts) */
export interface HoldingVitals {
  /** 지금 HP와 최대(분 단위 회복을 셈한 값). 몸 자료를 모르면 undefined */
  hp(unitId: number, nowMs: number): { readonly current: number; readonly max: number } | undefined;
  /** HP를 채운다(flat = 값, permille = 최대 HP의 ‰). 실제로 찬 양 */
  heal(
    unitId: number,
    amount: { readonly mode: "flat" | "permille"; readonly value: number },
    nowMs: number,
  ): number;
  /** 지금 값을 저장하고 마지막 분 경계를 돌려준다(전투 밖 주기 회복을 걸기 전, D-514 346). 없으면 nowMs를 분 경계로 친다 */
  touch?(unitId: number, nowMs: number): number;
  /** 병원 치료(D-514): HP를 가득 채운다. 실제로 찬 양 */
  treat?(unitId: number, nowMs: number): number;
}

/** 전투에 가지고 들어가는 것(287): 자동 물약 사양과 남은 탄(든 무기가 탄약 종류를 쓸 때만) */
export interface BattleKit {
  readonly potions?: BattlePotions | undefined;
  readonly ammo?: number | undefined;
}

/** 전투에서 쓴 것(판정 결과 UnitResult의 shots·potions, 물약 쿨 끝 = 실제 시각) */
export interface BattleUse {
  readonly shots?: number | undefined;
  readonly potions?: readonly { readonly id: number; readonly used: number }[] | undefined;
  readonly potionReadyAtMs?: number | undefined;
}

/** 명령 실패 코드(@terra/protocol ITEM_RESULT_CODES 가운데 서비스가 내는 것) */
export type HoldingFailure =
  | "unknown_holding"
  | "unknown_unit"
  | "unknown_item"
  | "not_holdable"
  | "not_carried"
  | "wrong_slot"
  | "broken"
  | "not_usable"
  | "battle_only"
  | "not_better"
  | "confirm_replace"
  | "cooldown"
  /** 포장된 식품 칸이 아님(풀린 낱개·식품이 아닌 물건, D-524) */
  | "not_packed"
  /** 공방에서 고치는 중(docs/adr/2026-11-07-buildings-runtime.md) — 끝날 때까지 입기·쓰기·벗기를 받지 않는다 */
  | "busy";

export type HoldingResult<T = object> =
  | ({ readonly ok: true } & T)
  | {
      readonly ok: false;
      readonly code: HoldingFailure;
      readonly effects?: readonly string[];
      /** cooldown이면 다시 쓸 수 있는 시각 */
      readonly readyAt?: number;
    };

export interface AcquireInput {
  readonly ownerId: number;
  readonly item: string;
  readonly quantity: number;
  readonly location: number;
  /** 얻은 길(dev_grant·craft·drop·gather 등) */
  readonly source: string;
  readonly atMs: number;
  /** 굴림 시드(운영: crypto, 시험: 고정) */
  readonly seed: number;
}

/** 유전자 하나 넣기(addGene) */
export interface GeneInput {
  readonly ownerId: number;
  readonly item: string;
  readonly location: number;
  readonly gene: GenePayload;
  readonly atMs: number;
  /** 얻은 길(lifespan·synthesis·dev_grant) */
  readonly source: string;
}

/** 전투 하나에서 유닛 하나(이김·짐·퇴각 — 퇴각은 패배 닳음 없음, D-512 324) */
export interface BattleUnitWear {
  readonly unit: number;
  readonly outcome: WearOutcome;
}

export interface BattleWearSummary {
  /** 닳은 물건 수 */
  readonly worn: number;
  /** 0이 돼 벗은 물건 수 */
  readonly broken: number;
}

export interface RepairOutcome {
  readonly destroyed: boolean;
  readonly maxLoss: number;
  readonly restored: number;
}

/** 수리 한 번에 받는 것(D-512 323): 시설 Lv·그 시설의 수리 줄(팩 facilities repair)·일하는 장인의 1차 스탯 */
export interface RepairInput {
  readonly facilityLevel: number;
  readonly rules: readonly RepairRule[];
  readonly craftsman: Primaries;
}

export interface HoldingService {
  /** 소유 주체의 물건·그 주체 유닛에 걸린 효과(썩기를 먼저 셈한다) */
  list(
    ownerId: number,
    nowMs: number,
  ): {
    readonly holdings: readonly HoldingRecord[];
    readonly effects: readonly UnitEffectRecord[];
    readonly cooldowns: readonly UnitCooldownRecord[];
  };
  acquire(input: AcquireInput): HoldingResult<{ readonly holdings: readonly number[] }>;
  /**
   * 유전자 하나(D-516: 값이 다른 인스턴스, 수량 1)를 넣는다. 새 칸 ID. 아이템이 없거나 꺼졌거나 그 종류(stat·skill)의 유전자 아이템이
   * 아니면 undefined. 한 번의 동기 처리 안에서 부른다(쓰기 대기열)
   */
  addGene(input: GeneInput): number | undefined;
  /** 그 주체의 유전자 칸(값이 있는 것만). 없거나 남의 것이면 undefined */
  geneOf(ownerId: number, holdingId: number): HoldingRecord | undefined;
  /** 칸을 지운다(쓴 유전자). 없으면 false */
  remove(holdingId: number): boolean;
  /** 유닛이 든 것을 모두 그 자리로 옮긴다(입은 것은 벗는다 — 수명이 다해 떠나는 유닛). 옮긴 칸 수 */
  moveCarried(unitId: number, location: number): number;
  equip(ownerId: number, holdingId: number, slot: number): HoldingResult;
  unequip(ownerId: number, holdingId: number): HoldingResult;
  use(
    ownerId: number,
    holdingId: number,
    options: { readonly confirm: boolean; readonly nowMs: number; readonly seed: number },
  ): HoldingResult<{ readonly effects: readonly { readonly effect: string; readonly amount: number }[] }>;
  /**
   * 식품 포장 풀기(D-524): 그 주체의 포장된 식품 칸에서 quantity개(1 ≤ 수 ≤ min(수량, @terra/sim UNPACK_MAX))를 낱개(수량 1 칸 하나하나)로
   * 꺼낸다. 낱개는 포장 때 멈춘 숙성에서 nowMs부터 보관 곳 배율로 숙성한다. 새 낱개 칸 ID들. 포장 칸이 아니면 not_packed
   */
  unpack(
    ownerId: number,
    holdingId: number,
    quantity: number,
    nowMs: number,
  ): HoldingResult<{ readonly holdings: readonly number[] }>;
  /**
   * D-524 전에 저장된 신선도 묶음(부팅 때 읽은 packed 칸이 빈 줄, LoadedHoldings.legacyLots)을 포장 칸으로 바꾼다: 옛 규칙(보관 곳 배율)으로
   * nowMs까지 숙성·썩힌 뒤 그 값에서 멈춘다. 부팅 때 한 번(쓰기 대기열). 바꾼 칸 수
   */
  packLegacy(ids: readonly number[], nowMs: number): number;
  /** 전투가 끝날 때(결과 적용과 같은 동기 처리): 참전 유닛이 입은 장비를 닳게 한다(탄약 종류는 빼고 — 탄 수는 spendAmmo) */
  applyBattle(battleSeed: number, units: readonly BattleUnitWear[]): BattleWearSummary;
  /**
   * 원거리 타격 shots번(전투 판정이 알려 줄 고리): 입은 탄약(보조 칸, 무기 종류 ammo)의 내구도 = 남은 탄 수를 줄인다(D-497). 0이면 벗고
   * 같은 유닛이 든 같은 탄약 종류(같은 아이템 먼저, 그다음 많이 남은 것)를 입는다(옛 BattleResult 자동 교체, D-501 294). 보충은 하지 않는다
   */
  spendAmmo(unitId: number, shots: number): { readonly spent: number; readonly replacedBy: number | null };
  /**
   * 수리 고리(D-512 323·D-5031·F11·F12): 끝까지만 고친다. 그 시설의 수리 줄이 이 장비를 받지 않으면 wrong_slot. 장인 실력‰ = 제작 직무 점수 ÷
   * 적정 점수(설정 칸 f11_craft_appropriate), 재료 = 줄의 기본 재료 × 티어 × 잃은 ÷ 최대(차감은 부르는 쪽, 수수료 없음). 파괴되면 내구도 0·벗김
   * (분해만 가능)·재료 없음
   */
  repair(
    holdingId: number,
    input: RepairInput,
  ): HoldingResult<
    RepairOutcome & { readonly materials: readonly RepairMaterial[]; readonly skillPm: number }
  >;
  /** 신선도 0이 된 묶음을 바꾼다. 바꾼(버린) 칸 수 */
  spoilDue(nowMs: number): number;
  /** 끝난 효과·쿨을 지운다. 지운 수 */
  sweepEffects(nowMs: number): number;
  /**
   * 탄약 보충 고리(D-509 "재료로 내구도 회복. 최대내구도 점차 감소"): 탄약 종류 장비만. 재료 양 = repairMaterialQty(기본 양, 티어, 쓴 탄, 최대)
   * (보충 전에 셈, 재료 차감은 부르는 쪽), 최대 감소 = 설정 칸 d509_ammo_refill_loss, 파괴 문턱 F12. 재료 기본 양·어디서 보충하는지는 시설 줄기
   */
  refillAmmo(
    holdingId: number,
    materialBase: number,
  ): HoldingResult<RepairOutcome & { readonly materials: number }>;
  /**
   * 자동 사용 후보: 그 유닛이 든, 지금 쿨이 끝나 쓸 수 있는 소모품(칸 ID 차례). 물약은 pickAutoPotion(D-510)이 고르고, 고른 뒤에는 use와 같은 규칙
   * (planEffects auto)으로 쓴다
   */
  usableNow(unitId: number, nowMs: number): readonly HoldingRecord[];
  /** 유닛의 그 종류 쿨이 끝나는 시각(없으면 0, 전투 판정이 물약을 쓸 때 같은 쿨을 본다 D-509) */
  cooldownUntil(unitId: number, kind: CooldownKind): number;
  /**
   * 자동 물약(D-510 "HP 문턱 + 알맞은 물약"): HP가 문턱(‰, 없으면 설정 칸 d510_potion_hp_threshold — 유닛 AI 전술 설정 D-5039가 생기면 그 값)
   * 아래면, 쿨이 끝난 든 물약 가운데 모자란 HP를 가장 덜 넘치게 채우는 것(채우는 양 = 회복 줄 효과량 가운데 값, ‰ 회복은 최대 HP 기준).
   * 고른 것은 전투 판정이 같은 쿨·교체 규칙(planEffects auto)으로 쓴다(전투 사용은 다음 줄기). 없으면 null
   */
  pickAutoPotion(
    unitId: number,
    hp: { readonly current: number; readonly max: number },
    nowMs: number,
    thresholdPm?: number,
  ): { readonly holding: number; readonly heal: number } | null;
  /**
   * 전투 시작(287): 그 유닛이 든 물약(물약 쿨 종류, 회복 줄이 있는 것 — 칸 ID 차례)을 판정 사양으로(양 = 효과량 가운데 값 × 신선도, ‰는 maxHp
   * 기준), 문턱 = thresholdPm 또는 설정 칸 d510_potion_hp_threshold, 쿨 = 설정 칸, 남은 쿨 = 지금 물약 쿨 끝 − nowMs. 든 무기가 탄약 종류를
   * 쓰면 입은 그 종류 탄약의 내구도(없으면 0)
   */
  battleKit(unitId: number, maxHp: number, nowMs: number, thresholdPm?: number): BattleKit;
  /** 전투 끝(결과 적용과 같은 동기 처리, 287): 마신 물약 수량을 빼고 물약 쿨을 그 끝까지 걸고, 쏜 탄을 spendAmmo로 뺀다. 뺀 물약 수 */
  applyBattleUse(unitId: number, use: BattleUse): number;
  /** 유닛이 입은 물건(칸 차례) */
  equippedOn(unitId: number): readonly HoldingRecord[];
  /** 유닛에 지금 걸린 효과(끝나지 않은 것, 스탯 몸·전투 시작 사양이 읽는다) */
  effectsOn(unitId: number, nowMs: number): readonly UnitEffectRecord[];
  /** 유닛의 칸 배치(팩 unit_kinds ID와 칸 차례 — 화면이 칸 번호를 칸 종류로 읽는다). 없는 유닛·종류면 undefined */
  unitLayout(unitId: number): { readonly kind: string; readonly slots: readonly string[] } | undefined;
  /** 쓸 수 있는 물건의 쓰기 쿨 종류(D-509·D-510). 쓸 수 없거나 팩에서 사라졌으면 null */
  useCooldownOf(itemId: string): CooldownKind | null;
  /** 지금 실효 정의(보유 판정 칸, 팩에서 사라졌으면 undefined) */
  defOf(itemId: string): HeldDef | undefined;
  /** 신선도 묶음의 지금 신선도(‰)와 그 자리에 두면 다 썩는 시각(신선도가 없으면 null) */
  freshnessOf(
    record: HoldingRecord,
    nowMs: number,
  ): { readonly freshnessPm: number; readonly spoilsAt: number | null } | null;
  readonly size: number;
}

export interface HoldingServiceOptions {
  readonly loaded: LoadedHoldings;
  readonly writer: WorldWriter;
  readonly world: HoldingWorld;
  readonly content: () => HoldingContent;
  readonly rules: () => HoldingRules;
  /**
   * 자리 → 보관 곳(D-512 322). 없으면 음수(유닛이 듦) = unit, 양수 = storage(창고 종류·냉장 시설이 서버에 아직 없다). 배율은 규칙의
   * consumables.preservePm(설정 칸 n49_preserve_*)을 셀 때마다 읽는다
   */
  readonly storagePlaceOf?: ((location: number) => StoragePlace) | undefined;
  /** 가중치 표 실효 값(수리 장인 실력의 제작 직무 행). 없으면 시험 표 */
  readonly statTable?: (() => readonly StatRow[]) | undefined;
  /** 공방 수리 작업 중인 물건(건물 서비스가 잇는다). 그 물건은 입기·벗기·쓰기를 busy로 거절한다 */
  readonly locked?: ((holdingId: number) => boolean) | undefined;
}

/** 팩 아이템 항목에서 보유 판정이 읽는 칸(참조 ContentRef → ID 글자) */
export interface HeldDef extends HoldableDef {
  readonly id: string;
  /** 유전자 아이템이면 종류·종(D-516) */
  readonly gene?: { readonly kind: "stat" | "skill"; readonly species: string } | undefined;
  readonly name: ItemEntry["name"];
  readonly enabled: boolean;
  readonly subcategory?: string | undefined;
  readonly tier: number;
  readonly stackMax?: number | undefined;
  readonly perish?: { readonly shelfLifeMs: number; readonly spoilsTo: string } | undefined;
  readonly use?:
    | {
        readonly effects: readonly {
          readonly effect: string;
          readonly value: number;
          readonly chancePm: number;
          readonly durationMs?: number | undefined;
          readonly scale?: { readonly stat: keyof Primaries; readonly appropriate: number } | undefined;
          readonly variancePm?: number | undefined;
        }[];
      }
    | undefined;
  readonly equip?:
    | {
        readonly slot: string;
        readonly stats: readonly StatRange[];
        readonly maxDurability?: number | undefined;
        readonly weaponType?: string | undefined;
        readonly kinds?: readonly string[] | undefined;
        /** 무기가 쓰는 탄약 종류(보조 칸 무기 종류, D-497). 없으면 탄을 쓰지 않는 무기 */
        readonly ammo?: string | undefined;
      }
    | undefined;
}
