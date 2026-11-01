// 사이보그 환생 — docs/adr/2026-10-31-faction-society-core.md "바뀜 (2026-11-01)"·"바뀜 (2026-11-01, D-444)"·
// "바뀜 (2026-11-01, D-450~D-453)", 기획 20 §2.4·48 §2, D-026·D-031·D-417·D-427·D-440·D-441·D-444·D-450·D-451·D-452·D-5001
// - 조건(D-441·D-451): 만렙(N7) + 신앙도 문턱 + 화폐(양은 N34 설정값, 출발값 D-5032). 신앙도는 쓰지 않고 문턱만 본다(D-451).
//   신앙 포인트는 조건이 아니다(따로 쓰는 재화, faith.ts). 유전자 조각은 비용이 아니다(생명공학용).
// - 결과(D-440·D-451): 레벨 1·경험치 0(이전 최고 레벨까지 가속 없음), 환생 횟수 +1, 신앙도 0(남는 몫 없이), 화폐를 쓴다.
//   신앙 포인트·종교는 그대로. 스탯 분포 변경 = 생성 때처럼 성향을 골라 다시 굴린 값(cyborgStats.ts, 다시 굴리기 횟수는 생성과 같은 N9
//   설정값, D-444 164. 직접 나누기는 없다. 안 굴리면 그대로 — 기술 해석), K 리롤(N6 범위 균등, 시드 굴림 여섯)은 D-026 그대로이고,
//   분포를 그대로 둬도 늘 다시 굴린다(사용자 결정 2026-11-01, D-446). 인공장기·장비 등 다른 칸은 손대지 않는다(D-026: 인공장기 유지).
//   스킬 최대 등급(D-031·D-5001)과 스킬 칸(D-427, combat/equipment.ts skillSlotCount)은 환생 횟수에서 계산하므로 +1씩 따라 오른다.
// - 속성값(D-450): 4원소 10점(N36)은 그대로 두거나 다시 나눈다(생성과 같은 검사, @terra/shared cyborgElements). 앞선 환생에서 얻은
//   빛·어둠은 남는다(D-455 184). 강화형은 장비·인공장기·신앙에서만 온다(여기서 바꾸지 않는다).
// - 진로별 종교 아이템(D-452, D-441 해석 대체): 고르면 하나를 쓰고 ① 빛·어둠 갈래를 연다(그 칸 + N37, 칸마다 10에서 자름. 갈래는
//   하나라 다른 갈래로 바꾸면 앞 갈래 값은 0 — D-455 184 나) 또는 ② 그 종교의 특수 스킬을 환생 뒤에 받는다(스킬석처럼, 스킬 DB "종교"
//   태그 — 고유 스킬로 스킬 칸 하나를 쓰고 다음 환생에도 남으며 개종하면 사라진다, D-455 187. 같은 스킬은 다시 받지 않는다). 아이템은
//   사이보그의 종교 것이어야 한다(D-455 185 가). 아이템 목록·효과는 신앙 콘텐츠 데이터이고 부르는 쪽이 넘긴다.
// - 화폐는 그 신전 도시의 화폐다(D-441 해석). 내는 곳(NPC 신전 = 소멸, 유저 신전 = 주인 수입, 46 §7.4)은 부르는 쪽이 원장에 쓴다.
// 장소(환생 시설·신전)와 연출(모항 몸 교체, D-058)은 부르는 쪽 몫이다.
import {
  type ElementValues,
  type LightDarkElement,
  checkElementAllocation,
  sumElementSources,
} from "@terra/shared/cyborg";
import type { Primaries } from "../combat/stats.ts";
import type { SocietyCoefficients } from "./coefficients.ts";
import { PRIMARY_STATS, type StatRolls, kFromRolls, temperamentOf } from "./cyborgStats.ts";
import { type UnitFaith, resetFaithForRebirth } from "./faith.ts";

