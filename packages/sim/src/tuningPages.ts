// 설정 칸 → 개발자 패널 분야 페이지 — docs/adr/2026-11-01-dev-settings-panel.md "바뀜 (2026-11-08 분야별 페이지)"
// 칸이 어느 페이지에 서는지는 그 칸을 읽는 규칙(어느 TUNING_KEYS 묶음·계수표 경로)이 정한다. 새 칸을 묶음에 더하면 저절로 그 페이지에 선다.
// 페이지 = 규칙 ADR: 세력·사회(faction-society-core), NPC 두뇌(npc-brain-r5), 정원사(gardener-r5b), 보유 아이템(item-holdings),
// 전투 코어(combat-core), 경제 코어(economy-core), 그 밖(사이보그·융합·랭킹·영토·운영 스위치).
import type { TuningPage } from "@terra/shared/tuning";
import { TUNING_KEYS, type TuningKey } from "./tuning.ts";
import { BUILD_TUNING_KEYS } from "./tuningBuild.ts";
import { CONDITION_TUNING_KEYS } from "./tuningCondition.ts";
import { GARDENER_TUNING_KEYS } from "./tuningGardener.ts";
import { GATHER_OBJECT_TUNING_KEYS } from "./tuningGather.ts";
import { HOUSE_TUNING_KEYS } from "./tuningHouse.ts";
import { INJURY_TUNING_KEYS } from "./tuningInjury.ts";
import { LABOR_TUNING_KEYS } from "./tuningLabor.ts";
import { LOGISTICS_TUNING_KEYS } from "./tuningLogistics.ts";
import { BOAT_TUNING_KEYS } from "./tuningBoats.ts";
import { BUSINESS_TUNING_KEYS } from "./tuningBusiness.ts";
import { RECRUIT_TUNING_KEYS } from "./tuningRecruit.ts";
import { RESTORATION_TUNING_KEYS } from "./tuningRestoration.ts";
import { TEMPLE_TUNING_KEYS } from "./tuningTemple.ts";
import { VITALS_TUNING_KEYS } from "./tuningVitals.ts";
import { WAR_TUNING_KEYS } from "./tuningWar.ts";
import { WORLD_SEED_TUNING_KEYS } from "./tuningWorldSeed.ts";
import { ENCOUNTER_TUNING_KEYS } from "./tuningEncounter.ts";

/** 묶음 → 페이지(아래 경로 규칙보다 먼저 본다) */
const GROUP_PAGES: readonly (readonly [readonly TuningKey[], TuningPage])[] = [
  [GARDENER_TUNING_KEYS, "gardener"],
  [WORLD_SEED_TUNING_KEYS, "npc"],
  [VITALS_TUNING_KEYS, "combat"],
  [INJURY_TUNING_KEYS, "combat"],
  // 유닛 조우(D-564 1641·D-570) — 전투가 시작되는 길이라 전투 코어 페이지
  [ENCOUNTER_TUNING_KEYS, "combat"],
  [LABOR_TUNING_KEYS, "economy"],
  [BUILD_TUNING_KEYS, "economy"],
  [GATHER_OBJECT_TUNING_KEYS, "economy"],
  [LOGISTICS_TUNING_KEYS, "economy"],
  // 배(교통, docs/adr/2026-11-13-boats.md) — 부두·배 값이 건물 경제라 경제 코어 페이지
  [BOAT_TUNING_KEYS, "economy"],
  // 사업장 장부(D-548·D-555) — 경제 코어 페이지
  [BUSINESS_TUNING_KEYS, "economy"],
  // 컨디션(관리 보너스)은 채집 유효 스탯에 더한다(D-534) — 경제 코어. 초기 스탯 합 상한도 같은 묶음(N9)
  [CONDITION_TUNING_KEYS, "economy"],
  [WAR_TUNING_KEYS, "society"],
  [TEMPLE_TUNING_KEYS, "society"],
  [RESTORATION_TUNING_KEYS, "society"],
  [RECRUIT_TUNING_KEYS, "society"],
  [HOUSE_TUNING_KEYS, "society"],
];

/** 팩에만 있는 칸(규칙 코드가 아직 읽지 않음, 반영 범위 none)의 페이지 */
const PACK_ONLY_PAGES: Readonly<Record<string, TuningPage>> = {
  // 채집 시설 창고 용량(D-506, 시설 창고가 생기면 읽는다)
  d506_storage_per_level: "economy",
  // 장비 쓰기 굴림 흩어짐(D-496)
  d496_use_variance: "holdings",
};

/** 점 있는 경로 가운데 세력·사회 페이지에 서는 첫 마디(피로·주거 회복·만족도 목표·포만감 효율·발전도 식) */
const SOCIETY_HEADS: ReadonlySet<string> = new Set([
  "fatigueBands",
  "housingRecoveryPm",
  "satisfactionTarget",
  "foodEfficiency",
  "development",
]);

/** 묶음 규칙 → 경로 규칙 → 그 밖(사이보그·융합·랭킹·영토·운영 스위치) */
function pageOfKey(key: TuningKey, group: TuningPage | undefined): TuningPage {
  // 중앙은행 공식은 NPC 계수표 안에 있지만 경제 코어(D-131·ADR economy-core 7절) 칸이다
  if (key.path.startsWith("npc.bank")) return "economy";
  if (group) return group;
  if (key.target === "combat") return "combat";
  const head = key.path.split(".")[0] ?? "";
  if (head === "npc") return "npc";
  if (head === "durability" || head === "consumables") return "holdings";
  if (head.startsWith("gather")) return "economy";
  if (!key.path.includes(".") || SOCIETY_HEADS.has(head)) return "society";
  return "other";
}

function buildPages(): ReadonlyMap<string, TuningPage> {
  const groupOf = new Map<string, TuningPage>();
  for (const [keys, page] of GROUP_PAGES) for (const key of keys) groupOf.set(key.id, page);
  const pages = new Map<string, TuningPage>();
  for (const key of TUNING_KEYS) pages.set(key.id, pageOfKey(key, groupOf.get(key.id)));
  for (const [id, page] of Object.entries(PACK_ONLY_PAGES)) if (!pages.has(id)) pages.set(id, page);
  return pages;
}

let cache: ReadonlyMap<string, TuningPage> | undefined;

/** 칸 ID → 분야 페이지. 모르는 ID는 "other" */
export function tuningPageOf(id: string): TuningPage {
  cache ??= buildPages();
  return cache.get(id) ?? "other";
}

/** 시험·문서용: 칸 ID → 페이지 전체 표 */
export function tuningPageTable(): ReadonlyMap<string, TuningPage> {
  cache ??= buildPages();
  return cache;
}
