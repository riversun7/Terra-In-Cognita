// 시안 자료 — dev·admin이 유닛·사이보그 화면을 볼 때 쓰는 그럴듯한 자료(ADR 2026-10-29-app-shell 6절 "시안 자료"와 같은 스위치·권한
// home: preview. 이 화면들의 시안 범위는 ADR 37 "구현하며 정한 것 (유닛·사이보그 화면)").
// - 아직 없는 시스템(사이보그 본체·인벤토리·유닛 장비·파티·직무 프리셋·관리인·경매소·랭킹)의 모양을 보이려는 것이다.
//   모든 항목에 preview: true를 붙이고, 화면은 "시험 자료"를 표시하며 명령을 보내지 않는다.
// - 스탯은 지어내지 않고 계산한다: 초기값·K·레벨·장비를 정해 두고 서버 계산(body.ts)으로 낸다(팩 표가 바뀌면 값도 바뀐다).
// - 이름(사람·거점·파티·프리셋·매물)은 유저가 지은 이름처럼 두 언어에서 같은 글자다(D-6046, inbox/preview.ts와 같은 방식).
// - 시각은 지금(now)을 기준으로 만든다. ID는 p·q·pa·ps·b·a로 시작해 실제 세계 유닛 ID("w…")와 겹치지 않는다.
import type {
  CyborgBody,
  PartyRole,
  RosterAuctionLot,
  RosterBase,
  RosterJob,
  RosterJobPreset,
  RosterParty,
  RosterPrisoner,
  RosterUnit,
} from "@terra/shared/roster";
import { type Primaries, skillGradeCap } from "@terra/sim";
import { TEST_MAP_KEY, TEST_PLANET_ID } from "../world/world.ts";
import { type BodySpec, bodyView } from "./body.ts";
import type { RosterCatalog } from "./catalog.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** [STR, DEX, AGI, VIT, INT, WIS] → 1차 스탯 */
const p6 = ([str, dex, agi, vit, int, wis]: readonly [
  number,
  number,
  number,
  number,
  number,
  number,
]): Primaries => ({
  str,
  dex,
  agi,
  vit,
  int,
  wis,
});

interface PreviewUnitDef {
  readonly id: string;
  readonly name: string;
  readonly type: "human" | "creature" | "android";
  readonly level: number;
  readonly rebirths: number;
  readonly initial: Primaries;
  readonly k: Primaries | null;
  /** 칸 번호 → [아이템, 범위 안 자리 ‰] */
  readonly gear: readonly (readonly [number, string, number])[];
  readonly innate: readonly string[];
  readonly base: string | null;
  readonly job: RosterJob | null;
  readonly energy: number;
  /** 부상 [단계, 낫기까지 남은 시간] */
  readonly injury?: readonly [1 | 2 | 3, number];
  readonly captive?: boolean;
  readonly moving?: boolean;
  readonly cargo?: readonly (readonly [string, string])[];
  readonly satisfaction: number | null;
  readonly party: string | null;
}

const K_EVEN = p6([1000, 1000, 1000, 1000, 1000, 1000]);

