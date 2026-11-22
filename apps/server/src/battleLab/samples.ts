// 전투 실험실 샘플 프리셋(읽기 전용) — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 3절
// [임시] 모든 수치는 기술 출발값이다(기획 값 아님). 고치려면 화면에서 복제해 팀 프리셋으로 만든다.
// 처음 1차는 합 60(N9 출발값)에 성향에 맞춰 배분(D-445 168), K는 N6 범위(800~1200‰) 안.
// 팩 참조(종류·무기·장비·스킬)는 지금 팩(core)의 자료다(samples.test.ts가 실제 팩에서 본다).
import {
  type LabParty,
  type LabPresetView,
  type LabUnit,
  emptyLabGear,
  newLabUnit,
} from "@terra/shared/battleLab";

const p = (str: number, vit: number, int: number, wis: number, dex: number, agi: number) => ({
  str,
  vit,
  int,
  wis,
  dex,
  agi,
});

/** 속성값 12칸(ELEMENT_CODES 차례: 물·빙결·불·폭렬·바람·번개·땅·크리스탈·빛·성·어둠·사령) */
const elements = (values: Partial<Record<number, number>>): number[] =>
  Array.from({ length: 12 }, (_, index) => values[index] ?? 0);

// 모든 샘플은 기본 무기·장비와 그 무기에 맞는 스킬 1~2개를 든다(D-490, D-467 ② 정정). 스킬 기반(물리·속성)은 든 무기에
// 그 칸이 있게 고른다(물리 스킬 ↔ 칼, 속성 스킬 ↔ 속성 지팡이). 크리쳐는 무기 칸을 비우면 타고난 무기(발톱)를 무기로 쓴다(D-490).
// 사람형 칸: 0 무기·1 보조·2 머리·3 몸·4·5 장신구. 사이보그는 6~8 인공장기, 안드로이드는 6~8 파츠. 크리쳐는 0 무기·1 방어구·2 장신구.

const NEW_CYBORG: LabUnit = {
  ...newLabUnit("cyborg"),
  elements: elements({ 2: 6, 6: 4 }),
  weapon: { kind: "item", id: "test_sword", pm: 0 },
  equipment: [{ slot: 3, item: "test_vest", pm: 0 }],
  skills: [{ id: "power_strike", grade: 1 }],
};

const WARRIOR: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(14, 12, 6, 6, 12, 10),
  kPm: p(1100, 1000, 900, 900, 1000, 1000),
  elements: elements({ 2: 5, 4: 5 }),
  weapon: { kind: "item", id: "test_sword", pm: 500 },
  equipment: [
    { slot: 2, item: "test_helmet", pm: 500 },
    { slot: 3, item: "test_vest", pm: 500 },
    { slot: 4, item: "test_ring", pm: 500 },
  ],
  skills: [
    { id: "power_strike", grade: 1 },
    { id: "shock_bash", grade: 1 },
  ],
  row: "front",
};

const TANK: LabUnit = {
  ...newLabUnit("cyborg"),
  level: 30,
  initial: p(12, 16, 6, 10, 8, 8),
  kPm: p(1000, 1200, 900, 1000, 900, 900),
  elements: elements({ 6: 10 }),
  weapon: { kind: "item", id: "test_sword", pm: 200 },
  equipment: [
    { slot: 2, item: "test_helmet", pm: 1000 },
    { slot: 3, item: "test_vest", pm: 1000 },
    { slot: 6, item: "test_heart", pm: 1000 },
  ],
  gear: { ...emptyLabGear(), defenseFlat: 3 },
  skills: [
    { id: "shock_bash", grade: 1 },
    { id: "iron_skin", grade: 1 },
  ],
  row: "front",
};

const ASSASSIN: LabUnit = {
  ...newLabUnit("cyborg"),
  level: 30,
  initial: p(12, 8, 6, 6, 14, 14),
  kPm: p(1100, 900, 850, 850, 1150, 1200),
  elements: elements({ 4: 7, 2: 3 }),
  weapon: { kind: "item", id: "test_sword", pm: 900 },
  equipment: [
    { slot: 3, item: "test_vest", pm: 300 },
    { slot: 4, item: "test_ring", pm: 900 },
    { slot: 5, item: "test_ring", pm: 900 },
    { slot: 6, item: "test_heart", pm: 500 },
  ],
  skills: [
    { id: "power_strike", grade: 2 },
    { id: "first_aid", grade: 1 },
  ],
  row: "front",
};

