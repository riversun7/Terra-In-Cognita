// 건물 테크트리 시각화 모델 — 목적별 열 배치, 티어(위상 깊이) 계산, 명시적 선행 조건(시안)·건설 재료 자동 추론 연결선,
// 레벨별 체인(재료 구간 전환·자리·내구도·창고·채집 보너스·모듈/달라지는 점). 순수 함수만 둔다(시험: buildingTechTree.test.ts).
// 추후 팩 스키마(facilities.json)에 tier·requires·levelModules 칸이 들어오면 TECH_TREE_DRAFT 조회 자리만 항목 값으로 갈아끼운다.
import {
  type BuildingEditorFacility,
  type BuildingEditorItem,
  type BuildingEditorListResponse,
  type FacilityJson,
  facilityCategoryOf,
} from "@terra/shared/buildingEditor";
import {
  OLD_FACILITY_RUNTIME_RULES,
  maxDurabilityAt,
  storageCapacityAt,
} from "@terra/shared/facilityRuntime";
import { type BuildingStage, levelRows, maxLevelOf } from "./buildingModel.ts";

/** 목적별 열 ID(순서 = 생산 흐름 → 저장·주거 → 정부·상업 → 공공·교통·군사). 열 재편 시 이 표와 techColumnOf만 고친다 */
export const TECH_TREE_COLUMN_IDS = [
  "gathering",
  "process",
  "manufacture",
  "storage",
  "housing",
  "administration",
  "commerce",
  "public",
  "transport",
  "military",
] as const;
export type TechTreeColumnId = (typeof TECH_TREE_COLUMN_IDS)[number];

/** 한/영 문구 쌍(시안 모듈·차이점 메모) */
export interface TechTreeText {
  readonly ko: string;
  readonly en: string;
}

/** 명시적 선행 조건 하나(추후 facilities.requires 스키마와 맞춘 모양) */
export interface TechPrerequisite {
  readonly facilityId: string;
  readonly minLevel?: number | undefined;
}

/** 시각화 시안의 시설별 테크트리 메타(추후 스키마로 옮길 자리) */
export interface FacilityTechDraft {
  /** 최소 티어 하한(없으면 선행·재료 깊이에서 자동 계산) */
  readonly minTier?: number | undefined;
  /** 명시적 선행 건물 조건(실선) */
  readonly requires?: readonly TechPrerequisite[] | undefined;
  /** 레벨별 모듈·달라지는 점 메모(시안) */
  readonly levelNotes?: Readonly<Record<number, readonly TechTreeText[]>> | undefined;
}

/** 연결선 종류: explicit = 명시적 선행 조건(실선), material = 건설 재료에서 유추된 생산 건물(점선) */
export type TechEdgeKind = "explicit" | "material";

export interface TechTreeEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: TechEdgeKind;
  /** 명시적 선행 조건의 최소 필요 레벨 */
  readonly minLevel?: number | undefined;
  /** 재료 기반 추론일 때 연결을 만든 아이템 ID 목록 */
  readonly items?: readonly string[] | undefined;
}

/** 레벨 한 칸의 재료 성격 */
export type MaterialKind = "none" | "raw" | "processed" | "mixed";

/** 같은 건물 아래에 붙는 레벨 노드 하나(Lv1 → Lv2 → … → maxLevel) */
export interface TechTreeLevelNode {
  readonly level: number;
  /** 앞 레벨과 다른 재료 구간이 시작하는가(예: Lv2에서 원자재 → 가공품 전환) */
  readonly bandChanged: boolean;
  readonly materialKind: MaterialKind;
  readonly materials: readonly { readonly item: string; readonly qty: number; readonly disabled: boolean }[];
  readonly timeMs: number;
  readonly slots: number;
  readonly slotsDelta: number;
  readonly durability: number;
  readonly durabilityDelta: number;
  readonly storageKg: number | null;
  readonly storageDeltaKg: number | null;
  readonly gatherBonus: number | null;
  readonly gatherBonusDelta: number | null;
  /** 레벨별 모듈·달라지는 점(시안) */
  readonly notes: readonly TechTreeText[];
}

export interface TechTreeNode {
  readonly id: string;
  readonly entry: FacilityJson;
  readonly column: TechTreeColumnId;
  readonly tier: number;
  readonly maxLevel: number;
  readonly staged: boolean;
  readonly edited: boolean;
  readonly lv1MaterialKind: MaterialKind;
  /** 카드에 보이는 한 줄 요약(Lv1 모듈 메모 → 첫 특성 → 빈 문구) */
  readonly summary: TechTreeText;
  /** 팩·실효 항목에서 자동 추출한 고유 기능(수리·물가·조선·물류·거래소·채집 등) */
  readonly traits: readonly TechTreeText[];
  readonly levels: readonly TechTreeLevelNode[];
  /** 이 건물이 직접 필요로 하는 명시적 선행 조건 */
  readonly explicitRequires: readonly TechPrerequisite[];
  /** Lv1 건설 재료(비원자재)에서 유추된 선행 생산 시설 */
  readonly inferredProducers: readonly { readonly facilityId: string; readonly items: readonly string[] }[];
  readonly recipeCount: number;
}