/** 시안 유닛 10 — 휴먼·크리쳐·안드로이드, 일함·쉼·직무 없음, 부상 2단계, 포로로 잡힘, 이동 중, 낮은 만족도, 배터리 부족 */
const UNITS: readonly PreviewUnitDef[] = [
  {
    id: "p1",
    name: "Mina",
    type: "human",
    level: 18,
    rebirths: 0,
    initial: p6([14, 9, 9, 14, 6, 8]),
    k: p6([1150, 950, 1000, 1100, 850, 900]),
    gear: [
      [0, "test_sword", 600],
      [2, "test_helmet", 500],
      [3, "test_vest", 400],
      [4, "test_ring", 700],
    ],
    innate: ["power_strike", "iron_skin"],
    base: "Nova",
    job: { kind: "facility", facility: "mine", phase: "work" },
    energy: 46,
    satisfaction: 72,
    party: "pa1",
  },
  {
    id: "p2",
    name: "Joon",
    type: "human",
    level: 24,
    rebirths: 1,
    initial: p6([7, 9, 9, 9, 14, 12]),
    k: p6([900, 1000, 950, 1000, 1200, 1100]),
    gear: [
      [0, "test_staff", 800],
      [3, "test_vest", 200],
    ],
    innate: ["first_aid"],
    base: "Nova",
    job: { kind: "facility", facility: "farm", phase: "rest" },
    energy: 108,
    satisfaction: 55,
    party: "pa1",
  },
  {
    id: "p3",
    name: "Hana",
    type: "human",
    level: 9,
    rebirths: 0,
    initial: p6([8, 10, 11, 10, 9, 12]),
    k: p6([950, 1050, 1000, 1000, 1000, 1150]),
    gear: [[4, "test_ring", 300]],
    innate: ["first_aid"],
    base: "Nova",
    job: null,
    energy: 20,
    injury: [2, 3 * HOUR + 20 * MINUTE],
    satisfaction: 64,
    party: "pa1",
  },
  {
    id: "p4",
    name: "Rex",
    type: "creature",
    level: 12,
    rebirths: 0,
    initial: p6([15, 8, 13, 14, 4, 6]),
    k: p6([1100, 900, 1050, 1050, 800, 900]),
    gear: [[0, "test_ring", 500]],
    innate: ["shock_bash", "war_cry"],
    base: "Vega",
    job: null,
    energy: 64,
    satisfaction: null,
    party: "pa1",
  },
  {
    id: "p5",
    name: "Unit-07",
    type: "android",
    level: 1,
    rebirths: 0,
    initial: p6([18, 14, 10, 16, 8, 6]),
    k: null,
    gear: [[2, "test_helmet", 900]],
    innate: [],
    base: "Vega",
    job: { kind: "facility", facility: "lumber_camp", phase: "work" },
    energy: 62,
    satisfaction: null,
    party: null,
  },
  {
    id: "p6",
    name: "Sora",
    type: "human",
    level: 31,
    rebirths: 1,
    initial: p6([13, 12, 10, 12, 6, 7]),
    k: p6([1050, 1000, 1000, 1050, 900, 950]),
    gear: [[0, "test_sword", 300]],
    innate: ["power_strike"],
    base: null,
    job: null,
    energy: 90,
    injury: [1, 40 * MINUTE],
    captive: true,
    satisfaction: 40,
    party: null,
  },
  {
    id: "p7",
    name: "Dal",
    type: "human",
    level: 5,
    rebirths: 0,
    initial: p6([10, 10, 10, 10, 10, 10]),
    k: K_EVEN,
    gear: [],
    innate: [],
    base: "Vega",
    job: null,
    energy: 8,
    moving: true,
    satisfaction: 28,
    party: null,
  },
  {
    id: "p8",
    name: "Bori",
    type: "creature",
    level: 20,
    rebirths: 0,
    initial: p6([16, 6, 8, 18, 5, 7]),
    k: p6([1100, 850, 900, 1200, 800, 950]),
    gear: [],
    innate: ["iron_skin"],
    base: "Vega",
    job: null,
    energy: 30,
    satisfaction: null,
    party: "pa2",
  },
  {
    id: "p9",
    name: "Minho",
    type: "human",
    level: 14,
    rebirths: 0,
    initial: p6([9, 14, 12, 9, 8, 8]),
    k: p6([950, 1150, 1100, 950, 900, 950]),
    gear: [[0, "test_sword", 450]],
    innate: [],
    base: "Nova",
    job: { kind: "facility", facility: "workshop", phase: "work" },
    energy: 12,
    moving: true,
    cargo: [
      ["grain", "30"],
      ["timber", "12"],
    ],
    satisfaction: 81,
    party: "pa2",
  },
  {
    id: "p10",
    name: "Unit-12",
    type: "android",
    level: 1,
    rebirths: 0,
    initial: p6([20, 10, 8, 18, 6, 6]),
    k: null,
    gear: [],
    innate: [],
    base: "Nova",
    job: { kind: "facility", facility: "mine", phase: "work" },
    energy: 15,
    satisfaction: null,
    party: null,
  },
];