const BERSERKER: LabUnit = {
  ...newLabUnit("cyborg"),
  level: 30,
  initial: p(18, 12, 4, 4, 12, 10),
  kPm: p(1200, 1050, 800, 800, 1100, 1050),
  elements: elements({ 2: 10 }),
  weapon: { kind: "item", id: "test_sword", pm: 1000 },
  equipment: [
    { slot: 3, item: "test_vest", pm: 400 },
    { slot: 4, item: "test_ring", pm: 1000 },
    { slot: 6, item: "test_heart", pm: 800 },
  ],
  skills: [
    { id: "power_strike", grade: 2 },
    { id: "war_cry", grade: 2 },
  ],
  row: "front",
};

const COMMANDER: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(12, 14, 6, 10, 10, 8),
  kPm: p(1050, 1100, 900, 1050, 1000, 950),
  elements: elements({ 6: 6, 0: 4 }),
  weapon: { kind: "item", id: "test_sword", pm: 600 },
  equipment: [
    { slot: 2, item: "test_helmet", pm: 700 },
    { slot: 3, item: "test_vest", pm: 700 },
    { slot: 4, item: "test_ring", pm: 500 },
  ],
  skills: [
    { id: "war_cry", grade: 2 },
    { id: "iron_skin", grade: 2 },
  ],
  row: "front",
  rank: { title: 3, combatTier: 1 },
};

const MAGE_FIRE: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(6, 8, 16, 12, 10, 8),
  kPm: p(900, 900, 1200, 1100, 1000, 900),
  elements: elements({ 2: 10 }),
  weapon: { kind: "item", id: "fire_staff", pm: 500 },
  equipment: [
    { slot: 3, item: "test_vest", pm: 0 },
    { slot: 4, item: "test_ring", pm: 0 },
  ],
  skills: [
    { id: "fire_bolt", grade: 2 },
    { id: "flame_burst", grade: 1 },
  ],
  row: "back",
};

const MAGE_FROST: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(6, 8, 15, 14, 9, 8),
  kPm: p(850, 950, 1150, 1150, 950, 950),
  elements: elements({ 0: 10 }),
  weapon: { kind: "item", id: "water_staff", pm: 600 },
  equipment: [
    { slot: 2, item: "test_helmet", pm: 300 },
    { slot: 3, item: "test_vest", pm: 400 },
  ],
  skills: [
    { id: "frost_bolt", grade: 2 },
    { id: "radiant_ward", grade: 1 },
  ],
  row: "back",
};

const MAGE_STORM: LabUnit = {
  ...newLabUnit("cyborg"),
  level: 30,
  initial: p(6, 8, 16, 10, 10, 10),
  kPm: p(850, 900, 1200, 1000, 1050, 1100),
  elements: elements({ 4: 10 }),
  weapon: { kind: "item", id: "wind_staff", pm: 700 },
  equipment: [
    { slot: 3, item: "test_vest", pm: 300 },
    { slot: 6, item: "test_heart", pm: 600 },
  ],
  skills: [
    { id: "chain_lightning", grade: 2 },
    { id: "fire_bolt", grade: 1 },
  ],
  row: "back",
};

const MAGE_EARTH: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(6, 12, 15, 11, 8, 8),
  kPm: p(900, 1100, 1150, 1050, 950, 900),
  elements: elements({ 6: 10 }),
  weapon: { kind: "item", id: "earth_staff", pm: 600 },
  equipment: [
    { slot: 2, item: "test_helmet", pm: 600 },
    { slot: 3, item: "test_vest", pm: 600 },
  ],
  skills: [
    { id: "stone_spike", grade: 2 },
    { id: "radiant_ward", grade: 1 },
  ],
  row: "middle",
};

const WARLOCK: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(6, 8, 16, 10, 12, 8),
  kPm: p(850, 900, 1200, 1000, 1100, 950),
  elements: elements({ 2: 6, 4: 4 }),
  weapon: { kind: "item", id: "dark_staff", pm: 700 },
  equipment: [
    { slot: 3, item: "test_vest", pm: 200 },
    { slot: 4, item: "test_ring", pm: 500 },
  ],
  skills: [
    { id: "dark_curse", grade: 2 },
    { id: "flame_burst", grade: 1 },
  ],
  row: "back",
};

const HEALER: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(6, 10, 12, 16, 8, 8),
  kPm: p(900, 1000, 1000, 1200, 900, 1000),
  elements: elements({ 0: 10 }),
  weapon: { kind: "item", id: "light_staff", pm: 500 },
  equipment: [
    { slot: 2, item: "test_helmet", pm: 0 },
    { slot: 3, item: "test_vest", pm: 0 },
  ],
  skills: [
    { id: "light_heal", grade: 2 },
    { id: "radiant_ward", grade: 1 },
  ],
  row: "middle",
};