/** 규칙이 보는 사이보그 성장 상태(서버·화면이 이 모양을 넓혀 쓴다). 신앙 칸은 휴먼과 같다(D-451) */
export interface CyborgProgress extends UnitFaith {
  readonly level: number;
  /** 지금 레벨 안 경험치 */
  readonly exp: number;
  readonly rebirths: number;
  /** 초기 스탯 분포(N9 합) */
  readonly initial: Primaries;
  /** 숨은 성장 K(‰, N6) */
  readonly kPm: Primaries;
  /** 생성·환생에서 온 속성값 12칸(4원소 분배 + 종교 환생 빛·어둠, D-450). 장비·인공장기·신앙 몫은 따로 더한다 */
  readonly elements: ElementValues;
}

export interface ItemNeed {
  readonly asset: string;
  readonly amount: bigint;
}

export interface RebirthWallet {
  /** 신전 도시 화폐 잔고(최소 단위) */
  readonly currency: bigint;
  /** 가진 아이템 수(진로별 종교 아이템). 없으면 0으로 본다 */
  readonly item?: ((asset: string) => bigint) | undefined;
}

/** 진로별 종교 아이템 한 종(신앙 콘텐츠 데이터, D-452): 어느 종교 것인지, 열 수 있는 갈래, 줄 수 있는 특수 스킬 */
export interface ReligionItem {
  readonly asset: string;
  readonly religion: string;
  readonly branches: readonly LightDarkElement[];
  /** 스킬 DB의 "종교" 태그 스킬 ID(48 §6, D-452 해석) */
  readonly skills: readonly string[];
}

/** 환생 화면 종교 아이템 칸(선택, D-452): 갈래 열기 또는 특수 스킬 받기 */
export type ReligionItemUse =
  | { readonly item: ReligionItem; readonly use: "branch"; readonly branch: LightDarkElement }
  | { readonly item: ReligionItem; readonly use: "skill"; readonly skill: string };

export type RebirthBlocker = "level" | "faith" | "currency" | "religion_item" | "distribution" | "elements";

export interface RebirthChoice {
  /** 성향을 골라 다시 굴린 분포(cyborgStats.ts firstStatRoll·rerollStats의 마지막 값, D-444 164). 없으면 그대로 */
  readonly spread?: StatRolls | undefined;
  /** K 리롤 굴림 여섯(0~9999, STR·DEX·AGI·VIT·INT·WIS 차례) */
  readonly kRolls: readonly number[];
  /** 4원소 다시 나누기(N36, 생성과 같은 검사, D-450). 없으면 그대로 */
  readonly elements?: unknown;
  /** 진로별 종교 아이템 쓰기(D-452). 없으면 기본 환생 */
  readonly religionItem?: ReligionItemUse | undefined;
}

export type RebirthResult<T extends CyborgProgress> =
  | {
      readonly ok: true;
      readonly state: T;
      /** 쓴 것: 화폐, 종교 아이템(신앙도는 쓰지 않고 0이 된다, D-451) */
      readonly spent: { readonly currency: bigint; readonly items: readonly ItemNeed[] };
      /** 환생 뒤 받는 것: 종교 특수 스킬(state.religionSkills에도 더했다. 부르는 쪽이 스킬 칸·스킬 DB에 넣는다, D-452·D-455 187) */
      readonly grants: { readonly skill: string | null };
    }
  | { readonly ok: false; readonly blockers: RebirthBlocker[] };

/** 스킬 최대 등급 = min(기본 3 + 환생 횟수, 상한 10)(D-031·D-5001) */
export function skillGradeCap(rebirths: number, c: SocietyCoefficients): number {
  return Math.min(c.cyborg.skillGradeMax, c.cyborg.skillGradeBase + Math.max(0, rebirths));
}

/** 종교 아이템 칸이 쓸 수 있는가: 가졌고, 사이보그 종교 것이고, 그 갈래·스킬을 연다 */
function religionItemUsable(state: CyborgProgress, wallet: RebirthWallet, use: ReligionItemUse): boolean {
  if (state.religion === null || use.item.religion !== state.religion) return false;
  if ((wallet.item?.(use.item.asset) ?? 0n) < 1n) return false;
  if (use.use === "branch") return use.item.branches.includes(use.branch);
  return use.item.skills.includes(use.skill) && !state.religionSkills.includes(use.skill);
}