/** [임시] 배터리 최대값(D-416 배터리, 수치 없음), 피로 최대값(D-438 7: 구조 값 120) */
export const BATTERY_MAX = 100;
export const FATIGUE_MAX = 120;

function bodySpecOf(def: PreviewUnitDef): BodySpec {
  return {
    kind: def.type,
    initial: def.initial,
    kPm: def.k,
    level: def.level,
    rebirths: def.rebirths,
    equipped: new Map(def.gear.map(([slot, item, pm]) => [slot, { item, pm }])),
    innateSkills: def.innate,
    source: "computed",
  };
}

function previewUnit(catalog: RosterCatalog, def: PreviewUnitDef, now: number): RosterUnit {
  const body = bodyView(catalog, bodySpecOf(def));
  const android = def.type === "android";
  return {
    id: def.id,
    name: def.name,
    type: def.type,
    level: android ? null : def.level,
    rebirths: def.rebirths,
    place: {
      planetId: TEST_PLANET_ID,
      mapKey: String(TEST_MAP_KEY),
      domain: "land",
      base: def.base,
    },
    job: def.job,
    energy: android
      ? { kind: "battery", value: def.energy, max: BATTERY_MAX }
      : { kind: "fatigue", value: def.energy, max: FATIGUE_MAX },
    injury: def.injury ? { stage: def.injury[0], untilMs: now + def.injury[1] } : { stage: 0, untilMs: null },
    captive: def.captive ?? false,
    moving: def.moving ?? false,
    cargo: (def.cargo ?? []).map(([asset, amount]) => ({ asset, amount })),
    satisfaction: def.satisfaction,
    party: def.party,
    ...body,
    preview: true,
  };
}

export function previewUnits(catalog: RosterCatalog, now: number): RosterUnit[] {
  return UNITS.map((def) => previewUnit(catalog, def, now));
}

/** 내가 잡은 포로 2(D-244: 몸값은 원래 주인만, 처형, 회유) */
export function previewPrisoners(now: number): RosterPrisoner[] {
  return [
    {
      id: "q1",
      type: "human",
      name: "Taeo",
      owner: "Rook",
      injury: { stage: 1, untilMs: now + 50 * MINUTE },
      marketValue: "1500",
      preview: true,
    },
    {
      id: "q2",
      type: "creature",
      name: "Fang",
      owner: "Rook",
      injury: { stage: 0, untilMs: null },
      marketValue: "800",
      preview: true,
    },
  ];
}

const member = (unit: string, role: PartyRole, spot: number) => ({ unit, role, spot });

/** 파티 2(D-179: 최대 6, 진형 = 앞줄 0~2 · 뒷줄 3~5). 역할은 정해 둔 값이다(자동 판정 규칙은 규칙 줄기 몫) */
export function previewParties(): RosterParty[] {
  return [
    {
      id: "pa1",
      name: "Alpha",
      members: [
        member("p1", "tank", 1),
        member("p4", "control", 0),
        member("p2", "dealer", 4),
        member("p3", "support", 5),
      ],
      preview: true,
    },
    {
      id: "pa2",
      name: "Bravo",
      members: [member("p8", "tank", 1), member("p9", "dealer", 4)],
      preview: true,
    },
  ];
}

/** 직무 프리셋 3(D-6016) */
export function previewPresets(): RosterJobPreset[] {
  return [
    { id: "ps1", name: "Day shift", assignments: 6, preview: true },
    { id: "ps2", name: "Night shift", assignments: 4, preview: true },
    { id: "ps3", name: "Harvest", assignments: 9, preview: true },
  ];
}

/** 거점 2와 관리인(D-246) */
export function previewBases(): RosterBase[] {
  return [
    { id: "b1", name: "Nova", manager: "p2", preview: true },
    { id: "b2", name: "Vega", manager: null, preview: true },
  ];
}