export interface TechTreeTierRow {
  readonly tier: number;
  /** 열 ID → 그 티어·열에 놓인 건물 노드(이름/시안 순서 유지) */
  readonly cells: Readonly<Record<TechTreeColumnId, readonly TechTreeNode[]>>;
}

export interface TechTreeGraph {
  readonly columns: readonly TechTreeColumnId[];
  readonly tiers: readonly TechTreeTierRow[];
  readonly nodes: readonly TechTreeNode[];
  readonly byId: ReadonlyMap<string, TechTreeNode>;
  readonly edges: readonly TechTreeEdge[];
}

const t = (ko: string, en: string): TechTreeText => ({ ko, en });

/**
 * 시각화 전용 테크트리 시안 표(로컬 미리보기) — 스키마 변경 없이 선행 조건(실선)과 레벨별 모듈·차이점을 미리 보기 위한 표.
 * 팩에 없는 ID는 무시되고, 표에 없는 새 시설은 건설 재료(원자재/가공품)만으로 자동 배치된다.
 */
export const TECH_TREE_DRAFT: Readonly<Record<string, FacilityTechDraft>> = {
  // ── 채집(기초) ──
  farm: {
    levelNotes: {
      1: [t("기초 작물 재배(선택)", "Basic crop select")],
      2: [t("가공 자재 확장·고티어 작물 효율", "Plank upgrade · higher crop yield")],
      4: [t("대규모 경작 모듈(예정)", "Large tillage module (planned)")],
    },
  },
  lumber_camp: {
    levelNotes: {
      1: [t("원목 벌채(소나무·목재)", "Timber & pine logging")],
      2: [t("벌목장 보강·고티어 목재 확률", "Reinforced camp · higher wood tier")],
      4: [t("고급 임업 모듈(예정)", "Advanced forestry module (planned)")],
    },
  },
  mine: {
    levelNotes: {
      1: [t("석재·잡석·광석 채굴", "Stone, rubble & ore mining")],
      2: [t("갱도 보강·고티어 광석 확률", "Shored shaft · higher ore tier")],
      4: [t("심층 채굴 모듈(예정)", "Deep shaft module (planned)")],
    },
  },
  herb_field: {
    levelNotes: {
      1: [t("야생 약초 채집(선택)", "Wild herb select")],
      2: [t("온실 보강·고티어 약초 해금", "Greenhouse frame · higher herbs")],
      4: [t("희귀 약초 모듈(예정)", "Rare herb module (planned)")],
    },
  },
  ranch: {
    levelNotes: {
      1: [t("축산물·부산물 동시 생산", "Livestock + byproduct output")],
      2: [t("축사 확장·사육 효율 상승", "Barn expansion · better yield")],
      4: [t("품종 개량 모듈(예정)", "Breeding module (planned)")],
    },
  },
  fishing_spot: {
    levelNotes: {
      1: [t("연안 어획·확률 판정", "Coastal catch · success roll")],
      2: [t("선착 보강·어획 티어 상승", "Pier upgrade · higher fish tier")],
      4: [t("원양 어구 모듈(예정)", "Deep-water rig module (planned)")],
    },
  },

  // ── 가공(1차 채집 선행) ──
  sawmill: {
    requires: [{ facilityId: "lumber_camp", minLevel: 1 }],
    levelNotes: {
      1: [t("원목 → 판자 가공", "Logs → planks")],
      2: [t("제재기 증설(판자·벽돌)", "Expanded sawbench")],
      4: [t("자동 제재 모듈(예정)", "Automated saw module (planned)")],
    },
  },
  kiln: {
    requires: [{ facilityId: "mine", minLevel: 1 }],
    levelNotes: {
      1: [t("잡석 → 벽돌 소성", "Rubble → bricks")],
      2: [t("고온 가마 보강", "High-heat kiln lining")],
      4: [t("특수 자재 소성 모듈(예정)", "Specialty kiln module (planned)")],
    },
  },
  smelter: {
    requires: [{ facilityId: "mine", minLevel: 1 }],
    levelNotes: {
      1: [t("광석 → 금속 주괴 제련", "Ore → metal ingots")],
      2: [t("용광로 보강(벽돌·판자)", "Reinforced furnace")],
      4: [t("희귀 금속 제련(철 주괴 투입)", "Rare alloy smelt (iron frame)")],
    },
  },

  // ── 제조 ──
  kitchen: {
    requires: [{ facilityId: "farm", minLevel: 1 }],
    levelNotes: {
      1: [t("기초 식량·배급 조리", "Basic food & rations")],
      2: [t("화덕 증설·대량 조리", "Multi-hearth expansion")],
      4: [t("고급 요리 모듈(예정)", "Fine cuisine module (planned)")],
    },
  },
  workshop: {
    requires: [
      { facilityId: "sawmill", minLevel: 1 },
      { facilityId: "smelter", minLevel: 1 },
    ],
    levelNotes: {
      1: [t("생활용품·어구 제작·장비 수리", "Goods, gear craft & equip repair")],
      2: [t("금속 가공 작업대(판자·주괴)", "Metalwork bench (planks & ingots)")],
      4: [t("정밀 제작 모듈(예정)", "Precision craft module (planned)")],
    },
  },

  // ── 창고·물류(기초 → 가공 자재·정부 등급) ──
  stockpile: {
    levelNotes: {
      1: [t("기초 노천 보관(선행 없음)", "Basic open storage (no prereq)")],
      2: [t("판자 울타리 보강", "Plank enclosure")],
    },
  },
  storehouse: {
    requires: [{ facilityId: "stockpile", minLevel: 1 }],
    levelNotes: {
      1: [t("표준 실내 보관", "Standard indoor storage")],
      2: [t("판자·벽돌 보강", "Plank & brick reinforcement")],
    },
  },
  logistics_center: {
    requires: [
      { facilityId: "storehouse", minLevel: 1 },
      { facilityId: "government_hall", minLevel: 1 },
    ],
    levelNotes: {
      1: [t("운반 대행·거래소/항만 짐 나르기", "Haul service · market & port")],
      2: [t("배차 창구 확장", "Expanded dispatch bays")],
      3: [t("광역 물류 모듈(예정)", "Regional logistics module (planned)")],
    },
  },
  warehouse: {
    requires: [
      { facilityId: "storehouse", minLevel: 2 },
      { facilityId: "government_hall", minLevel: 2 },
    ],
    levelNotes: {
      1: [t("대용량 보관(건축 자재 필요)", "Bulk storage (processed mats)")],
      4: [t("철골 보강 모듈", "Iron-frame reinforcement")],
    },
  },
  grand_warehouse: {
    requires: [
      { facilityId: "warehouse", minLevel: 2 },
      { facilityId: "government_hall", minLevel: 3 },
    ],
    levelNotes: {
      1: [t("초대형 보관(철 주괴·정부 Lv3)", "Mega storage (ingots · Gov Lv3)")],
      4: [t("중금속 금고 모듈(예정)", "Heavy vault module (planned)")],
    },
  },

  // ── 주거 ──
  lodging: {
    levelNotes: {
      1: [t("기본 휴먼 쉼터(선행 없음)", "Basic shelter (no prereq)")],
      2: [t("가공 자재 증축", "Plank & brick expansion")],
      3: [t("상급 주거 모듈(예정)", "Upper housing module (planned)")],
    },
  },

  // ── 정부·행정 ──
  government_hall: {
    levelNotes: {
      1: [
        t(
          "도시 행정·세금 · 1차 공공/물자 거래소 해금",
          "Civic admin & tax · unlocks T1 public & goods exchange",
        ),
      ],
      2: [
        t("중앙창고 · 외환/유닛 거래소 · 연구소 해금", "Unlocks Warehouse, FX/Unit exchange & Biotech lab"),
      ],
      3: [t("대규모 창고 · 증권 거래소 해금", "Unlocks Grand warehouse & Stock exchange")],
    },
  },

  // ── 상업·금융(정부 선행) ──
  goods_exchange: {
    requires: [{ facilityId: "government_hall", minLevel: 1 }],
    levelNotes: {
      1: [t("물자 통합 호가창·세금 연계", "Unified goods orderbook & tax")],
      2: [t("호가 처리 확장", "Expanded order desk")],
      3: [t("광역 거래소 모듈(예정)", "Regional market module (planned)")],
    },
  },
  fx_exchange: {
    requires: [
      { facilityId: "goods_exchange", minLevel: 1 },
      { facilityId: "government_hall", minLevel: 2 },
    ],
    levelNotes: {
      1: [t("세력 화폐 환전 창구", "Faction currency FX desk")],
      2: [t("유동성 확장", "Expanded FX liquidity")],
      3: [t("금융·은행 연동 모듈(예정)", "Banking bridge module (planned)")],
    },
  },
  unit_exchange: {
    requires: [
      { facilityId: "goods_exchange", minLevel: 1 },
      { facilityId: "government_hall", minLevel: 2 },
    ],
    levelNotes: {
      1: [t("유닛 중개 창구", "Unit brokerage desk")],
      2: [t("계약 슬롯 확장", "Expanded contract slots")],
      3: [t("고급 중개 모듈(예정)", "Elite brokerage module (planned)")],
    },
  },
  stock_exchange: {
    requires: [
      { facilityId: "fx_exchange", minLevel: 1 },
      { facilityId: "government_hall", minLevel: 3 },
    ],
    levelNotes: {
      1: [t("도시·사업장 지분 호가창", "City & business share market")],
      2: [t("배당·청산 확장", "Dividend & clearing expansion")],
      3: [t("자본시장 모듈(예정)", "Capital market module (planned)")],
    },
  },

  // ── 공공·연구 ──
  hospital: {
    requires: [{ facilityId: "government_hall", minLevel: 1 }],
    levelNotes: {
      1: [t("부상 치료·의사 배치", "Injury care & doctor slots")],
      2: [t("병동 증축", "Ward expansion")],
      4: [t("중환자 치료 모듈", "Intensive care module")],
    },
  },
  temple: {
    requires: [{ facilityId: "government_hall", minLevel: 1 }],
    levelNotes: {
      1: [t("기도·헌금·환생 집전", "Prayer, offering & rebirth")],
      2: [t("성소 증축", "Sanctuary expansion")],
      4: [t("신격화 의례 모듈", "Apotheosis rite module")],
    },
  },
  biotech_lab: {
    requires: [
      { facilityId: "hospital", minLevel: 1 },
      { facilityId: "government_hall", minLevel: 2 },
    ],
    levelNotes: {
      1: [t("유전자 추출·분석", "Gene extraction & analysis")],
      2: [t("배양 설비 증설", "Culture lab upgrade")],
      4: [t("고급 생명공학 모듈", "Advanced biotech module")],
    },
  },

  // ── 교통·항만 ──
  dock: {
    levelNotes: {
      1: [t("선박 정박(물가 필요)", "Ship berth (needs water)")],
      2: [t("계류장 보강", "Reinforced mooring")],
      3: [t("대형 선석 모듈(예정)", "Heavy berth module (planned)")],
    },
  },
  trade_dock: {
    requires: [{ facilityId: "dock", minLevel: 1 }],
    levelNotes: {
      1: [t("교역 상하역 부두", "Trade loading dock")],
      2: [t("하역 설비 보강", "Crane & pier upgrade")],
      3: [t("대규모 교역항 모듈(예정)", "Major trade port module (planned)")],
    },
  },
  shipyard: {
    requires: [
      { facilityId: "dock", minLevel: 1 },
      { facilityId: "sawmill", minLevel: 1 },
    ],
    levelNotes: {
      1: [t("선박 건조·수리", "Ship construction & repair")],
      2: [t("중형 선대(철 주괴 투입)", "Medium slipway (iron ingots)")],
      3: [t("대형 조선 독 모듈(예정)", "Heavy drydock module (planned)")],
    },
  },

  // ── 군사·방어 ──
  territory_beacon: {
    levelNotes: {
      1: [t("1차맵 영토 선포·경계 유지", "Primary-map territory claim")],
    },
  },
  city_wall: {
    requires: [{ facilityId: "government_hall", minLevel: 1 }],
    levelNotes: {
      1: [t("도시 방어·공성 저지선", "City defense & siege barrier")],
    },
  },
};

