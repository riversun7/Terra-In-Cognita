// 시범 6 대 6(파티 하나씩, D-204) — docs/adr/2026-11-01-battle-replay.md 4절. 개발자 다시보기 주소(/dev/battle-replay)가 쓴다.
// 역할마다 1차 스탯(합 같음)·장비·스킬이 다르다. 2차 스탯은 받은 가중치 표, 장비·스킬은 받은 전투 자료(팩)다.
// 마법사·사제의 스킬은 팩 속성 지팡이가 준다(장비 스킬). 그림 모양은 스킬 자료의 shape 칸이 정한다(기록기 skillShape).
// [임시] 역할 구성·수치는 화면 확인용 기술 기본값이다(게임 규칙이 아니다).
import type { BattleMapInput } from "./battleMap.ts";
import type { BattleInit, CombatUnitSpec } from "./battleTypes.ts";
import { type CombatCatalog, UNARMED, UNARMED_ELEMENTAL, skillsOf } from "./catalog.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { type EquippedItem, itemAt, loadoutOf, skillSlotCount } from "./equipment.ts";
import type { Primaries, StatRow } from "./stats.ts";
import { specFromStats } from "./unitSpec.ts";

export type DemoRole =
  | "warrior"
  | "guardian"
  | "fire_mage"
  | "storm_mage"
  | "frost_mage"
  | "dark_mage"
  | "earth_mage"
  | "priest";

interface RoleKit {
  readonly primaries: Primaries;
  /** 사람형 칸 차례(무기·보조·머리·몸·장신구 2). 팩에 없는 아이템은 대신(fallback) 것을 쓴다 */
  readonly items: readonly (string | null)[];
  /** 무기가 팩에 없을 때 쓸 무기(옛 팩: 시험 지팡이) */
  readonly fallbackWeapon?: string | undefined;
  readonly skills: (catalog: CombatCatalog) => readonly string[];
  readonly commandCap: number;
  /** 화면 종류 코드(마법사는 하나로) */
  readonly kind: string;
}

const has = (catalog: CombatCatalog, id: string): boolean => catalog.skills.some((skill) => skill.id === id);
const known = (catalog: CombatCatalog, ids: readonly string[]): string[] =>
  ids.filter((id) => has(catalog, id));
const none = (): readonly string[] => [];

const MAGE_PRIMARIES: Primaries = { str: 20, vit: 30, int: 70, wis: 50, dex: 40, agi: 30 };
const mage = (staff: string): RoleKit => ({
  primaries: MAGE_PRIMARIES,
  items: [staff, null, null, null, null, null],
  fallbackWeapon: "test_staff",
  skills: none,
  commandCap: 0,
  kind: "mage",
});

const KITS: Readonly<Record<DemoRole, RoleKit>> = {
  warrior: {
    primaries: { str: 60, vit: 50, int: 20, wis: 30, dex: 40, agi: 40 },
    items: ["test_sword", null, "test_helmet", "test_vest", null, null],
    skills: (catalog) => known(catalog, ["power_strike", "shock_bash"]),
    commandCap: 0,
    kind: "warrior",
  },
  guardian: {
    primaries: { str: 50, vit: 70, int: 20, wis: 40, dex: 30, agi: 30 },
    items: ["test_sword", null, "test_helmet", "test_vest", "test_ring", null],
    skills: (catalog) => known(catalog, ["iron_skin", "war_cry", "first_aid"]),
    commandCap: 1,
    kind: "guardian",
  },
  // 마법사: 스킬은 지팡이 스킬(팩 속성 지팡이 — 화염 폭발 area·연쇄 번개 chain·냉기 화살 projectile·어둠 저주 debuff)
  fire_mage: mage("fire_staff"),
  storm_mage: mage("wind_staff"),
  frost_mage: mage("water_staff"),
  dark_mage: mage("dark_staff"),
  earth_mage: mage("earth_staff"),
  // 사제: 빛 지팡이(빛 치유 heal·빛 보호막 buff = 쉴드 회복) + 응급 처치
  priest: {
    primaries: { str: 20, vit: 40, int: 50, wis: 70, dex: 30, agi: 30 },
    items: ["light_staff", null, null, "test_vest", null, null],
    fallbackWeapon: "test_staff",
    skills: (catalog) => known(catalog, ["first_aid"]),
    commandCap: 0,
    kind: "priest",
  },
};

/**
 * 편마다 파티 차례(앞 줄 3: 전사·수호자·전사, 뒤 줄 3). 두 편의 뒤 줄이 달라 스킬 모양 일곱이 모두 나온다: 편 1 화염(area)·
 * 번개(chain)·사제(heal·buff), 편 2 냉기(projectile)·어둠(debuff)·땅(single). 사제를 한 편에만 둔다(두 편 모두 두면 회복·쉴드로
 * 10분 시간 초과까지 끈다). 팩에 없는 지팡이는 시험 지팡이(불꽃 화살)로 대신한다
 */
