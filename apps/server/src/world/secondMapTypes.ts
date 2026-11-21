// 2차맵 하나의 서버 상태 모양(secondMap.ts에서 나눔 — 그 파일 1,000줄 상한, 배 B1 docs/adr/2026-11-13-boats.md). secondMap.ts가 다시 내보낸다
import type { ResultCode, UnitMotionWire } from "@terra/protocol";
import type { BuildingPlacement, CellRect, Motion, Point, SizeClass } from "@terra/sim";
import type { WaterMask } from "@terra/shared/waterNearby";
import type { BotHome } from "./bots.ts";
import type { EdgeHooks } from "./edgeWatch.ts";
import type { MapTerrain, TerrainFile } from "./mapTerrain.ts";
import type { MapStream } from "./mapStream.ts";
import type { MapReplicaInit } from "./pathMessages.ts";
import type { PathService } from "./pathService.ts";
import type { BuildingRow, MapPersist, TransferRow, UnitJob, UnitRow } from "./secondMapRows.ts";
import type { UnitCondition } from "./unitCondition.ts";
import type { ExploredStore, MapVision } from "./vision.ts";
import type { WalkUnit } from "./walkSpeed.ts";
import type { SizedEntry } from "./wire.ts";
import type { WorldStats } from "./worldStats.ts";
import type { WorldDomain } from "../db/schema.ts";

/** 2차맵 내부 유닛 상태(secondMap.ts에서 분리 — 1,000줄 상한) */
export interface MapUnitState {
  readonly id: number;
  ownerId: number;
  kind: number;
  readonly domain: WorldDomain;
  size: SizeClass;
  speed: number;
  motion: Motion;
  entry: SizedEntry<UnitMotionWire>;
  destination: Point;
  routeSeq: number;
  planning: boolean;
  eventId: number | undefined;
  wakeAtMs: number | undefined;
  aiStep: number;
  job: UnitJob;
  condition: UnitCondition;
  readonly bot: boolean;
  home: BotHome | undefined;
  aboard: number | undefined;
  traits: readonly number[] | undefined;
}

export type CommandResult = { ok: true; buildingId?: number } | { ok: false; code: ResultCode };

/** 유닛 읽기 모양(정산·불변 조건 검사) */
export interface UnitView {
  readonly id: number;
  readonly ownerId: number;
  readonly kind: number;
  readonly size: SizeClass;
  readonly motion: Motion;
  readonly job: UnitJob;
  readonly planning: boolean;
  readonly hasEvent: boolean;
  /** 타고 있는 배(docs/adr/2026-11-13-boats.md). 없으면 undefined */
  readonly aboard?: number | undefined;
  /** 개별 유닛 7축 성향(0~1000 길이 7). 없으면 undefined */
  readonly traits?: readonly number[] | undefined;
}

export interface MapLog {
  warn(obj: object, message: string): void;
  error(obj: object, message: string): void;
}

export interface SecondMapOptions {
  mapKey: number;
  /** 지형(고정본·캐시·생성기 또는 S1 임시 지형, mapTerrain.ts) */
  terrain: MapTerrain;
  paths: PathService;
  now: () => number;
  stats: WorldStats;
  log: MapLog;
  /** 저장 고리. 없으면 메모리에만 */
  persist?: MapPersist | undefined;
  /** 시험 봇의 소유 주체(시험 NPC 세력). 기본 0(DB 없음) */
  botOwnerId?: number | undefined;
  /** 새 유닛 ID(월드 전체에서 하나씩). 기본은 이 2차맵 안에서 1부터 */
  allocateUnitId?: (() => number) | undefined;
  /** 새 건물 ID. 기본은 이 2차맵 안에서 1부터 */
  allocateBuildingId?: (() => number) | undefined;
  /** 탐사 기록 저장(시야 전송). 없으면 메모리에만 */
  explored?: ExploredStore | undefined;
  /** 이 2차맵이 놓인 행성(기본: 시험 행성) */
  planetId?: string | undefined;
  /**
   * 플레이어가 처음 손댔을 때(건물을 처음 놓았을 때) 한 번 부른다 — 월드가 지금 지형을 고정본으로 저장한다
   * (PLAN 5.5, ADR 2026-10-31-second-map-from-planet 6절)
   */
  onFirstEdit?: (() => void) | undefined;
  /** 봇 아닌 유닛의 움직임 알림·경계 너머 시야(옆 2차맵 미리 띄우기, edgeWatch.ts — 2026-11-12). 없으면 없음 */
  edge?: EdgeHooks | undefined;
  /** 이동을 시작하는 유닛의 빠르기(D-540 걷기 = 실효 AGI, walkSpeed.ts). 없으면 유닛 speed 그대로 */
  walkSpeed?: ((unit: WalkUnit) => number) | undefined;
}