const ANDROID_VANGUARD: LabUnit = {
  ...newLabUnit("android"),
  level: 30,
  initial: p(13, 14, 6, 8, 11, 8),
  kPm: p(1000, 1000, 1000, 1000, 1000, 1000),
  elements: elements({ 6: 5, 4: 5 }),
  weapon: { kind: "item", id: "test_sword", pm: 700 },
  equipment: [
    { slot: 2, item: "test_helmet", pm: 800 },
    { slot: 3, item: "test_vest", pm: 800 },
    { slot: 4, item: "test_ring", pm: 600 },
  ],
  skills: [
    { id: "shock_bash", grade: 2 },
    { id: "iron_skin", grade: 1 },
  ],
  row: "front",
};

const ANDROID_CASTER: LabUnit = {
  ...newLabUnit("android"),
  level: 30,
  initial: p(6, 9, 15, 11, 11, 8),
  kPm: p(1000, 1000, 1000, 1000, 1000, 1000),
  elements: elements({ 2: 5, 4: 5 }),
  weapon: { kind: "item", id: "fire_staff", pm: 700 },
  equipment: [
    { slot: 3, item: "test_vest", pm: 500 },
    { slot: 4, item: "test_ring", pm: 500 },
  ],
  skills: [
    { id: "flame_burst", grade: 2 },
    { id: "chain_lightning", grade: 1 },
  ],
  row: "back",
};

const LV50_CHAMPION: LabUnit = {
  ...newLabUnit("cyborg"),
  level: 50,
  rebirths: 2,
  initial: p(15, 13, 6, 6, 11, 9),
  kPm: p(1200, 1150, 900, 900, 1100, 1100),
  elements: elements({ 2: 6, 6: 4 }),
  weapon: { kind: "item", id: "test_sword", pm: 1000 },
  equipment: [
    { slot: 2, item: "test_helmet", pm: 1000 },
    { slot: 3, item: "test_vest", pm: 1000 },
    { slot: 4, item: "test_ring", pm: 1000 },
    { slot: 6, item: "test_heart", pm: 1000 },
  ],
  skills: [
    { id: "power_strike", grade: 3 },
    { id: "shock_bash", grade: 2 },
  ],
  row: "front",
  rank: { title: 4, combatTier: 0 },
};

const WOLF: LabUnit = {
  ...newLabUnit("creature"),
  level: 20,
  initial: p(12, 10, 4, 6, 12, 16),
  kPm: p(1000, 900, 800, 900, 1100, 1200),
  elements: elements({ 4: 4 }),
  equipment: [{ slot: 2, item: "test_ring", pm: 0 }],
  skills: [{ id: "power_strike", grade: 1 }],
  row: "front",
};

const GOLEM: LabUnit = {
  ...newLabUnit("creature"),
  level: 30,
  initial: p(16, 18, 6, 8, 6, 6),
  kPm: p(1100, 1200, 800, 900, 800, 800),
  elements: elements({ 6: 8, 7: 4 }),
  equipment: [{ slot: 2, item: "test_ring", pm: 1000 }],
  skills: [
    { id: "shock_bash", grade: 1 },
    { id: "iron_skin", grade: 2 },
  ],
  row: "front",
};

const sample = (
  id: string,
  ko: string,
  en: string,
  rest: { kind: "unit"; data: LabUnit } | { kind: "party"; data: LabParty },
): LabPresetView => ({
  id: `sample_${id}`,
  name: { ko, en },
  source: "sample",
  version: 0,
  updatedBy: null,
  updatedAtMs: null,
  ...rest,
});

