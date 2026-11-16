// 채집 줄 한 개(서비스 안 상태) — service.ts에서 나눔(그 파일 1,000줄 상한). docs/adr/2026-11-07-gather-objects.md 3·5절.
import type { GatherEnterResult, GatherLoopView, GatherPhase, GatherStop } from "@terra/shared/gather";
import type { Motion } from "@terra/sim";
import type { Deposit } from "./deposit.ts";

export interface Action {
  readonly unitId: number;
  readonly ownerId: number;
  /** 배에서 캐는 줄이면 그 배(시작할 때 탄 배), 아니면 null */
  readonly boatId: number | null;
  readonly userId: string;
  readonly mapKey: number;
  readonly kind: "gather" | "enter";
  objectId: number | null;
  kindIndex: number;
  buildingId: number | null;
  phase: GatherPhase;
  motion: Motion | null;
  checkAtMs: number | null;
  /** 지금 단계를 시작한 시각(캐는 중 진행바 — 보기 값) */
  phaseAtMs: number | null;
  seq: number;
  deposit: Deposit | null;
  /** 넣을 때 건너뛸 넣는 곳(가득 찬 창고) */
  readonly skip: Set<string>;
  /** 이 오브젝트를 맡는 내 시설 레벨(반경 안이면), 아니면 null */
  campLevel: number | null;
  /** 캐기 차례(굴림표·사다리 굴림 시드, objectYield.ts) */
  yieldSeq: number;
  /** 일꾼마다 수확 나머지(‰, crewYield.ts) */
  readonly yieldCarry: Map<number, number>;
  fatigueCarryPm: number;
  /** 채집 중 부상을 마지막으로 굴린 시각(이 뒤의 작업 주기 경계를 굴린다) */
  injuryCheckedMs: number;
  readonly assets: Set<string>;
  gatheredLots: number;
  depositedUnits: number;
  /** 넣은 뒤 끝낼 까닭(피로·떨어짐) */
  endAfterDeposit: GatherStop | null;
  stop: GatherStop | null;
  enterResult: GatherLoopView["enterResult"];
  updatedAt: number;
  /** 조우로 멈춤(suspend — 전투 뒤 resume이 다시 잇는다, 그동안 확인하지 않는다) */
  suspended: boolean;
  /** 들어가기 줄: 들어간 뒤 한 번 부를 것(GatherService.enter의 then). 없으면 null */
  afterEnter: ((result: GatherEnterResult) => void) | null;
}

/** 새 줄(걷기 전). 채집 줄은 오브젝트로 가는 단계, 들어가기는 들어가는 단계로 시작한다 */
export function freshAction(
  input: {
    readonly userId: string;
    readonly ownerId: number;
    readonly unitId: number;
    readonly mapKey: number;
    readonly kind: Action["kind"];
    readonly boatId: number | null;
  },
  atMs: number,
): Action {
  return {
    unitId: input.unitId,
    ownerId: input.ownerId,
    boatId: input.boatId,
    userId: input.userId,
    mapKey: input.mapKey,
    kind: input.kind,
    objectId: null,
    kindIndex: -1,
    buildingId: null,
    phase: input.kind === "gather" ? "to_object" : "entering",
    motion: null,
    checkAtMs: null,
    phaseAtMs: null,
    seq: 0,
    deposit: null,
    skip: new Set(),
    campLevel: null,
    yieldCarry: new Map(),
    fatigueCarryPm: 0,
    injuryCheckedMs: atMs,
    assets: new Set(),
    yieldSeq: 0,
    gatheredLots: 0,
    depositedUnits: 0,
    endAfterDeposit: null,
    stop: null,
    enterResult: null,
    updatedAt: atMs,
    suspended: false,
    afterEnter: null,
  };
}