export interface SecondMap {
  readonly mapKey: number;
  /** 이 2차맵이 놓인 행성. 전체 ID = (행성, 2차맵 키) */
  readonly planetId: string;
  readonly generatorVersion: number;
  /** 지형 주소 판 표지(?v=) */
  readonly terrainVersion: string;
  /** 거르지 않은 전송(관리자 전체 보기) */
  readonly stream: MapStream;
  /** 시야로 거른 전송(플레이어) — S3 ADR 3절 */
  readonly vision: MapVision;
  /** 경로 워커가 사본을 만들 때 쓰는 지금 상태 */
  replicaInit(): MapReplicaInit;
  /** 지형 이진 파일(처음 부를 때 만들고 계속 쓴다) */
  terrainFile(): TerrainFile;
  /** 지형 칸 물 표(물가 조건, 질문 947 나 — 처음 부를 때 지형 파일에서 만들고 계속 쓴다, waterMask.ts) */
  waterMask(): WaterMask;
  /** 시험용 봇이 count개가 되게 모자란 만큼 만든다(이미 있는 봇은 그대로 둔다) */
  spawnBots(count: number): void;
  /** 스스로 움직이지 않는 유닛 하나를 기준 칸 (x, y)에 세운다. ID가 있거나 설 수 없으면 false */
  addUnit(spec: {
    id: number;
    size: SizeClass;
    speed: number;
    cellX: number;
    cellY: number;
    ownerId?: number;
    kind?: number;
    traits?: readonly number[] | null | undefined;
  }): boolean;
  /** 저장된 건물·유닛을 다시 놓고 예약을 다시 건다(부팅 복구). 놓지 못한 것의 ID를 돌려준다 */
  restore(
    units: readonly UnitRow[],
    buildings: readonly BuildingRow[],
  ): { badUnits: number[]; badBuildings: number[] };
  /** 모든 유닛 읽기(정산·불변 조건) */
  forEachUnit(visit: (unit: UnitView) => void): void;
  /** 정산 결과의 직무 상태를 넣고 저장한다 */
  setJob(unitId: number, job: UnitJob): boolean;
  /** 부상·포로 상태를 넣고 저장한다(전투 결과) */
  setCondition(unitId: number, condition: UnitCondition): boolean;
  /**
   * NPC 휴먼(시험 봇) 하나를 기준 칸 둘레(반경 칸 안)에 세운다(출생, docs/adr/2026-11-01-npc-brain-r5.md 7절).
   * ID가 있거나 설 곳이 없으면 false
   */
  spawnBotNear(
    id: number,
    ownerId: number,
    near: { readonly x: number; readonly y: number },
    radiusCells: number,
  ): boolean;
  /** 봇의 집(도시 시청 칸)·일터(null = 없음 — 지금 자리 둘레를 걷는다)를 정한다. 봇이 아니거나 없으면 false */
  setHome(unitId: number, home: BotHome | null): boolean;
  /** 유닛 7축 성향 배열(길이 7, 0~1000)을 저장한다. 없으면 false */
  setTraits?(unitId: number, traits: readonly number[] | null): boolean;
  /** 봇을 NPC 휴먼 몸(크기 1·걷기, D-534 — 1106 가)으로 바꾼다: 하던 이동을 지금 자리에서 멈추고 다시 깬다. 바꿨으면 true */
  setHumanBody(unitId: number): boolean;
  /** 유닛 주인을 바꾸고 저장한다(도시 주인이 바뀜). 없으면 false */
  setOwner(unitId: number, ownerId: number): boolean;
  /** 유닛 종류 코드를 바꾸고 저장한다(사이보그 융합 D-470: 휴먼 → 사이보그 유닛, 봇 ↔ 봇 아닌 것은 바꾸지 않는다). 없으면 false */
  setKind(unitId: number, kind: number): boolean;
  /** 유닛을 지운다(NPC 휴먼 사망). 하던 이동·예약은 버리고 보던 기기에 숨김을 보낸다. 없으면 false */
  removeUnit(unitId: number): boolean;
  /** 안전한 곳(기준 칸 = 가장 가까운 안전 도시, 없으면 가운데)으로 바로 옮긴다(질문 108 기본안·D-351). 하던 이동은 버린다 */
  relocateToSafety(unitId: number, near?: { readonly x: number; readonly y: number }): boolean;
  /**
   * 2차맵 사이 이동(docs/adr/2026-11-07-play-flow.md WP9): 유닛을 이 2차맵에서 빼고 저장할 한 줄을 돌려준다. 행은 지우지 않는다
   * (곧 옆 2차맵의 transferIn이 같은 줄을 새 2차맵 키로 쓴다 — 같은 쓰기 묶음). 봇·승객이거나 없으면 undefined. 배는 승객을 데리고 나간다
   * (riders, 기획 D-541 1283 나)
   */
  transferOut(unitId: number): TransferRow | undefined;
  /**
   * 다른 2차맵에서 넘어온 유닛을 기준 칸 (x, y)에 세운다(직무·상태·판단 횟수 그대로, 저장한다). 배(영역 sea)는 물 칸에 서고 승객을 다시 태운다.
   * ID가 있거나 설 수 없으면 false
   */
  transferIn(row: TransferRow, cellX: number, cellY: number): boolean;
  /** 그 크기 등급이 기준 칸 (x, y)에 설 수 있나(지형·건물만 본다, 유닛은 보지 않는다) */
  isStandable(cellX: number, cellY: number, size: SizeClass): boolean;
  /** 하던 이동을 멈추고 지금 자리에 세운다(2차맵 사이 이동 취소). 봇이거나 없으면 false */
  halt(unitId: number): boolean;
  /** 불변 조건 I5: 예약이 없는 봇 수(경로를 기다리는 봇은 뺀다) */
  missingEvents(): number;
  /** 불변 조건 I7: 몸이 건물 칸에 걸친 서 있는 유닛 수 */
  unitsInBuildings(): number;
  /**
   * speedFactor = 이 이동 하나의 빠르기 배수(유닛 속도는 그대로). 없으면 그 유닛의 운영자 빠르기 표시(setPace, operatorPace.ts — 표시가
   * 없으면 1)
   */
  moveUnit(
    unitId: number,
    target: Point,
    options?: { readonly speedFactor?: number },
  ): Promise<CommandResult>;
  /** 유닛 빠르기를 몸에서 다시 읽어 넣는다(D-540, 길 예상 시간 전에 — travel/service.ts). 지금 빠르기(유닛이 없으면 undefined) */
  refreshSpeed(unitId: number): number | undefined;
  /** 운영자 빠르기 표시(operatorPace.ts)를 바꾼다 — 1이면 지운다. 앞 값(유닛이 없으면 undefined). 메모리에만, 유닛이 2차맵을 떠나면 지운다 */
  setPace(unitId: number, factor: number): number | undefined;
  /** 그 유닛의 운영자 빠르기 표시(없으면 1) */
  paceOf(unitId: number): number;
  /** ownerId = 건물 주인 주체(시험 건물은 놓은 사람, 없으면 null). reuseId = 치운 건물을 같은 ID로 다시 놓기(facilities/cityRelayout.ts) */
  placeBuilding(placement: BuildingPlacement, ownerId?: number | null, reuseId?: number): CommandResult;
  /** 그 칸 네모에 지금 유닛 몸이 걸치나(도시 건물 배치 계획이 유닛 선 칸을 피한다 — facilities/cityLayoutGround.ts) */
  unitInRect(rect: CellRect): boolean;
  /** 놓을 수 있나만 본다(놓지 않음 — 폐허 정부 짓기 자리 제안, docs/adr/2026-11-07-ruins-restoration.md) */
  canPlace(placement: BuildingPlacement): boolean;
  removeBuilding(buildingId: number): CommandResult;
  /** 건물 주인(노동 계약의 시설 주인). 건물이 없으면 undefined */
  buildingOwner(buildingId: number): number | null | undefined;
  /** 모든 건물 ID·주인·기준 칸(노동 계약 화면, 구인 게시판의 가까운 도시) */
  forEachBuilding(
    visit: (building: {
      readonly id: number;
      readonly ownerId: number | null;
      readonly x: number;
      readonly y: number;
      /** 칸·크기·돌림(시야 칸 셈 — 건물 겉모습 조회) */
      readonly placement: BuildingPlacement;
    }) => void,
  ): void;
  gauges(): { units: number; moving: number; planning: number };
  /** 유닛의 크기 등급·속도·지금 움직임·주인·상태·종류 코드(unitKinds.ts, 보유 물건 칸 배치가 읽는다) */
  unitInfo(unitId: number):
    | {
        size: SizeClass;
        speed: number;
        motion: Motion;
        ownerId: number;
        condition: UnitCondition;
        kind: number;
        /** 정산 직무 상태(2차맵 사이 이동 확인 단계가 "직무가 끝난다"를 알린다) */
        job: UnitJob;
        /** 영역(배 = sea) */
        domain: WorldDomain;
        /** 타고 있는 배(없으면 undefined) */
        aboard: number | undefined;
      }
    | undefined;
  /** 배 하나를 물 칸 (x, y)(기준 칸, 크기 등급 2)에 세운다(docs/adr/2026-11-13-boats.md 3절). 물 격자가 없거나 설 수 없으면 false */
  addBoat(spec: { id: number; ownerId: number; speed: number; cellX: number; cellY: number }): boolean;
  /** 그 크기 등급이 물 기준 칸 (x, y)에 뜰 수 있나(물 격자). 물 칸이 없는 2차맵은 false */
  isNavigable(cellX: number, cellY: number, size: SizeClass): boolean;
  /** 유닛을 배에 태운다(움직임 = 배 움직임). 배가 아니거나 이미 탔으면 false. 거리·자리 판정은 부르는 쪽 */
  board(unitId: number, boatId: number): boolean;
  /** 승객을 땅 기준 칸 (x, y)에 내린다. 승객이 아니거나 설 수 없으면 false */
  disembark(unitId: number, cellX: number, cellY: number): boolean;
  /** 그 배의 승객 유닛 ID */
  passengers(boatId: number): number[];
  stop(): void;
}
