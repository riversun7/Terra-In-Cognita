// 채집 직무 산출(서버) — docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산", 기획 D-506(채집 티어)·D-507(옛 1차 생산 규칙)·49 N32·N43·N44
// 소유 주체 정산(world/settlement.ts → @terra/sim settleOwnerPeriod)이 채집 시설에서 일한 주기(1주기 = 1분, 덤 포함)를 넘기면 여기서 진짜 물건으로
// 바꾼다. 판정은 시뮬레이터 시설 생산과 같은 함수다(@terra/sim workerEffects·rollGatherOutputs·tierRequiredProgress):
// - 진행: 주기마다 진행 속도 max(1, ⌊주 스탯 ÷ N32⌋) × 일한 시간. 다음 묶음(차례 seq)의 티어를 뽑고(건물 채집소는 건물 레벨 최고 티어), 그 티어의 필요
//   진행 max(기본, 기본 + 티어 × 걸음)(N44) × 진행 1의 시간만큼 쌓이면 수확량(min(상한, 기본 + ⌊보조 × 비율⌋))만큼 낸다.
// - 묶음 차례 seq의 추첨 난수는 (유닛, seq)로만 정한다 → 정산을 어떻게 나눠도 같은 묶음이 같은 물건을 낸다(나눠 정산해도 같다, S3 4절).
//   스탯·시설 레벨이 그 사이 바뀌면 바뀐 값으로 뽑는다. 쌓인 진행·seq는 unit_work 줄에 남긴다(work.ts).
// - 시뮬과 다른 점: 시뮬 시설은 묶음을 시작할 때 일꾼 수로 시간을 정하고, 여기는 유닛마다 진행을 쌓는다(유닛 하나 = 일꾼 하나). 결과의 기댓값은 같다.
// - 컨디션(D-534, labor/condition.ts): 정산 때 그 시설 도시의 주거·음식으로 센 관리 보너스를 유효 스탯에 더한다(시뮬 workerEffects와 같은 함수).
// - 오브젝트 규칙(기획 D-552 "직접 채집과 일꾼 채집이 같은 규칙", docs/adr/2026-11-15-gather-object-tiers.md): 채집소가 묶음마다 쓸 오브젝트의
//   규칙(lotRoll — 사다리·티어 범위·대표 아이템·굴림표)을 주면 그 묶음을 그것으로 굴린다(직접 채집 gather/objectYield.ts와 같은 rollGatherOutputs).
//   주지 않으면(오브젝트를 맡지 않는 채집 시설) 시설 사다리 그대로.
// - 건물 채집소(농장·목장·약초원 — 선택 방식, 기획 D-566 1721·D-567): 티어 = 건물 레벨의 최고 티어, 수확 배율 = 일꾼 권장 스탯 미달 효율 ×
//   면적 모듈(site.plots). 오브젝트를 쓰지 않는다(채집소가 lotRoll을 주지 않는다).
// 정수 연산만 쓴다(판정 코드 규칙).
import { createRng } from "@terra/shared";
import {
  type CatalogGather,
  type GatherBand,
  type GatherSettings,
  type Primaries,
  type SocietyCoefficients,
  clampCondition,
  defaultGatherStat,
  mix32,
  rollGatherOutputs,
  tierRequiredProgress,
  workerEffects,
} from "@terra/sim";

/** 채집 시설 하나(실효 시설 정의 + 그 건물의 레벨·도시) */
export interface GatherSite {
  readonly buildingId: number;
  readonly facilityId: string;
  /** 다 지은 레벨(처음 짓는 동안 0 — 일하지 않는다) */
  readonly level: number;
  readonly rule: CatalogGather;
  /** 중분류의 티어별 켜진 아이템 자산(item:<ID>, 팩 차례, 길이 10) */
  readonly ladder: readonly (readonly string[])[];
  readonly bands: readonly GatherBand[];
  /** 아이템 자산 → 묶음 크기(1이 아닌 것만) */
  readonly lotSize: ReadonlyMap<string, bigint>;
  /** 건물이 선 도시(산출이 가는 도시 창고). 그 2차맵에 도시가 없으면 null */
  readonly cityId: number | null;
  /** 붙은 면적 모듈 수(건물 채집소, D-567). 없으면 0 */
  readonly plots?: number | undefined;
  /** 고른 기르는 티어(건물 채집소, D-569 1761 — 최고 티어로 자른다). 없으면 최고 티어 */
  readonly tier?: number | null | undefined;
}