/** 시설의 목적별 열을 고른다(가공·제작만 process / part·finish로 2열 분리) */
export function techColumnOf(entry: FacilityJson): TechTreeColumnId {
  const category = facilityCategoryOf(entry);
  if (category === "processing") {
    return entry.stage === "process" ? "process" : "manufacture";
  }
  return category;
}

/** 담은 변경(BuildingStage)을 반영한 실효 시설 항목을 돌려준다 */
export function effectiveEntryOf(row: BuildingEditorFacility, stage: BuildingStage): FacilityJson {
  const staged = stage.facilities.get(row.entry.id);
  if (staged?.op === "put") return staged.entry;
  if (staged?.op === "revert") return row.pack ?? row.entry;
  return row.entry;
}

/** 재료 줄 목록의 재료 성격(원자재만 / 가공품만 / 섞임 / 없음) */
export function classifyMaterials(
  materials: readonly { readonly item: string }[],
  itemById: ReadonlyMap<string, BuildingEditorItem>,
): MaterialKind {
  if (materials.length === 0) return "none";
  let hasRaw = false;
  let hasProcessed = false;
  for (const stack of materials) {
    const item = itemById.get(stack.item);
    if (item?.category === "raw") hasRaw = true;
    else hasProcessed = true;
  }
  if (hasRaw && hasProcessed) return "mixed";
  return hasProcessed ? "processed" : "raw";
}