/** 경매소 매물 5(D-242·D-271: 휴먼·크리쳐·안드로이드·부품·운송 수단, 즉시 구매가는 있을 수도 없을 수도) */
export function previewAuction(now: number): RosterAuctionLot[] {
  const lot = (
    id: string,
    house: RosterAuctionLot["house"],
    name: string,
    level: number | null,
    bid: string,
    buyout: string | null,
    endsIn: number,
  ): RosterAuctionLot => ({ id, house, name, level, bid, buyout, endsAtMs: now + endsIn, preview: true });
  return [
    lot("a1", "human", "Ari", 22, "1200", "2000", 5 * HOUR),
    lot("a2", "creature", "Kiba", 15, "640", null, 50 * MINUTE),
    lot("a3", "android", "MK-3", null, "2400", "3600", 26 * HOUR),
    lot("a4", "part", "Servo-7", null, "180", "260", 3 * HOUR),
    lot("a5", "vehicle", "Cart-2", null, "900", null, 9 * HOUR),
  ];
}

/** 사이보그 본체 시안(D-018·D-026·D-031·D-040·D-427). 사이보그 칸 = 공통 6 + 인공장기(팩 [임시] 3) */
export function previewCyborg(catalog: RosterCatalog): CyborgBody {
  const rebirths = 1;
  const body = bodyView(catalog, {
    kind: "cyborg",
    // 초기값 합 60(D-6039), K는 숨김 값(D-417)이라 화면에 보내지 않는다
    initial: p6([12, 9, 10, 11, 8, 10]),
    kPm: p6([1100, 950, 1000, 1050, 900, 1000]),
    level: 23,
    rebirths,
    equipped: new Map([
      [0, { item: "test_sword", pm: 800 }],
      [2, { item: "test_helmet", pm: 500 }],
      [3, { item: "test_vest", pm: 600 }],
      [4, { item: "test_ring", pm: 900 }],
      [6, { item: "test_heart", pm: 700 }],
    ]),
    // 환생하면 추가 스킬을 얻는다(D-031): 시안은 함성
    innateSkills: ["war_cry"],
    source: "computed",
  });
  return {
    level: 23,
    // 만렙(N7 팩 tuning, 출발값 50)
    maxLevel: catalog.society.cyborg.maxLevel,
    // [임시] 구간 경험치 = floor(40 × 23^1.9)(48 §2.4 출발값 후보)
    exp: { into: 6120, span: 15_460 },
    rebirths,
    // 스킬 최대 등급 = min(3 + 환생, 10)(D-031·D-5001, 규칙 sim skillGradeCap)
    skillGradeCap: skillGradeCap(rebirths, catalog.society),
    // 신앙도(D-441, 0~100 척도). 화면을 채우려는 값이다(환생 비용 N34 출발값 50보다 조금 많게)
    faith: 62,
    ...body,
    fatigue: { value: 30, max: FATIGUE_MAX },
    inventory: [
      { id: "grain", amount: "40" },
      { id: "timber", amount: "12" },
      { id: "iron_ore", amount: "25" },
      { id: "iron_ingot", amount: "6" },
      { id: "ration", amount: "8" },
      { id: "household_goods", amount: "3" },
      { id: "test_staff", amount: "1" },
      { id: "test_heart", amount: "1" },
    ],
    // [임시] 경로 이름은 경로 목록이 콘텐츠 팩에 들어오면 팩 이름을 쓴다(20 §7.2)
    rankings: [
      {
        path: "mercenary",
        name: { ko: "용병·투사", en: "Mercenary" },
        rank: 211,
        tierPercent: 5,
        score: 4820,
      },
      { path: "landlord", name: { ko: "대지주", en: "Landlord" }, rank: 1284, tierPercent: 20, score: 2310 },
      { path: "trader", name: { ko: "무역상", en: "Trader" }, rank: 3902, tierPercent: 50, score: 960 },
      { path: "explorer", name: { ko: "탐험가", en: "Explorer" }, rank: 12_880, tierPercent: 100, score: 85 },
    ],
    preview: true,
  };
}
