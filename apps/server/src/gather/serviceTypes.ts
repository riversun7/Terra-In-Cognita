// 채집 서비스 모양(입력 고리·명령 결과·서비스) — gather/service.ts(1,000줄 상한)에서 옮겼다. service.ts가 다시 내보낸다.
import type { GatherResultCode } from "@terra/protocol";
import type { GatherLoopView } from "@terra/shared/gather";
import type { Primaries, SocietyCoefficients } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { GatherInjuryHook } from "../world/unitCondition.ts";
import type { GatherKind } from "./kinds.ts";
import type { GatherObject } from "./objects.ts";
import type { ObjectStore } from "./state.ts";

export type GatherCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: GatherResultCode };

export interface GatherDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
  readonly kinds: () => readonly GatherKind[];
  readonly rules: () => SocietyCoefficients;
  readonly ledger: Ledger;
  readonly store: ObjectStore;
  /** 사용자의 소유 주체(없으면 내 유닛 없음) */
  ownerOf(userId: string): number | undefined;
  /** 물자 자리 세계(건물 서비스가 만든다) */
  places(): PlaceWorld | undefined;
  /** 그 건물이 일하나(상태 문턱) */
  works(buildingId: number): boolean;
  /** 직무 배치·노동 계약·건물 작업에 묶였나 */
  unitBusy(unitId: number): boolean;
  /** 내가 내 시설에 배치한 유닛이면 그 시설(직무를 풀고 채집을 시킬 수 있다), 아니면 undefined */
  assignedBy?: ((ownerId: number, unitId: number) => number | undefined) | undefined;
  /** 직무 배치 풀기(채집을 시키기 전) */
  unassign?: ((userId: string, unitId: number) => Promise<{ readonly ok: boolean }>) | undefined;
  /** 직무 배치(들어가기: 내 채집 시설) */
  assign?:
    | ((userId: string, buildingId: number, unitId: number) => Promise<{ readonly ok: boolean }>)
    | undefined;
  /** 그 시설에서 일하는 유닛(건물 판) */
  workersAt?: ((buildingId: number) => readonly { readonly unitId: number }[]) | undefined;
  /** 유닛 1차 스탯(입은 장비·버프 포함) */
  primaries(unitId: number): Primaries;
  /** 2차맵(= 1차맵 칸)의 오염 값(0 ~ 100,000) */
  pollution(mapKey: number): number;
  /**
   * 2차맵(1차맵 칸) 행성 값의 원자재 비트(@terra/shared/catchment cellMaterials — 밭·목초지의 기후 조건). 없거나 undefined면 보지 않는다
   * (행성 값 없는 임시 지형). 오브젝트 목록은 지형 판 표지마다 한 번 만들므로 문턱 설정 칸을 바꾸면 다음 시작 때 든다
   */
  materials?(mapKey: number): number | undefined;
  /**
   * 2차맵(1차맵 칸) 행성 값의 광석 고도 몫(‰, @terra/shared/catchment oreSharePm — 노두가 설 몫, 질문 1083 나). 없거나 undefined면 노두를 두지
   * 않는다(행성 값 없는 임시 지형)
   */
  oreSharePm?(mapKey: number): number | undefined;
  /** 2차맵(1차맵 칸) 행성 값의 목재 몫(‰, @terra/shared/catchment woodSharePm — 목재 몫 노두가 설 몫). 없으면 그 노두를 두지 않는다 */
  woodSharePm?(mapKey: number): number | undefined;
  /**
   * 2차맵(1차맵 칸)의 바이옴 ID와 물 비트(행성 값 — 지형별 오브젝트·어군이 설 조건, 기획 D-536). 없거나 undefined면 지형별 오브젝트·어군을
   * 두지 않는다(행성 값 없는 임시 지형)
   */
  terrainKind?(mapKey: number): { readonly biomeId: string | null; readonly waterBits: number } | undefined;
  /**
   * 채집 중 부상(docs/adr/2026-11-08-injury.md 5절, world/unitCondition.ts createGatherInjury): 캐기가 끝날 때마다 지난번 뒤로 지난 작업 주기
   * 경계를 굴린다. 없으면 다치지 않는다(시험)
   */
  workInjury?: GatherInjuryHook | undefined;
  /** 배 창고 상한(g, 배 종류 — boats 고리, D-568). 없거나 undefined면 설정 칸 boat_hold_kg */
  boatHoldGrams?: ((boatId: number) => number | undefined) | undefined;
  ready(): boolean;
}

export interface GatherService {
  start(
    userId: string,
    input: { unitId: number; mapKey: number; objectId: number },
  ): Promise<GatherCommandResult>;
  /**
   * 서버가 시키는 채집(NPC 배 어부 — boats/npcFleet.ts, 기획 D-542 1331 나): 소유 주체로 직접. 봇도 된다(소유·상태만 본다). 규칙은 start와 같다
   */
  startAs(
    ownerId: number,
    input: { unitId: number; mapKey: number; objectId: number },
  ): Promise<GatherCommandResult>;
  /** 채집을 멈춘다(그 자리에 선다, 든 화물은 그대로) */
  halt(userId: string, unitId: number): GatherCommandResult;
  enter(userId: string, input: { unitId: number; buildingId: number }): Promise<GatherCommandResult>;
  /** 그 2차맵의 오브젝트(자리는 지형에서, 상태는 저장소에서). 어군은 집 자리(x, y)와 길(route) */
  objects(mapKey: number): readonly GatherObject[] | undefined;
  /** 그 2차맵의 오브젝트, 어군은 시각 nowMs의 자리로(채집소 반경 셈 — 기획 D-536 움직이는 어군) */
  objectsAt(mapKey: number, nowMs: number): readonly GatherObject[] | undefined;
  /** 내 줄(진행 중 + 최근 끝난 것) */
  loops(userId: string): GatherLoopView[];
  /** 그 건물 안 유닛(들어가기로 머묾) */
  insideOf(buildingId: number): readonly { readonly unitId: number; readonly ownerId: number }[];
  /** 그 2차맵에서 건물 안에 머무는 유닛(지도에서 숨김) */
  insideOn(
    mapKey: number,
  ): readonly { readonly unitId: number; readonly buildingId: number; readonly ownerId: number }[];
  runDue(): void;
  readonly active: number;
  /** 그 유닛에 채집 줄이 있나(채집소 운반꾼 고르기가 뺀다, 질문 1090 가) */
  acting(unitId: number): boolean;
  stop(): void;
}