/** 아이템 ID → 생산 시설 ID 목록(레시피 산출 기준; 비원자재 건설 재료 추론용) */
function buildProducerIndex(
  rows: readonly BuildingEditorFacility[],
  entriesById: ReadonlyMap<string, FacilityJson>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (itemId: string, facilityId: string): void => {
    const list = map.get(itemId);
    if (!list) {
      map.set(itemId, [facilityId]);
      return;
    }
    if (!list.includes(facilityId)) list.push(facilityId);
  };
  for (const row of rows) {
    if (!entriesById.has(row.entry.id)) continue;
    for (const recipe of row.recipes) {
      if (!recipe.enabled) continue;
      for (const out of recipe.outputs) add(out.item, row.entry.id);
    }
  }
  return map;
}

/** 시설의 실효 속성에서 Lv1 특성 칩 목록을 뽑는다 */
function extractTraits(
  entry: FacilityJson,
  row: BuildingEditorFacility,
  subById: ReadonlyMap<string, TechTreeText>,
): TechTreeText[] {
  const traits: TechTreeText[] = [];
  if (entry.gather) {
    const sub = subById.get(entry.gather.subcategory);
    traits.push(
      sub
        ? t(`채집: ${sub.ko}`, `Gather: ${sub.en}`)
        : t(`채집: ${entry.gather.subcategory}`, `Gather: ${entry.gather.subcategory}`),
    );
  }
  if (entry.repair && entry.repair.length > 0) traits.push(t("장비 수리", "Equip repair"));
  if (entry.needsWaterWithin !== undefined)
    traits.push(t(`물가 ${entry.needsWaterWithin}칸`, `Water ≤${entry.needsWaterWithin}`));
  if (entry.harbor === "shipyard")
    traits.push(t(`배 건조(${entry.boats?.length ?? 0}종)`, `Shipyard (${entry.boats?.length ?? 0})`));
  else if (entry.harbor === "berth") traits.push(t("정박", "Berth"));
  else if (entry.harbor === "trade_dock") traits.push(t("교역 상하역", "Trade loading"));
  if (entry.logistics) traits.push(t("운반 대행", "Haul service"));
  if (entry.exchange === "goods") traits.push(t("물자 거래소", "Goods market"));
  else if (entry.exchange === "fx") traits.push(t("외환 거래소", "FX market"));
  else if (entry.exchange === "units") traits.push(t("유닛 거래소", "Unit market"));
  else if (entry.exchange === "securities") traits.push(t("증권 거래소", "Stock market"));
  if (!entry.footprint) traits.push(t("1차맵 설치", "Primary map"));
  const activeRecipes = row.recipes.filter((recipe) => recipe.enabled).length;
  if (activeRecipes > 0 && !entry.gather) {
    traits.push(t(`레시피 ${activeRecipes}개`, `${activeRecipes} recipes`));
  }
  return traits;
}

