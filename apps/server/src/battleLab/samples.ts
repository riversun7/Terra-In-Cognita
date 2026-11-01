// 전투 실험실 샘플 프리셋(읽기 전용) — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 3절
// [임시] 모든 수치는 기술 출발값이다(기획 값 아님). 고치려면 화면에서 복제해 팀 프리셋으로 만든다.
// 처음 1차는 합 60(N9 출발값)에 두 칸을 올린 성향 모양(D-445 168), K는 N6 범위(800~1200‰) 안. Lv 30은 48 §3.5 예의 레벨.
// 팩 참조(종류·무기·장비·스킬)는 지금 팩(core)의 시험 자료다(samples.test.ts가 실제 팩에서 본다). 마법 스킬·속성 지팡이가
// 팩에 생기면(work/mage-skills) 마법사·치유사 샘플을 그 스킬로 바꾼다.
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

const NEW_CYBORG: LabUnit = {
  ...newLabUnit("cyborg"),
  // 생성 규칙(D-450): 4원소 두 칸에 10점
  elements: elements({ 2: 6, 6: 4 }),
};

const WARRIOR: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(14, 12, 6, 6, 12, 10),
  kPm: p(1100, 1000, 900, 900, 1000, 1000),
  elements: elements({ 2: 5, 4: 5 }),
  weapon: { kind: "item", id: "test_sword", pm: 500 },
  // 사람형 칸: 0 무기·1 보조·2 머리·3 몸·4·5 장신구
  equipment: [
    { slot: 2, item: "test_helmet", pm: 500 },
    { slot: 3, item: "test_vest", pm: 500 },
    { slot: 4, item: "test_ring", pm: 500 },
  ],
  skills: [
    { id: "power_strike", grade: 1 },
    { id: "war_cry", grade: 1 },
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
  // 사이보그 칸: 0 무기·1 보조·2 머리·3 몸·4·5 장신구·6~8 인공장기
  equipment: [
    { slot: 2, item: "test_helmet", pm: 1000 },
    { slot: 3, item: "test_vest", pm: 1000 },
    { slot: 6, item: "test_heart", pm: 1000 },
  ],
  gear: { ...emptyLabGear(), defenseFlat: 3 },
  skills: [
    { id: "iron_skin", grade: 1 },
    { id: "shock_bash", grade: 1 },
    { id: "first_aid", grade: 1 },
  ],
  row: "front",
};

const MAGE_FIRE: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(6, 8, 16, 12, 10, 8),
  kPm: p(900, 900, 1200, 1100, 1000, 900),
  elements: elements({ 2: 10 }),
  weapon: { kind: "item", id: "test_staff", pm: 500 },
  equipment: [{ slot: 4, item: "test_ring", pm: 0 }],
  skills: [
    { id: "fire_bolt", grade: 2 },
    { id: "war_cry", grade: 1 },
  ],
  row: "back",
};

const HEALER: LabUnit = {
  ...newLabUnit("human"),
  level: 30,
  initial: p(6, 10, 12, 16, 8, 8),
  kPm: p(900, 1000, 1000, 1200, 900, 1000),
  elements: elements({ 0: 10 }),
  weapon: { kind: "item", id: "test_staff", pm: 0 },
  // 지금 팩에는 아군 회복 스킬이 없다: 자기 회복(first_aid)·아군 공격 버프(war_cry)
  skills: [
    { id: "first_aid", grade: 3 },
    { id: "war_cry", grade: 2 },
    { id: "fire_bolt", grade: 1 },
  ],
  row: "middle",
};

const WOLF: LabUnit = {
  ...newLabUnit("creature"),
  level: 20,
  initial: p(12, 10, 4, 6, 12, 16),
  kPm: p(1000, 900, 800, 900, 1100, 1200),
  elements: elements({ 4: 4 }),
  skills: [
    { id: "power_strike", grade: 1 },
    { id: "shock_bash", grade: 1 },
  ],
  row: "front",
};

const GOLEM: LabUnit = {
  ...newLabUnit("creature"),
  level: 30,
  initial: p(16, 18, 6, 8, 6, 6),
  kPm: p(1100, 1200, 800, 900, 800, 800),
  elements: elements({ 6: 8, 7: 4 }),
  skills: [
    { id: "iron_skin", grade: 2 },
    { id: "shock_bash", grade: 1 },
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
  sample("new_cyborg", "새 사이보그", "New cyborg", { kind: "unit", data: NEW_CYBORG }),
  sample("lv30_warrior", "Lv 30 전사", "Lv 30 warrior", { kind: "unit", data: WARRIOR }),
  sample("lv30_tank", "Lv 30 탱커", "Lv 30 tank", { kind: "unit", data: TANK }),
  sample("lv30_mage_fire", "Lv 30 마법사(불)", "Lv 30 mage (fire)", { kind: "unit", data: MAGE_FIRE }),
  sample("lv30_healer", "Lv 30 치유사", "Lv 30 healer", { kind: "unit", data: HEALER }),
  sample("creature_wolf", "늑대(크리쳐)", "Wolf (creature)", { kind: "unit", data: WOLF }),
  sample("creature_golem", "골렘(크리쳐)", "Golem (creature)", { kind: "unit", data: GOLEM }),
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
];
