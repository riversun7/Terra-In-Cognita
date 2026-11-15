// 2차맵 사이 이동 서비스의 모양·순수 도우미 — service.ts가 쓴다(파일 크기 600줄 권장, docs/adr/2026-11-07-play-flow.md "WP9"·"WP11").
// 다른 모듈은 service.ts에서 가져온다(service.ts가 다시 내보낸다).
import type { ResultCode, TravelKind, TravelResultCode } from "@terra/protocol";
import {
  CELL_UNITS,
  type CellPoint,
  type Motion,
  PLACEMENT_SIZE,
  type Point,
  type SizeClass,
  VISION_CELL,
  arrivalAt,
  positionAt,
} from "@terra/sim";
import type {
  WorldTravel,
  WorldTravelProblem,
  WorldTravelRoute,
  WorldTravelStop,
} from "@terra/shared/worldMap";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap, UnitRow } from "../world/secondMap.ts";
import type { TravelRaids } from "./raid.ts";
import type { Hop } from "./route.ts";
import type { TravelRecord } from "./store.ts";

/** 목적지: 목적 2차맵과 그 안 배치 칸 */
export interface TravelTarget {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

export type TravelCommandResult =
  | { readonly ok: true; readonly maps?: number; readonly arriveAt?: number }
  | { readonly ok: false; readonly code: TravelResultCode };

export type TravelPlanResult =
  | { readonly ok: true; readonly plan: WorldTravelRoute }
  | { readonly ok: false; readonly problem: WorldTravelProblem };

/** 화면 한 줄(위도·경도는 조회가 붙인다) */
export type TravelView = Omit<WorldTravel, "latDeg" | "lonDeg">;

/**
 * 그때 띄우기(world/mapSpawn.ts, 기획 답 730 다, docs/adr/2026-11-07-play-flow.md "WP15"): 길의 마지막 2차맵(목적지)을 서버가 띄우지 않았으면
 * 유닛이 들어서려 할 때 띄운다. 지나는 2차맵(중간)은 그대로 건너뛴다(593 나)
 */
export interface TravelSpawn {
  /** 그때 띄울 수 있는 2차맵인가(이 행성의 2차맵 키, 아직 띄우지 않음) */
  canOpen(mapKey: number): boolean;
  /** 하나 더 띄울 자리가 있나(확인 단계·보내기가 미리 본다 — 닿을 때 다시 본다) */
  hasRoom(): boolean;
  open(mapKey: number): Promise<"ok" | "full" | "invalid" | "failed">;
  /** 곧 띄울 2차맵의 지형을 미리 받는다 */
  prefetch(mapKey: number): void;
}

/** 건너뛰는 중인 유닛의 지금 자리(보기 값 — 1차맵 내 자리 표시) */
export interface HiddenPlace {
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
}

export interface TravelService {
  /** 확인 단계: 지나는 2차맵·곧은 거리·걸리는 시간(보내지 않는다). unitId가 없으면 내 사이보그 본체 */
  plan(userId: string, request: TravelTarget & { readonly unitId?: number | undefined }): TravelPlanResult;
  /** 확정: 보낸다(첫 구간 길을 찾으면 ok). 가는 중이면 새 길로 바꾼다 */
  start(
    userId: string,
    request: TravelTarget & { readonly unitId: number; readonly kind: TravelKind },
    options?: { readonly speedFactor?: number },
  ): Promise<TravelCommandResult>;
  /**
   * 운영자 텔레포트(기획 D-560 1239, 프로토콜 36): 내 유닛을 걷지 않고 목적 칸 둘레의 설 칸으로 바로 옮긴다(가던 길은 버린다). 목적 2차맵을
   * 띄우지 않았으면 띄운 뒤 옮긴다. 권한(모든 유닛 명령)은 게이트웨이가 본다
   */
  teleport(userId: string, request: TravelTarget & { readonly unitId: number }): Promise<TravelCommandResult>;
  /** 운영자 모드를 껐다: 그 유닛들의 가는 길 빠르기를 1로(기획 D-560 1248 — 다음 구간부터 보통) */
  releasePace(unitIds: readonly number[]): void;
  /** 멈추기: 그 자리에 선다(건너뛰는 중이면 나타난 자리에서) */
  cancel(userId: string, unitId: number): TravelCommandResult;
  /** 내 유닛의 길(가는 중 + 최근 끝난 것), 유닛 ID 차례 */
  list(userId: string): TravelView[];
  /** 띄우지 않은 2차맵을 건너뛰는 중인 유닛의 지금 자리(아니면 undefined) */
  hiddenAt(unitId: number): HiddenPlace | undefined;
  /**
   * 도중 습격(기획 답 610 나, raid.ts)을 붙인다. 앱이 세계가 준비된 뒤 전투 자료·설정 칸으로 만든다(없으면 습격 없음). 굴림은 나타날 때라
   * 부팅 복구가 다시 숨긴 길도 붙인 뒤에 나타나면 굴린다
   */
  attachRaids(raids: TravelRaids | undefined): void;
  /** 그때 띄우기를 붙인다(world/mapSpawnWorld.ts — 없으면 띄우지 않은 목적지는 unknown_map) */
  attachSpawn(spawn: TravelSpawn | undefined): void;
  /**
   * 행성 값이 바다인 2차맵인가를 붙인다(boats/world.ts — 기획 D-542 1329 나). 배는 그런 띄우지 않은 2차맵만 건너뛴다. 없으면 배는 띄우지 않은
   * 2차맵을 건너뛰지 않는다(B2 그대로)
   */
  attachSea(isSea: ((mapKey: number) => boolean) | undefined): void;
  /** 가는 중인 길이 그 2차맵에 서 있거나(건너뛰어 나타날 곳 포함) 그 2차맵을 노리나 — 그때 띄운 2차맵을 내리지 않는다 */
  touches(mapKey: number): boolean;
  /** 부팅: 저장한 길을 다시 잇는다(유닛을 다시 놓은 뒤). 다시 시작한 수 */
  restore(): Promise<number>;
  /** 지금 시각까지 확인할 길을 처리한다(타이머가 부른다. 시험은 가짜 시계를 옮긴 뒤 부른다) */
  runDue(): void;
  /** 가는 중인 길 수 */
  readonly active: number;
  stop(): void;
}

export interface TravelDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly planetId: string;
  readonly now: () => number;
  readonly log: {
    info(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
  /** 사용자의 소유 주체(없으면 내 유닛 없음) */
  ownerOf(userId: string): number | undefined;
  /** 사용자의 사이보그 본체 유닛(없으면 null) */
  cyborgUnitOf?: ((userId: string) => number | null) | undefined;
  /** 그 주체를 그 시각까지 정산한다(2차맵을 넘기 직전) */
  settle?: ((ownerId: number, atMs: number) => void) | undefined;
  /** 쓰기 대기열(없으면 메모리에만) */
  readonly writer?: WorldWriter | undefined;
  /** 부팅 복구가 읽는 DB(없으면 복구 없음) */
  readonly pool?: QueryPool | undefined;
  /** 세계가 명령을 받을 수 있나(부팅 복구 끝) */
  ready(): boolean;
  /** 도중 습격(raid.ts). 없으면 습격 없음(attachRaids로 나중에 붙일 수 있다) */
  readonly raids?: TravelRaids | undefined;
  /** 그때 띄우기(없으면 띄우지 않은 목적지는 unknown_map, attachSpawn으로 나중에 붙일 수 있다) */
  readonly spawn?: TravelSpawn | undefined;
}

/** 건너뛰는 중(메모리): 들고 있는 유닛 행, 사라진 점(route[hop.from] 틀), 나타날 곳 */
export interface Hidden {
  readonly row: UnitRow;
  readonly startMs: number;
  readonly untilMs: number;
  readonly hop: Hop;
  readonly exit: Point;
  readonly size: SizeClass;
  readonly speed: number;
  /** 멈추기를 받았다: 나타나면 그 자리에 선다 */
  cancelled: boolean;
}

export interface Journey extends TravelRecord {
  /** 구간을 시작할 때마다 오른다(늦게 온 길 찾기 결과를 버린다) */
  seq: number;
  /** 지금 구간의 움직임(길 찾기를 기다리면 null) */
  motion: Motion | null;
  /** 다음 확인 시각(없으면 null) */
  checkAtMs: number | null;
  hidden: Hidden | null;
  /** 걷는 빠르기 배수(운영자 모드에서 보낸 길은 OPERATOR_SPEED_FACTOR, 아니면 1). 저장하지 않는다 — 다시 켜면 1 */
  speedFactor: number;
  /**
   * 배의 길(바다 건너기, 기획 D-541 1283 나): 설 칸 = 물 칸(isNavigable), 띄우지 않은 2차맵을 건너뛰지 않는다. 저장하지 않는다 — 다시 켜면 유닛 영역으로
   * 다시 정한다
   */
  sea?: boolean | undefined;
}

export interface Finished {
  readonly ownerId: number;
  readonly view: TravelView;
}

export const fail = (code: TravelResultCode): TravelCommandResult => ({ ok: false, code });

/** 2차맵 이동 명령 결과 → 보내기 결과 코드 */
export function commandCode(code: ResultCode): TravelResultCode {
  switch (code) {
    case "invalid_request":
      return "unavailable";
    case "superseded":
      return "busy";
    case "unknown_unit":
    case "unknown_map":
    case "start_blocked":
    case "goal_blocked":
    case "no_path":
    case "budget_exceeded":
    case "path_too_complex":
    case "busy":
      return code;
    default:
      return "internal_error";
  }
}

/** 보내기 결과 코드 → 멈춘 까닭 */
export function stopOf(code: TravelResultCode): WorldTravelStop {
  if (code === "unavailable") return "unavailable";
  if (code === "unknown_unit" || code === "busy") return "interrupted";
  return "blocked";
}

/** 보내기 결과 코드(확인 단계 문제 → WebSocket 코드, 건너뛰는 중은 다시 해 볼 수 있는 busy) */
export const startCode = (problem: WorldTravelProblem): TravelResultCode =>
  problem === "no_cyborg"
    ? "unknown_unit"
    : problem === "in_transit" || problem === "map_full"
      ? "busy"
      : problem;

const clampCell = (value: number): number => Math.max(0, Math.min(PLACEMENT_SIZE - 1, value));
export const cellOf = (point: Point): CellPoint => ({
  x: clampCell(Math.floor(point.x / CELL_UNITS)),
  y: clampCell(Math.floor(point.y / CELL_UNITS)),
});

/** 움직임이 지나간 자리(시야 칸 한 변마다 한 점 + 끝 점) — 탐사 기록에 남긴다 */
export function pathPoints(motion: Motion, untilMs: number): Point[] {
  const end = Math.min(untilMs, arrivalAt(motion));
  const stepMs = Math.max(1, Math.floor((VISION_CELL * CELL_UNITS * 1000) / Math.max(1, motion.speed)));
  const points: Point[] = [];
  for (let at = motion.departAtMs; at < end; at += stepMs) points.push(positionAt(motion, at));
  points.push(positionAt(motion, end));
  return points;
}
