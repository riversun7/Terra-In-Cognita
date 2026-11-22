// NPC 집주인 — 기획 검토 2735(fixes-1117j, D-555 1509 "똑같이 한다니까 … NPC만으로도 그대로 똑같이 시스템이 돌아간다"). npc-rent의 [임시] "집세는 플레이어 주인만
// 정한다"(질문 2735 가)를 바꾼다. docs/adr/2026-11-15-business-ledger.md "바뀜 (fixes-1117j)".
// - 같은 길: NPC 나라가 가진 주거 건물(팩 생활 단계 — 지금 숙소 lodging)에 플레이어 주인과 같은 집세 표(residence_rents, rent.ts — 정할 때의 주인 = 지금 주인일 때만
//   쓴다)를 적는다. 그러면 세 들기·미리 내기·다음 기간 걷기·정원(층 × 설정 칸)·못 내면 쉼·주민세 집 몫이 플레이어 집과 똑같이 돈다 — 세입자는 플레이어 유닛(residence_set)
//   또는 다른 나라의 NPC 휴먼(npcRent.ts — 제 세력 집은 고르지 않는다). 집세는 그 건물 사업장 금고로(BusinessCore.receive, 없으면 건물 주인 = NPC 나라 지갑).
// - 집세 규칙식(D-323 성향 규칙식 — [임시] 기술 기본값, 설정 칸 npc_landlord_*): 집세 = 한 기간 숙박비(그 숙소 레벨에서 기간에 드는 밤 수 × 하룻밤 요금 —
//   플레이어 일꾼 미리 내는 숙박비와 같은 셈, 집세 화폐 = 서버 시험 화폐) × (npc_landlord_factor_pm + (상업 성향 − 500) × npc_landlord_temper_pm ÷ 500) ÷ 1000, 올림.
//   상업 성향이 높은 나라일수록 비싸게 놓는다. 바뀔 때만 표를 고친다(1분 훑기 — attach.ts가 NPC 세 들기 바로 앞에 부른다).
// - 끄면(npc_landlord_mode 0) NPC가 정한 집세(줄 주인 = 지금 NPC 주인)를 거둬들인다 — 이미 세 든 것은 낸 기간까지 산다(다음 기간을 걷지 못해 쉰다 — 플레이어 집과 같다).
// - 층 올리기: NPC는 아직 층을 올리지 않는다 [임시 — 질문 2762]. 정원은 지금 층 그대로다.
// 정수·BigInt만 쓴다.
import type { QueryPool } from "../world/persist/load.ts";
import type { ResidenceWorld } from "./book.ts";
import { type RentTable, deleteResidenceRent, saveResidenceRent } from "./rent.ts";

/** NPC 집주인 규칙(설정 칸 — @terra/sim BusinessCoefficients의 같은 이름 칸) */
export interface NpcLandlordRules {
  readonly npcLandlordMode?: number | undefined;
  readonly npcLandlordFactorPm?: number | undefined;
  readonly npcLandlordTemperPm?: number | undefined;
}

/** 설정 칸이 없을 때(옛 팩) 값 — [임시] 기술 기본값 */
export const NPC_LANDLORD_DEFAULTS = { mode: 1, factorPm: 1000, temperPm: 500 } as const;

const int = (value: number | undefined, fallback: number): number =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.trunc(value));

/** 집세 몫(‰) = 몫 + (상업 성향 − 500) × 무게 ÷ 500(0 아래로 내리지 않는다) */
export function npcLandlordSharePm(commerce: number, rules: NpcLandlordRules): number {
  const c = Math.min(1000, Math.max(0, Math.trunc(commerce)));
  const factor = int(rules.npcLandlordFactorPm, NPC_LANDLORD_DEFAULTS.factorPm);
  const temper = int(rules.npcLandlordTemperPm, NPC_LANDLORD_DEFAULTS.temperPm);
  return Math.max(0, factor + Math.trunc(((c - 500) * temper) / 500));
}

/** 집세 = 한 기간 숙박비 × 몫 ÷ 1000(올림) */
export function npcLandlordRent(periodFee: bigint, commerce: number, rules: NpcLandlordRules): bigint {
  if (periodFee <= 0n) return 0n;
  const share = BigInt(npcLandlordSharePm(commerce, rules));
  return (periodFee * share + 999n) / 1000n;
}

/** NPC 세계 몫(npcRentWorld.ts가 NPC 런타임으로 만든다) */
export interface NpcLandlordWorld {
  /** NPC 세력인가(플레이어 가문 세력이면 false — 가문 건물 집세는 가문장이 정한다) */
  isNpcOwner(owner: number): boolean;
  /** 그 세력의 상업 성향(‰ — 없으면 중립 500) */
  commerceOf(owner: number): number | undefined;
  /** 그 레벨 숙소의 한 기간 숙박비(집세 화폐 — 서버 시험 화폐). 셀 수 없으면 undefined */
  lodgingPeriodFee(level: number, periodMs: number): bigint | undefined;
}

/** 훑기 한 번 결과 */
export interface NpcLandlordSweep {
  /** 새로 정하거나 바꾼 집세 수 */
  readonly set: number;
  /** 거둬들인 집세 수(끔) */
  readonly cleared: number;
}

export function createNpcLandlord(o: {
  /** 건물 ID 목록(세계 시설 — 생활 단계인지는 world.building이 본다) */
  buildingIds(): Iterable<number>;
  readonly world: Pick<ResidenceWorld, "building">;
  readonly rents: Pick<RentTable, "rowOf" | "put" | "remove">;
  npc(): NpcLandlordWorld | undefined;
  readonly pool?: QueryPool | undefined;
  rules(): NpcLandlordRules;
  periodMs(): number;
}): { sweep(nowMs: number): Promise<NpcLandlordSweep> } {
  return {
    async sweep(nowMs) {
      const npc = o.npc();
      if (!npc) return { set: 0, cleared: 0 };
      const rules = o.rules();
      const on = int(rules.npcLandlordMode, NPC_LANDLORD_DEFAULTS.mode) === 1;
      let set = 0;
      let cleared = 0;
      for (const buildingId of [...o.buildingIds()].toSorted((a, b) => a - b)) {
        const facts = o.world.building(buildingId);
        if (!facts?.living || facts.ownerId === null || !npc.isNpcOwner(facts.ownerId)) continue;
        const row = o.rents.rowOf(buildingId);
        if (!on) {
          // 끔: NPC가 정한 줄(줄 주인 = 지금 NPC 주인)만 거둬들인다
          if (row && row.ownerId === facts.ownerId) {
            o.rents.remove(buildingId);
            if (o.pool) await deleteResidenceRent(o.pool, buildingId);
            cleared += 1;
          }
          continue;
        }
        if (facts.level < 1) continue;
        const fee = npc.lodgingPeriodFee(facts.level, o.periodMs());
        if (fee === undefined) continue;
        const rent = npcLandlordRent(fee, npc.commerceOf(facts.ownerId) ?? 500, rules);
        if (row && row.ownerId === facts.ownerId && row.rent === rent) continue;
        const next = { buildingId, ownerId: facts.ownerId, rent, setAtMs: nowMs };
        // 표를 먼저 쓰고 메모리에(쓰기가 실패하면 다음 훑기가 다시 본다)
        if (o.pool) await saveResidenceRent(o.pool, next);
        o.rents.put(next);
        set += 1;
      }
      return { set, cleared };
    },
  };
}
