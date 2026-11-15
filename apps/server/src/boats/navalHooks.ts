// 해상 전투 고리(순수 함수) — 기획 D-559 1531·1532("같은 전투 코어에 배 몸")·1533·1536·1537·1534·1617, docs/adr/2026-11-15-sea-combat-routes.md "바뀜 (2026-11-15) D-559".
// 전투 판정 코어(`packages/sim/src/combat`, 줄기 work/combat-moves가 다시 짜는 중)에 배를 넣을 때 쓰는 값만 여기서 만든다. 전투 코어가 이 모듈을 부르고, 이 모듈은
// 전투 코어를 부르지 않는다(전투 코어가 바뀌어도 이 값 모양만 맞추면 된다).
// - 배 몸(boatBody): 크기 2 물 유닛, HP = 함선 칸 hullPoints × 지금 내구도 몫(내구도 0이면 HP 0 = 표류), 장갑, 함포(규격·포탄), 보직 수, 빠르기 배율(연료·오버히트 포함).
// - 포탄 피해(shellHit): 함포 규격 기본 피해 × 포탄 ‰ — AP는 선체만, HE는 선체 + 갑판 승객(1536 "포탄 종류마다 다름"). 쏘려면 함포마다 화포수 한 명(1537 — 화포수보다 많은 함포는 쉰다).
// - 전투 뒤(afterBattle): 남은 HP 몫을 내구도로 돌려 적는다(0이면 표류 — 가라앉지 않는다, 1534 "표류").
import type { BoatCoefficients } from "@terra/sim";
import { HULL_FULL } from "@terra/shared/harbor";
import type { CrewPost, GunCaliber, NavalSpec, ShellKind } from "@terra/shared/naval";
import type { BoatTypeDef } from "../facilities/catalog.ts";
import { boatSpeedPm } from "./rules.ts";

/** 함선 칸이 없는 배 종류의 처음 값(작은 배와 같은 몸 — [임시]) */
export const DEFAULT_NAVAL: NavalSpec = {
  shipClass: "skiff",
  hullPoints: 300,
  armor: 0,
  modulePoints: 0,
  guns: [],
  crew: { captain: 1, deck: 1 },
  hangar: 0,
};

/** 전투 코어에 넣는 배 몸 */
export interface BoatBody {
  readonly size: 2;
  readonly domain: "sea";
  readonly hp: number;
  readonly maxHp: number;
  readonly armor: number;
  /** 쏠 수 있는 함포(화포수가 붙은 것만, 자리 차례) */
  readonly guns: readonly { readonly caliber: GunCaliber; readonly shells: readonly ShellKind[] }[];
  /** 보직마다 탄 사람 수 */
  readonly crew: Readonly<Record<CrewPost, number>>;
  /** 빠르기 배율(‰, 연료·오버히트·내구도 반영) */
  readonly speedPm: number;
  /** 표류(HP 0이거나 연료 0) — 움직이지 못하고 빼앗길 수 있다 */
  readonly drifting: boolean;
}

/** 배 상태 → 전투 몸 */
export function boatBody(
  type: Pick<BoatTypeDef, "speedPm" | "naval"> | undefined,
  state: { readonly hullPpm: number; readonly fuelEmpty: boolean; readonly overheat: boolean },
  crew: Readonly<Partial<Record<CrewPost, number>>>,
  rules: Pick<BoatCoefficients, "brokenSpeedPm" | "noFuelSpeedPm" | "overheatSpeedPm">,
): BoatBody {
  const naval = type?.naval ?? DEFAULT_NAVAL;
  const share = Math.max(0, Math.min(HULL_FULL, state.hullPpm));
  const hp = Math.floor((naval.hullPoints * share) / HULL_FULL);
  const counts: Record<CrewPost, number> = {
    captain: crew.captain ?? 0,
    gunner: crew.gunner ?? 0,
    engine: crew.engine ?? 0,
    deck: crew.deck ?? 0,
    pilot: crew.pilot ?? 0,
  };
  return {
    size: 2,
    domain: "sea",
    hp,
    maxHp: naval.hullPoints,
    armor: naval.armor,
    guns: naval.guns.slice(0, counts.gunner),
    crew: counts,
    speedPm: boatSpeedPm(type, share, rules, { empty: state.fuelEmpty, overheat: state.overheat }),
    drifting: hp <= 0 || state.fuelEmpty,
  };
}

/** 함포 한 발의 피해(선체·갑판 승객). 장갑은 선체 피해에서 뺀다(0 아래로 가지 않는다) */
export function shellHit(
  caliber: GunCaliber,
  shell: ShellKind,
  armor: number,
  rules: Pick<
    BoatCoefficients,
    | "gunLightDamage"
    | "gunMediumDamage"
    | "gunHeavyDamage"
    | "shellApHullPm"
    | "shellHeHullPm"
    | "shellHeDeckPm"
  >,
): { readonly hull: number; readonly deck: number } {
  const base =
    caliber === "light"
      ? rules.gunLightDamage
      : caliber === "medium"
        ? rules.gunMediumDamage
        : rules.gunHeavyDamage;
  const hullPm = shell === "ap" ? rules.shellApHullPm : rules.shellHeHullPm;
  const deckPm = shell === "ap" ? 0 : rules.shellHeDeckPm;
  const hull = Math.max(0, Math.floor((Math.max(0, base) * Math.max(0, hullPm)) / 1000) - Math.max(0, armor));
  const deck = Math.floor((Math.max(0, base) * Math.max(0, deckPm)) / 1000);
  return { hull, deck };
}

/** 전투 뒤 남은 HP → 내구도(ppm). HP 0이면 0(표류 — 가라앉지 않는다) */
export function hullAfterBattle(hpLeft: number, maxHp: number): number {
  if (maxHp <= 0 || hpLeft <= 0) return 0;
  return Math.min(HULL_FULL, Math.floor((Math.min(hpLeft, maxHp) * HULL_FULL) / maxHp));
}