/** 위상 깊이로 각 시설의 티어(0부터)를 계산한다(순환은 visited로 막아 무한 루프를 방지) */
function computeTiers(
  ids: readonly string[],
  edges: readonly TechTreeEdge[],
  lv1KindById: ReadonlyMap<string, MaterialKind>,
  draft: Readonly<Record<string, FacilityTechDraft>>,
  includeMaterialInTier: boolean,
): Map<string, number> {
  const incoming = new Map<string, string[]>();
  for (const id of ids) incoming.set(id, []);
  for (const edge of edges) {
    if (edge.kind === "material" && !includeMaterialInTier) continue;
    incoming.get(edge.to)?.push(edge.from);
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);

    const minDraft = draft[id]?.minTier ?? 0;
    const lv1Kind = lv1KindById.get(id) ?? "none";
    // 기초 원자재가 아닌 가공품이 Lv1에 필요하면 최소 T1 아래로 내려간다
    let best = Math.max(minDraft, lv1Kind === "processed" || lv1Kind === "mixed" ? 1 : 0);

    for (const parent of incoming.get(id) ?? []) {
      if (parent === id) continue;
      best = Math.max(best, depthOf(parent) + 1);
    }

    visiting.delete(id);
    memo.set(id, best);
    return best;
  };

  for (const id of ids) depthOf(id);
  return memo;
}

export interface BuildTechTreeOptions {
  /** 건설 재료에서 유추된 점선 연결선도 티어(세로 깊이) 계산에 반영할지(기본 true) */
  readonly includeMaterialEdges?: boolean | undefined;
  /** 커스텀 시안 표(시험용, 기본 TECH_TREE_DRAFT) */
  readonly draft?: Readonly<Record<string, FacilityTechDraft>> | undefined;
}

