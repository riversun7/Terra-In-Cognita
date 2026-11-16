// 시설에서 일하는 유닛 한 줄(노동 계약 서비스 workersAt — labor/service.ts가 다시 내보낸다). service.ts(1,000줄 상한)에서 옮겼다.
// 거래 직무(질문 2083, 줄기 exchange-3): 거래소 자리는 주인의 직무 배치·남의 임대형 계약·고용이 함께 쓰고, 주문 한도·운반은 그 일의 몫을 받는 주체
// (forOwnerId)로 센다.

/** 시설에서 일하는 유닛 하나 */
export interface LaborWorkerEntry {
  readonly unitId: number;
  /** assign = 직무 배치, wage·lease = 노동 계약 */
  readonly via: "assign" | "wage" | "lease";
  /** 유닛 소유 주체 */
  readonly workerOwnerId: number;
  /** 노동 계약 ID(직무 배치는 없다) */
  readonly contractId?: number | undefined;
  /** 그 일의 몫을 받는 주체(직무 배치·임대형 = 유닛 소유 주체, 임금형 = 고용주). 없으면 유닛 소유 주체 */
  readonly forOwnerId?: number | undefined;
}

/** 그 일의 몫을 받는 주체(직무 배치·임대형 = 유닛 소유 주체, 임금형 = 고용주) */
export const workerFor = (entry: LaborWorkerEntry): number => entry.forOwnerId ?? entry.workerOwnerId;

/** 열린 노동 계약 한 줄 → 일꾼 줄(임금형은 고용주 몫, 임대형은 임차인 = 유닛 소유 주체 몫) */
export function contractEntry(c: {
  readonly id: number;
  readonly kind: "wage" | "lease";
  readonly unitId: number;
  readonly ownerId: number;
  readonly workerOwnerId: number;
}): LaborWorkerEntry {
  return {
    unitId: c.unitId,
    via: c.kind,
    workerOwnerId: c.workerOwnerId,
    contractId: c.id,
    forOwnerId: c.kind === "wage" ? c.ownerId : c.workerOwnerId,
  };
}