export const DEMO_ROLES: Readonly<Record<1 | 2, readonly DemoRole[]>> = {
  1: ["warrior", "guardian", "warrior", "fire_mage", "storm_mage", "priest"],
  2: ["warrior", "guardian", "warrior", "frost_mage", "dark_mage", "earth_mage"],
};

export interface DemoSkirmish {
  readonly init: BattleInit;
  /** 유닛 ID → 이름(A1~A6·B1~B6)·종류(역할 코드: warrior·guardian·mage·priest) */
  readonly labels: Readonly<Record<number, { readonly name: string; readonly kind: string }>>;
}

/** 지나갈 수 있고 비어 있는 가장 가까운 칸(정사각 고리를 넓혀 가며, 고리 안은 y·x 차례) */
function nearestOpen(
  map: BattleMapInput,
  taken: Set<number>,
  x: number,
  y: number,
): { x: number; y: number } {
  const blockedByBuilding = new Set(map.buildings.flatMap((building) => [...building.cells]));
  for (let r = 0; r < map.size; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = x + dx;
        const cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= map.size || cy >= map.size) continue;
        const cell = cy * map.size + cx;
        if (map.passable[cell] !== 1 || taken.has(cell) || blockedByBuilding.has(cell)) continue;
        taken.add(cell);
        return { x: cx, y: cy };
      }
    }
  }
  throw new RangeError("no open cell for a demo unit");
}

/**
 * 시범 6 대 6: 편 1(공격, 서쪽)·편 2(수비, 동쪽)가 경기장 가운데에서 12칸 떨어져 두 줄로 선다(앞 줄 ±6, 뒤 줄 ±8).
 * 같은 입력이면 같은 시작 자료(시드는 전투 시드로만 쓴다)
 */
export function demoSkirmish(options: {
  readonly catalog: CombatCatalog;
  readonly map: BattleMapInput;
  readonly seed: number;
  readonly table?: readonly StatRow[] | undefined;
  readonly coefficients?: CombatCoefficients | undefined;
}): DemoSkirmish {
  const { catalog, map } = options;
  const table = options.table ?? catalog.statTable;
  const c = options.coefficients ?? TEST_COMBAT_COEFFICIENTS;
  const human = catalog.unitKinds.find((kind) => kind.id === "human");
  const slots = human?.slots ?? [];
  const skillSlots = human ? skillSlotCount(human.skillSlots.base, 0, human.skillSlots.max) : 3;
  const unarmed = human?.naturalWeapon ?? UNARMED;
  const unarmedElemental = human?.naturalElementalWeapon ?? UNARMED_ELEMENTAL;
  const center = Math.floor(map.size / 2);
  const taken = new Set<number>();
  const units: CombatUnitSpec[] = [];
  const labels: Record<number, { name: string; kind: string }> = {};
  for (const side of [1, 2] as const) {
    DEMO_ROLES[side].forEach((role, index) => {
      const kit = KITS[role];
      const equipped: (EquippedItem | null)[] = slots.map((slot, slotIndex) => {
        const id = kit.items[slotIndex] ?? null;
        const find = (want: string | null | undefined) =>
          want ? catalog.equipment.find((item) => item.id === want) : undefined;
        const def = find(id) ?? (slotIndex === 0 ? find(kit.fallbackWeapon) : undefined);
        return def && def.slot === slot ? itemAt(def, 500) : null;
      });
      const out = loadoutOf({
        base: kit.primaries,
        slots,
        equipped,
        table,
        unarmed,
        innateSkills: kit.skills(catalog),
        skillSlots,
      });
      const back = index >= 3;
      const row = (index % 3) - 1;
      const offset = back ? 8 : 6;
      const spot = nearestOpen(
        map,
        taken,
        side === 1 ? center - offset : center + offset - 1,
        center + row * 2,
      );
      const id = side * 100 + index + 1;
      units.push(
        specFromStats(
          {
            id,
            side,
            party: side,
            x: spot.x,
            y: spot.y,
            stats: out.stats,
            weapon: out.weapon,
            naturalWeapon: unarmed,
            naturalElementalWeapon: unarmedElemental,
            primaries: out.primaries,
            skills: skillsOf(catalog, out.skills),
            moveIntervalMs: 1000,
            commandCap: kit.commandCap,
          },
          c,
        ),
      );
      labels[id] = { name: `${side === 1 ? "A" : "B"}${index + 1}`, kind: kit.kind };
    });
  }
  return {
    init: {
      id: options.seed,
      kind: "normal",
      seed: options.seed,
      map,
      sides: [
        { id: 1, faction: 1, defender: false, edge: 3 },
        { id: 2, faction: 2, defender: true, edge: 1 },
      ],
      parties: [
        { id: 1, side: 1, retreatHpPct: 0 },
        { id: 2, side: 2, retreatHpPct: 0 },
      ],
      units,
    },
    labels,
  };
}