/** 묶음 하나가 쓰는 오브젝트의 굴림 규칙(기획 D-552 — gather/objectYield.ts objectRollOf) */
export interface LotRoll {
  /** 그 오브젝트의 사다리(티어별 켜진 아이템 자산) */
  readonly ladder: readonly (readonly string[])[];
  /** 티어 범위(아래 ≤ 위) */
  readonly tierRange: { readonly min: number; readonly max: number };
  /** 대표 아이템 자산(item:<ID>) */
  readonly prefer: string;
  /** 아이템별 비중(자산 → 비중, 기획 D-562 1561). 없으면 대표 → 고르게 */
  readonly weights?: ReadonlyMap<string, number> | undefined;
  /** 굴림표(난파선·고래 무리). 있으면 티어를 뽑지 않는다 */
  readonly table?: readonly { readonly asset: string; readonly weightPm: number }[] | undefined;
}

/** 채집 손잡이 = 세력·사회 계수표의 설정 칸 값(시뮬레이터 simulator/run.ts attachEconomy와 같은 대응) */
export function gatherSettingsOf(c: SocietyCoefficients): GatherSettings {
  return {
    levelBonus: c.gatherLevelBonus,
    defaultStat: defaultGatherStat(c.cyborg.initialSum),
    progressDivisor: c.productionMainDivisor,
    yieldPerStatPm: c.productionSubYieldPm,
    tierProgressBase: c.gatherTierProgressBase,
    tierProgressStep: c.gatherTierProgressStep,
    tickMs: c.gatherTickMs,
    oreGrams: c.gatherOreGrams,
    conditionCap: c.condition.cap,
    building: c.buildingGather,
  };
}

/** 1차 스탯 코드(팩 gather.primary·secondary) → 값. 모르는 코드면 undefined */
export function statOf(primaries: Primaries, code: string): number | undefined {
  switch (code) {
    case "str":
      return primaries.str;
    case "dex":
      return primaries.dex;
    case "agi":
      return primaries.agi;
    case "vit":
      return primaries.vit;
    case "int":
      return primaries.int;
    case "wis":
      return primaries.wis;
    default:
      return undefined;
  }
}

/** 쌓인 진행과 다음 묶음 차례 */
export interface GatherProgress {
  /** 진행 속도 × 일한 ms */
  readonly points: number;
  readonly seq: number;
}

export interface GatherLotsInput {
  readonly unitId: number;
  readonly site: GatherSite;
  readonly primaries: Primaries;
  readonly settings: GatherSettings;
  /** 정산 주기 하나의 ms(@terra/sim TEST_JOB_RULES.cycleMs) */
  readonly cycleMs: number;
  /**
   * 이번에 끝낼 수 있는 묶음 수 상한(채집소 반경 안 남은 오브젝트 번수, gather/station.ts). 닿으면 쌓인 진행은 다음 묶음 하나 몫까지만 남는다
   * (기다리는 동안 진행이 끝없이 쌓이지 않게). 없으면 상한 없음
   */
  readonly maxLots?: number | undefined;
  /**
   * 일꾼 컨디션(관리 보너스, D-534 — labor/condition.ts workerCondition 합계). 추첨 유효 스탯에 더한다(설정 칸 condition_cap으로 다시 자른다).
   * 없으면 0
   */
  readonly condition?: number | undefined;
  /**
   * 이번 호출의 k번째 묶음(0부터)이 쓸 오브젝트 규칙(채집소 — gather/station.ts lotRoll, 반경 안 오브젝트를 가까운 것부터). undefined를
   * 돌려주거나 없으면 시설 사다리 그대로
   */
  readonly lotRoll?: ((k: number) => LotRoll | undefined) | undefined;
}

export interface GatherLotsResult extends GatherProgress {
  /** 낸 물건(자산 → 기본 단위 수, 사다리 차례) */
  readonly outputs: readonly { readonly asset: string; readonly qty: bigint }[];
  /** 끝낸 묶음 수(빈 묶음 포함) */
  readonly lots: number;
  /** 묶음 상한(maxLots)에 막혀 더 끝내지 못했나 */
  readonly capped: boolean;
  /** 물건이 나온 묶음 수(빈 묶음은 뺀다 — 채집 경험치가 센다)와 그 묶음들의 티어 합 */
  readonly landedLots: number;
  readonly tierSum: number;
}

/** 한 번 부를 때 끝내는 묶음 상한(잘못된 설정 값으로 도는 것을 막는다, 남은 진행은 다음 정산으로) */
const MAX_LOTS_PER_CALL = 100_000;

