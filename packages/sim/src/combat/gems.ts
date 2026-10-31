// 보석·유전자 추출 — docs/adr/2026-10-31-combat-core.md 7절, 기획 48 §6.1, D-426·D-435(스킬석 = 스킬 보석)·D-437·D-5008·D-5009
// - 유전자 추출(D-437): 원본 유닛의 고유 스킬이 사라지고, 같은 등급 스킬 보석이 원장에 하나 생긴다(issue:gem).
// - 인챈트(D-5009·D-435): 소켓 차례(1·2·3번째)의 성공률로 시드 굴림. 성공 = 소켓에 끼움(보석은 원장에서 빠짐),
//   실패 = 최대 내구도가 준다(구간 굴림)·소켓은 빈 채 남음, 보석은 깨진다. 보석 등급별 수량의 파괴 방지 아이템을 쓰면
//   보석은 남고 방지 아이템이 사라진다(실패 불이익은 그대로).
// 서버·시뮬이 아직 부르지 않는다(장비 제작·인챈트 화면은 뒤 단계). [임시] 자산 코드 모양, 방지 수량.
import type { LedgerBook } from "../ledger/ledgerBook.ts";

/** 보석 한 종류: 스킬 보석(스킬·등급) 또는 스탯 보석(1차 스탯·값, D-423) */
export type GemRef =
  | { readonly kind: "skill"; readonly skill: string; readonly grade: number }
  | { readonly kind: "stat"; readonly stat: string; readonly value: number; readonly grade: number };

export interface GemRules {
  /** 소켓 차례별 성공률(‰, D-5009 60·30·15%, N20) */
  readonly successPm: readonly number[];
  /** 실패 때 최대 내구도 감소 구간(소켓 차례별 [최소, 최대], D-5009) */
  readonly durabilityLoss: readonly (readonly [number, number])[];
  /** [임시] 보석 등급(1~10)별 파괴 방지 아이템 수량(N20 출발값 없음) */
  readonly protectorsByGrade: readonly number[];
}

export const TEST_GEM_RULES: GemRules = {
  successPm: [600, 300, 150],
  durabilityLoss: [
    [5, 10],
    [10, 20],
    [15, 30],
  ],
  protectorsByGrade: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4],
};

/** [임시] 원장 자산 코드(시뮬 형식) */
export function gemAsset(gem: GemRef): string {
  return gem.kind === "skill"
    ? `gem:skill:${gem.skill}:${gem.grade}`
    : `gem:stat:${gem.stat}:${gem.value}:${gem.grade}`;
}
export const PROTECTOR_ASSET = "item:gem_protector";
/** 시스템 계정 코드는 자산마다 하나다(issue:<자산>·sink:<자산>, 감사 규칙의 앞머리) */
const issueCode = (asset: string) => `issue:${asset}`;
const sinkCode = (asset: string) => `sink:${asset}`;

export interface InnateSkill {
  readonly skill: string;
  readonly grade: number;
}

/** 유전자 추출(D-437): 스킬을 원본에서 빼고 같은 등급 스킬 보석 하나를 주인에게. 없는 스킬이면 undefined */
export function extractGene(
  book: LedgerBook,
  owner: number,
  skills: readonly InnateSkill[],
  skillId: string,
  atMs: number,
): { skills: InnateSkill[]; gem: GemRef } | undefined {
  const index = skills.findIndex((entry) => entry.skill === skillId);
  const found = skills[index];
  if (!found) return undefined;
  const gem: GemRef = { kind: "skill", skill: found.skill, grade: found.grade };
  const asset = gemAsset(gem);
  book.post({
    kind: "issue",
    atMs,
    entries: [
      { account: book.systemAccount(issueCode(asset), asset), amount: -1n },
      { account: book.ownerAccount(owner, asset), amount: 1n },
    ],
  });
  return { skills: skills.filter((_, i) => i !== index), gem };
}

export interface SocketedItem {
  readonly socketCount: number;
  readonly gems: readonly GemRef[];
  readonly maxDurability: number;
}

export type EnchantOutcome =
  | { readonly result: "success"; readonly item: SocketedItem }
  | { readonly result: "failed"; readonly item: SocketedItem; readonly gemKept: boolean };

/**
 * 인챈트 한 번. rolls = {chance: 0~9999, loss: 0~9999}(시드 굴림). 빈 소켓이 없거나 보석이 없으면 RangeError.
 * protect = 파괴 방지 아이템을 쓰는가(가진 수가 모자라면 쓰지 않은 것과 같다)
 */
export function enchant(
  book: LedgerBook,
  owner: number,
  item: SocketedItem,
  gem: GemRef,
  rolls: { readonly chance: number; readonly loss: number },
  protect: boolean,
  atMs: number,
  rules: GemRules = TEST_GEM_RULES,
): EnchantOutcome {
  const slot = item.gems.length;
  if (slot >= item.socketCount) throw new RangeError("no empty socket");
  const asset = gemAsset(gem);
  if (book.balanceOf(owner, asset) < 1n) throw new RangeError(`no gem ${asset}`);
  const burn = (what: string, amount: bigint) =>
    book.post({
      kind: "burn",
      atMs,
      entries: [
        { account: book.ownerAccount(owner, what), amount: -amount },
        { account: book.systemAccount(sinkCode(what), what), amount },
      ],
    });
  if (rolls.chance < (rules.successPm[slot] ?? 0) * 10) {
    burn(asset, 1n);
    return { result: "success", item: { ...item, gems: [...item.gems, gem] } };
  }
  const [lo = 0, hi = 0] = rules.durabilityLoss[slot] ?? [];
  const loss = lo + Math.floor(((hi - lo + 1) * rolls.loss) / 10_000);
  const failed = { ...item, maxDurability: Math.max(0, item.maxDurability - loss) };
  const need = BigInt(
    rules.protectorsByGrade[Math.max(0, gem.grade - 1)] ?? rules.protectorsByGrade.at(-1) ?? 1,
  );
  if (protect && book.balanceOf(owner, PROTECTOR_ASSET) >= need) {
    burn(PROTECTOR_ASSET, need);
    return { result: "failed", item: failed, gemKept: true };
  }
  burn(asset, 1n);
  return { result: "failed", item: failed, gemKept: false };
}