/** 건물 편집기 목록 + 담은 변경 → 목적별 열 × 티어 행 테크트리 그래프 */
export function buildTechTree(
  list: BuildingEditorListResponse,
  stage: BuildingStage,
  options?: BuildTechTreeOptions,
): TechTreeGraph {
  const includeMaterialEdges = options?.includeMaterialEdges ?? true;
  const draft = options?.draft ?? TECH_TREE_DRAFT;

  const itemById = new Map(list.items.map((item) => [item.id, item]));
  const subById = new Map(list.subcategories.map((sub) => [sub.id, sub.name]));
  const entriesById = new Map<string, FacilityJson>();
  for (const row of list.facilities) {
    entriesById.set(row.entry.id, effectiveEntryOf(row, stage));
  }

  const producerIndex = buildProducerIndex(list.facilities, entriesById);
  const edges: TechTreeEdge[] = [];
  const edgeKeys = new Set<string>();
  const explicitByFacility = new Map<string, TechPrerequisite[]>();
  const inferredByFacility = new Map<string, { facilityId: string; items: string[] }[]>();
  const lv1KindById = new Map<string, MaterialKind>();

  // 1단계: 명시적 선행 조건(실선) + Lv1 비원자재 재료 기반 생산 건물(점선) 수집
  for (const row of list.facilities) {
    const id = row.entry.id;
    const entry = entriesById.get(id)!;
    const lv1Materials = entry.build?.levels.find((band) => band.from === 1)?.materials ?? [];
    lv1KindById.set(id, classifyMaterials(lv1Materials, itemById));

    const explicit: TechPrerequisite[] = [];
    for (const req of draft[id]?.requires ?? []) {
      if (req.facilityId === id || !entriesById.has(req.facilityId)) continue;
      explicit.push(req);
      const key = `explicit:${req.facilityId}->${id}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({
          id: key,
          from: req.facilityId,
          to: id,
          kind: "explicit",
          minLevel: req.minLevel,
        });
      }
    }
    explicitByFacility.set(id, explicit);

    // Lv1 재료 중 원자재가 아닌 가공품/부품의 생산 건물을 자동 연결한다
    const byProducer = new Map<string, string[]>();
    for (const stack of lv1Materials) {
      const item = itemById.get(stack.item);
      if (!item || item.category === "raw") continue;
      for (const producerId of producerIndex.get(stack.item) ?? []) {
        if (producerId === id) continue;
        const items = byProducer.get(producerId);
        if (!items) byProducer.set(producerId, [stack.item]);
        else if (!items.includes(stack.item)) items.push(stack.item);
      }
    }

    const inferred: { facilityId: string; items: string[] }[] = [];
    for (const [producerId, items] of byProducer) {
      inferred.push({ facilityId: producerId, items });
      const key = `material:${producerId}->${id}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({
          id: key,
          from: producerId,
          to: id,
          kind: "material",
          items,
        });
      }
    }
    inferredByFacility.set(id, inferred);
  }

  // 2단계: 티어(위상 깊이) 계산
  const ids = list.facilities.map((row) => row.entry.id);
  const tiersById = computeTiers(ids, edges, lv1KindById, draft, includeMaterialEdges);

  // 3단계: 시설 노드 + 레벨 체인 구성
  const nodes: TechTreeNode[] = list.facilities.map((row) => {
    const id = row.entry.id;
    const entry = entriesById.get(id)!;
    const computedLevels = levelRows(entry, list.items, list.rules, list.gatherLevelBonus);
    const baseDurability = entry.durability ?? 100;
    const baseStorageKg = entry.storageKg;
    const notesMap = draft[id]?.levelNotes ?? {};

    let prevSlots = 0;
    let prevDurability = 0;
    let prevStorageKg: number | null = null;
    let prevGatherBonus: number | null = null;

    const levels: TechTreeLevelNode[] = computedLevels.map((lv) => {
      const durability = maxDurabilityAt(baseDurability, lv.level, OLD_FACILITY_RUNTIME_RULES);
      const storageKg =
        baseStorageKg === undefined
          ? null
          : storageCapacityAt(baseStorageKg, lv.level, OLD_FACILITY_RUNTIME_RULES);
      const gatherBonus = entry.gather ? lv.gatherBonus : null;

      const node: TechTreeLevelNode = {
        level: lv.level,
        bandChanged: lv.level > 1 && lv.from === lv.level,
        materialKind: classifyMaterials(lv.materials, itemById),
        materials: lv.materials.map((stack) => ({
          item: stack.item,
          qty: stack.qty,
          disabled: lv.disabled.includes(stack.item),
        })),
        timeMs: lv.timeMs,
        slots: lv.slots,
        slotsDelta: lv.level === 1 ? lv.slots : lv.slots - prevSlots,
        durability,
        durabilityDelta: lv.level === 1 ? durability : durability - prevDurability,
        storageKg,
        storageDeltaKg:
          storageKg === null
            ? null
            : lv.level === 1 || prevStorageKg === null
              ? storageKg
              : storageKg - prevStorageKg,
        gatherBonus,
        gatherBonusDelta:
          gatherBonus === null
            ? null
            : lv.level === 1 || prevGatherBonus === null
              ? gatherBonus
              : gatherBonus - prevGatherBonus,
        notes: notesMap[lv.level] ?? [],
      };

      prevSlots = lv.slots;
      prevDurability = durability;
      prevStorageKg = storageKg;
      prevGatherBonus = gatherBonus;
      return node;
    });

    const traits = extractTraits(entry, row, subById);
    const summary: TechTreeText = levels[0]?.notes[0] ?? traits[0] ?? t(entry.name.ko, entry.name.en);

    return {
      id,
      entry,
      column: techColumnOf(entry),
      tier: tiersById.get(id) ?? 0,
      maxLevel: maxLevelOf(entry),
      staged: stage.facilities.has(id),
      edited: row.origin !== "pack",
      lv1MaterialKind: lv1KindById.get(id) ?? "none",
      summary,
      traits,
      levels,
      explicitRequires: explicitByFacility.get(id) ?? [],
      inferredProducers: inferredByFacility.get(id) ?? [],
      recipeCount: row.recipes.filter((recipe) => recipe.enabled).length,
    };
  });

  // 4단계: 티어 행 × 목적별 열 격자 배치
  const maxTier = nodes.reduce((max, node) => Math.max(max, node.tier), 0);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const tiers: TechTreeTierRow[] = [];
  for (let tier = 0; tier <= maxTier; tier += 1) {
    const cells: Record<TechTreeColumnId, TechTreeNode[]> = {
      gathering: [],
      process: [],
      manufacture: [],
      storage: [],
      housing: [],
      administration: [],
      commerce: [],
      public: [],
      transport: [],
      military: [],
    };
    for (const node of nodes) {
      if (node.tier === tier) cells[node.column].push(node);
    }
    tiers.push({ tier, cells });
  }

  return {
    columns: TECH_TREE_COLUMN_IDS,
    tiers,
    nodes,
    byId,
    edges,
  };
}