/** 묶음 차례의 추첨 난수 시드(유닛·차례만으로 정한다) */
function lotSeed(unitId: number, seq: number): number {
  return mix32(
    Math.imul(unitId >>> 0, 0x9e37_79b1) ^
      mix32((seq >>> 0) ^ Math.imul(Math.floor(seq / 0x1_0000_0000), 0x85eb_ca6b)),
  );
}

/**
 * 일한 주기 made를 쌓인 진행에 더하고, 차는 만큼 묶음을 끝내 물건을 낸다. 같은 (진행, seq, 입력)이면 같은 결과다.
 * 스탯 짝을 모르면(팩 오류) 기본 스탯(설정 칸 N9 ÷ 6)으로 센다
 */
export function gatherLots(progress: GatherProgress, made: number, input: GatherLotsInput): GatherLotsResult {
  const { site, settings } = input;
  const primary = statOf(input.primaries, site.rule.primary) ?? settings.defaultStat;
  const secondary = statOf(input.primaries, site.rule.secondary) ?? settings.defaultStat;
  const effects = workerEffects(
    site.rule,
    {
      level: Math.max(1, site.level),
      primaryStat: primary,
      secondaryStat: secondary,
      condition: clampCondition(input.condition ?? 0, { cap: settings.conditionCap ?? 0 }),
      plots: site.plots ?? 0,
      tier: site.tier,
    },
    settings,
  );
  const select = site.rule.mode === "select";
  const tickMs = Math.max(1, settings.tickMs ?? 60_000);
  const base = settings.tierProgressBase ?? 30;
  const step = settings.tierProgressStep ?? 30;
  let points = progress.points + Math.max(0, made) * effects.progress * Math.max(1, input.cycleMs);
  let seq = progress.seq;
  let lots = 0;
  let landedLots = 0;
  let tierSum = 0;
  let capped = false;
  const limit = Math.min(MAX_LOTS_PER_CALL, Math.max(0, Math.floor(input.maxLots ?? MAX_LOTS_PER_CALL)));
  const out = new Map<string, bigint>();
  for (;;) {
    const object = input.lotRoll?.(lots);
    const rolled = rollGatherOutputs(
      {
        ladder: object?.ladder ?? site.ladder,
        bands: site.bands,
        stat: effects.gatherStat,
        lots: 1,
        lotSize: site.lotSize,
        selectTier: select ? effects.selectTier : undefined,
        yieldPerLot: effects.yieldPerLot,
        yieldPm: select ? effects.yieldPm : undefined,
        successPm: effects.catchPm,
        harvestGrams: BigInt(settings.oreGrams ?? 1),
        tierRange: object?.tierRange,
        prefer: object?.prefer,
        weights: object?.weights,
        table: object?.table,
      },
      createRng(lotSeed(input.unitId, seq)),
    );
    // 나온 아이템 티어(빈 묶음은 T0)의 필요 진행(49 N44, 시뮬 nextBatch와 같은 셈)
    const tier = Math.max(
      0,
      rolled.landed.findIndex((count) => count > 0),
    );
    const need = Math.max(1, tierRequiredProgress(tier, base, step) * tickMs);
    if (points < need) break;
    if (lots >= limit) {
      // 묶음 상한(채집소 오브젝트): 다음 묶음 하나 몫까지만 남긴다
      if (input.maxLots !== undefined) {
        capped = true;
        points = need;
      }
      break;
    }
    points -= need;
    seq += 1;
    lots += 1;
    if (rolled.outputs.some((stack) => stack.qty > 0n)) {
      landedLots += 1;
      tierSum += tier;
    }
    for (const stack of rolled.outputs) out.set(stack.asset, (out.get(stack.asset) ?? 0n) + stack.qty);
  }
  // 사다리 차례로, 사다리 밖(굴림표 줄·다른 사다리 오브젝트)은 뒤에 처음 나온 차례로(같은 입력이면 같은 줄 차례)
  const ordered = new Set<string>();
  for (const choices of site.ladder) for (const asset of choices) if (out.has(asset)) ordered.add(asset);
  for (const asset of out.keys()) ordered.add(asset);
  const outputs: { asset: string; qty: bigint }[] = [];
  for (const asset of ordered) {
    const qty = out.get(asset);
    if (qty !== undefined && qty > 0n) outputs.push({ asset, qty });
  }
  return { points, seq, outputs, lots, capped, landedLots, tierSum };
}