/** 환생을 막는 것(비어 있으면 할 수 있다): 만렙, 신앙도 문턱, 화폐, 종교 아이템 차례 */
export function rebirthBlockers(
  state: CyborgProgress,
  wallet: RebirthWallet,
  c: SocietyCoefficients,
  religionItem?: ReligionItemUse,
): RebirthBlocker[] {
  const out: RebirthBlocker[] = [];
  if (state.level < c.cyborg.maxLevel) out.push("level");
  if (state.faith < c.cyborg.rebirthFaith) out.push("faith");
  if (wallet.currency < BigInt(c.cyborg.rebirthCurrency)) out.push("currency");
  if (religionItem && !religionItemUsable(state, wallet, religionItem)) out.push("religion_item");
  return out;
}

/** 굴린 분포가 N9 안(합·칸 범위), 아는 성향, 다시 굴리기 횟수 안인지(굴림 상태는 서버가 들고 있다. 넘겨받은 값을 다시 본다) */
function validRolls(rolls: StatRolls, c: SocietyCoefficients): boolean {
  if (temperamentOf(rolls.temperament, c) === undefined) return false;
  if (
    !Number.isInteger(rolls.rerollsLeft) ||
    rolls.rerollsLeft < 0 ||
    rolls.rerollsLeft > c.cyborg.initialRerolls
  )
    return false;
  let sum = 0;
  for (const stat of PRIMARY_STATS) {
    const value = rolls.spread[stat];
    if (!Number.isInteger(value) || value < c.cyborg.initialMin || value > c.cyborg.initialMax) return false;
    sum += value;
  }
  return sum === c.cyborg.initialSum;
}

/**
 * 새 속성값: 4원소는 다시 나눈 값(없으면 그대로), 빛·어둠은 남기고, 갈래를 열면 그 칸 + N37(칸마다 10에서 자름)·다른 갈래는 0
 * (D-455 184 나: 갈래는 하나)
 */
function nextElements(
  own: ElementValues,
  basic: ElementValues | null,
  branch: LightDarkElement | null,
  c: SocietyCoefficients,
): ElementValues {
  const base: ElementValues = basic
    ? { ...own, water: basic.water, fire: basic.fire, wind: basic.wind, earth: basic.earth }
    : own;
  if (!branch) return base;
  const other: LightDarkElement = branch === "light" ? "dark" : "light";
  return sumElementSources({ ...base, [other]: 0 }, [{ [branch]: c.cyborg.lightDarkPoints }]);
}

/** 환생 한 번. 막히면 까닭 목록, 되면 새 상태(다른 칸은 그대로)·쓴 것·받는 것 */
export function rebirthCyborg<T extends CyborgProgress>(
  state: T,
  wallet: RebirthWallet,
  choice: RebirthChoice,
  c: SocietyCoefficients,
): RebirthResult<T> {
  const kPm = kFromRolls(choice.kRolls, c);
  const use = choice.religionItem;
  const blockers = rebirthBlockers(state, wallet, c, use);
  if (choice.spread && !validRolls(choice.spread, c)) blockers.push("distribution");
  let basic: ElementValues | null = null;
  if (choice.elements !== undefined) {
    const checked = checkElementAllocation(choice.elements, {
      cells: c.cyborg.elementCells,
      points: c.cyborg.elementPoints,
    });
    if (checked.ok) basic = checked.values;
    else blockers.push("elements");
  }
  if (blockers.length > 0) return { ok: false, blockers };
  return {
    ok: true,
    state: {
      ...resetFaithForRebirth(state),
      level: 1,
      exp: 0,
      rebirths: state.rebirths + 1,
      initial: choice.spread?.spread ?? state.initial,
      kPm,
      elements: nextElements(state.elements, basic, use?.use === "branch" ? use.branch : null, c),
      religionSkills: use?.use === "skill" ? [...state.religionSkills, use.skill] : state.religionSkills,
    },
    spent: {
      currency: BigInt(c.cyborg.rebirthCurrency),
      items: use ? [{ asset: use.item.asset, amount: 1n }] : [],
    },
    grants: { skill: use?.use === "skill" ? use.skill : null },
  };
}