/** 선택한 노드의 상위 선행 조상(upstream)과 하위 해금 후손(downstream) ID 집합을 구한다 */
export function relatedNodesOf(
  selectedId: string | null,
  edges: readonly TechTreeEdge[],
  includeMaterialEdges: boolean,
): {
  readonly upstream: ReadonlySet<string>;
  readonly downstream: ReadonlySet<string>;
  readonly activeEdgeIds: ReadonlySet<string>;
} {
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const activeEdgeIds = new Set<string>();
  if (!selectedId) return { upstream, downstream, activeEdgeIds };

  const activeEdges = includeMaterialEdges ? edges : edges.filter((edge) => edge.kind === "explicit");

  // 조상 탐색(selectedId ← from)
  const upQueue = [selectedId];
  while (upQueue.length > 0) {
    const cur = upQueue.pop()!;
    for (const edge of activeEdges) {
      if (edge.to !== cur) continue;
      activeEdgeIds.add(edge.id);
      if (!upstream.has(edge.from) && edge.from !== selectedId) {
        upstream.add(edge.from);
        upQueue.push(edge.from);
      }
    }
  }

  // 후손 탐색(selectedId → to)
  const downQueue = [selectedId];
  while (downQueue.length > 0) {
    const cur = downQueue.pop()!;
    for (const edge of activeEdges) {
      if (edge.from !== cur) continue;
      activeEdgeIds.add(edge.id);
      if (!downstream.has(edge.to) && edge.to !== selectedId) {
        downstream.add(edge.to);
        downQueue.push(edge.to);
      }
    }
  }

  return { upstream, downstream, activeEdgeIds };
}

/** 창고 용량(kg)을 읽기 쉬운 단위(kg / t)로 바꾼다 */
export function formatStorageKg(kg: number): string {
  if (kg >= 1000) {
    const tons = kg / 1000;
    return Number.isInteger(tons) ? `${tons}t` : `${tons.toFixed(1)}t`;
  }
  return `${kg}kg`;
}

const fmtCoord = (n: number): string => n.toFixed(1);

/**
 * 둥근 모서리 직각(회로형) SVG 경로를 만든다: (x1,y1) ↓ midY → x2 ↓ (x2,y2).
 * 세로 일직선이면 직선 하나, 가로로 꺾이면 반지름 r만큼 2차 베지어(Q)로 둥글린다.
 */