/** 샘플 프리셋(목록 앞, 이 차례) */
export const LAB_SAMPLES: readonly LabPresetView[] = [
  // 유닛 샘플 — 역할·속성·종족·레벨별
  sample("new_cyborg", "새 사이보그", "New cyborg", { kind: "unit", data: NEW_CYBORG }),
  sample("lv30_warrior", "Lv 30 전사", "Lv 30 warrior", { kind: "unit", data: WARRIOR }),
  sample("lv30_tank", "Lv 30 탱커", "Lv 30 tank", { kind: "unit", data: TANK }),
  sample("lv30_assassin", "Lv 30 암살자(민첩)", "Lv 30 assassin (AGI)", { kind: "unit", data: ASSASSIN }),
  sample("lv30_berserker", "Lv 30 광전사(극공)", "Lv 30 berserker (STR)", { kind: "unit", data: BERSERKER }),
  sample("lv30_commander", "Lv 30 지휘관(버프)", "Lv 30 commander (buff)", {
    kind: "unit",
    data: COMMANDER,
  }),
  sample("lv30_mage_fire", "Lv 30 마법사(불)", "Lv 30 mage (fire)", { kind: "unit", data: MAGE_FIRE }),
  sample("lv30_mage_frost", "Lv 30 빙결 마법사(물)", "Lv 30 frost mage (water)", {
    kind: "unit",
    data: MAGE_FROST,
  }),
  sample("lv30_mage_storm", "Lv 30 번개 마법사(바람)", "Lv 30 storm mage (wind)", {
    kind: "unit",
    data: MAGE_STORM,
  }),
  sample("lv30_mage_earth", "Lv 30 대지 마법사(땅)", "Lv 30 earth mage (earth)", {
    kind: "unit",
    data: MAGE_EARTH,
  }),
  sample("lv30_warlock", "Lv 30 흑마법사(어둠)", "Lv 30 warlock (dark)", { kind: "unit", data: WARLOCK }),
  sample("lv30_healer", "Lv 30 치유사", "Lv 30 healer", { kind: "unit", data: HEALER }),
  sample("lv30_android_vanguard", "Lv 30 안드로이드 선봉", "Lv 30 android vanguard", {
    kind: "unit",
    data: ANDROID_VANGUARD,
  }),
  sample("lv30_android_caster", "Lv 30 안드로이드 포격", "Lv 30 android caster", {
    kind: "unit",
    data: ANDROID_CASTER,
  }),
  sample("lv50_champion", "Lv 50 최정예 사이보그", "Lv 50 elite cyborg", {
    kind: "unit",
    data: LV50_CHAMPION,
  }),
  sample("creature_wolf", "늑대(크리쳐)", "Wolf (creature)", { kind: "unit", data: WOLF }),
  sample("creature_golem", "골렘(크리쳐)", "Golem (creature)", { kind: "unit", data: GOLEM }),
  // 파티 샘플 — 소대·조합·규모별(군단전 조합용 포함)
  sample("party_lv30_mixed", "Lv 30 혼성 파티", "Lv 30 mixed party", {
    kind: "party",
    data: { units: [TANK, WARRIOR, MAGE_FIRE, HEALER], retreatHpPct: 0 },
  }),
  sample("party_creatures", "크리쳐 무리", "Creature pack", {
    kind: "party",
    data: { units: [GOLEM, WOLF, WOLF, WOLF], retreatHpPct: 0 },
  }),
  sample("party_new_cyborgs", "새 사이보그 넷", "Four new cyborgs", {
    kind: "party",
    data: { units: [NEW_CYBORG, NEW_CYBORG, NEW_CYBORG, NEW_CYBORG], retreatHpPct: 0 },
  }),
  sample("party_lv30_melee", "Lv 30 근접 돌격대(4명)", "Lv 30 melee rush (4)", {
    kind: "party",
    data: { units: [BERSERKER, WARRIOR, ASSASSIN, COMMANDER], retreatHpPct: 0 },
  }),
  sample("party_lv30_elemental", "Lv 30 원소 마법대(4명)", "Lv 30 elemental squad (4)", {
    kind: "party",
    data: { units: [MAGE_EARTH, MAGE_FIRE, MAGE_STORM, MAGE_FROST], retreatHpPct: 0 },
  }),
  sample("party_lv30_fortress", "Lv 30 철벽 수비대(4명)", "Lv 30 fortress guard (4)", {
    kind: "party",
    data: { units: [TANK, TANK, HEALER, HEALER], retreatHpPct: 0 },
  }),
  sample("party_lv30_full6", "Lv 30 정예 6인 풀파티", "Lv 30 full 6-unit party", {
    kind: "party",
    data: { units: [TANK, COMMANDER, WARRIOR, ASSASSIN, MAGE_STORM, HEALER], retreatHpPct: 0 },
  }),
  sample("party_lv30_androids", "Lv 30 안드로이드 소대(4명)", "Lv 30 android squad (4)", {
    kind: "party",
    data: { units: [ANDROID_VANGUARD, ANDROID_VANGUARD, ANDROID_CASTER, ANDROID_CASTER], retreatHpPct: 0 },
  }),
  sample("party_lv50_elite", "Lv 50 최정예 편대(4명)", "Lv 50 elite squad (4)", {
    kind: "party",
    data: {
      units: [LV50_CHAMPION, LV50_CHAMPION, { ...MAGE_STORM, level: 50 }, { ...HEALER, level: 50 }],
      retreatHpPct: 0,
    },
  }),
];