export function buildOrthogonalPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  midY: number,
  radius = 10,
): string {
  const dx = x2 - x1;
  if (Math.abs(dx) < 2) {
    return `M ${fmtCoord(x1)} ${fmtCoord(y1)} L ${fmtCoord(x2)} ${fmtCoord(y2)}`;
  }
  const signX = dx > 0 ? 1 : -1;
  const dy1 = midY - y1;
  const dy2 = y2 - midY;
  const signY1 = dy1 >= 0 ? 1 : -1;
  const signY2 = dy2 >= 0 ? 1 : -1;
  const r = Math.min(radius, Math.abs(dx) / 2, Math.abs(dy1) / 2, Math.abs(dy2) / 2);
  if (r < 1.5) {
    return `M ${fmtCoord(x1)} ${fmtCoord(y1)} L ${fmtCoord(x1)} ${fmtCoord(midY)} L ${fmtCoord(x2)} ${fmtCoord(midY)} L ${fmtCoord(x2)} ${fmtCoord(y2)}`;
  }
  return [
    `M ${fmtCoord(x1)} ${fmtCoord(y1)}`,
    `L ${fmtCoord(x1)} ${fmtCoord(midY - signY1 * r)}`,
    `Q ${fmtCoord(x1)} ${fmtCoord(midY)} ${fmtCoord(x1 + signX * r)} ${fmtCoord(midY)}`,
    `L ${fmtCoord(x2 - signX * r)} ${fmtCoord(midY)}`,
    `Q ${fmtCoord(x2)} ${fmtCoord(midY)} ${fmtCoord(x2)} ${fmtCoord(midY + signY2 * r)}`,
    `L ${fmtCoord(x2)} ${fmtCoord(y2)}`,
  ].join(" ");
}

/** 옆면에서 출발해 꺾여 목표 위쪽으로 들어가는 둥근 직각 경로(Lv2+ 레벨 알약 → 하위 건물) */
export function buildSideExitPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stub: number,
  radius = 10,
): string {
  const goRight = x2 >= x1;
  const dir = goRight ? 1 : -1;
  const targetX = x2;
  const elbowX = goRight ? Math.max(x1 + stub, targetX) : Math.min(x1 - stub, targetX);
  // 단순 L자(옆으로 나가서 바로 targetX 위에서 아래로 꺾임)가 가능하면 한 번만 꺾는다
  if ((goRight && targetX >= x1 + stub) || (!goRight && targetX <= x1 - stub)) {
    const dy = y2 - y1;
    const signY = dy >= 0 ? 1 : -1;
    const r = Math.min(radius, Math.abs(targetX - x1) / 2, Math.abs(dy) / 2);
    if (r < 1.5)
      return `M ${fmtCoord(x1)} ${fmtCoord(y1)} L ${fmtCoord(targetX)} ${fmtCoord(y1)} L ${fmtCoord(targetX)} ${fmtCoord(y2)}`;
    return [
      `M ${fmtCoord(x1)} ${fmtCoord(y1)}`,
      `L ${fmtCoord(targetX - dir * r)} ${fmtCoord(y1)}`,
      `Q ${fmtCoord(targetX)} ${fmtCoord(y1)} ${fmtCoord(targetX)} ${fmtCoord(y1 + signY * r)}`,
      `L ${fmtCoord(targetX)} ${fmtCoord(y2)}`,
    ].join(" ");
  }
  // 목표가 반대쪽이거나 너무 가까우면 잠깐 옆으로 뺀 뒤 중간 높이에서 돌아 들어간다
  const midY = (y1 + y2) / 2;
  return `M ${fmtCoord(x1)} ${fmtCoord(y1)} L ${fmtCoord(elbowX)} ${fmtCoord(y1)} L ${fmtCoord(elbowX)} ${fmtCoord(midY)} L ${fmtCoord(targetX)} ${fmtCoord(midY)} L ${fmtCoord(targetX)} ${fmtCoord(y2)}`;
}

/** 테크트리 검색어(이름·ID·요약·레벨 메모·재료 이름) 일치 여부 */
export function matchesTechQuery(
  node: TechTreeNode,
  rawQuery: string,
  itemNames: ReadonlyMap<string, string>,
  locale: "ko" | "en",
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (q === "") return true;
  if (node.id.toLowerCase().includes(q)) return true;
  if (node.entry.name.ko.toLowerCase().includes(q)) return true;
  if (node.entry.name.en.toLowerCase().includes(q)) return true;
  if (node.summary[locale].toLowerCase().includes(q)) return true;
  for (const trait of node.traits) {
    if (trait[locale].toLowerCase().includes(q)) return true;
  }
  for (const lv of node.levels) {
    for (const note of lv.notes) {
      if (note[locale].toLowerCase().includes(q)) return true;
    }
    for (const mat of lv.materials) {
      if (mat.item.toLowerCase().includes(q)) return true;
      if ((itemNames.get(mat.item) ?? "").toLowerCase().includes(q)) return true;
    }
  }
  return false;
}
