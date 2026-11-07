// 2차맵 구독·명령·전송 메시지 (ADR 2026-10-28-s1-second-map.md, 프로토콜 2부터)
// - 기기는 2차맵에 들어가면 subscribe, 나오면 unsubscribe를 보낸다. 서버는 result(ok) 다음 map_snapshot 조각들을
//   한꺼번에 보내고, 그 뒤에는 바뀐 것만 보낸다(unit_paths, building_placed, building_removed).
// - 위치는 2차맵 로컬 정수 고정소수점(배치 칸 하나 = 1024단위), 시각은 서버 시계 ms다. 위치를 계속 보내지 않는다:
//   유닛은 "경로(꺾이는 점) + 출발 시각 + 속도"로 오고, 기기가 경로를 따라 위치를 계산한다.
// - 순서 확인(rev): 2차맵마다 바뀔 때마다 1씩 오르는 번호다. 기기 규칙(스냅샷을 다 받으면 내 rev = 스냅샷 rev):
//   · unit_paths(fromRev, rev): rev ≤ 내 rev면 버린다. fromRev > 내 rev면 빠진 것이 있다 → subscribe를 다시 보낸다.
//     그 밖에는 모두 적용하고 내 rev = rev. 유닛 움직임은 통째 바꾸기라 겹쳐 받아도 결과가 같다.
//   · building_placed·building_removed(rev): rev ≤ 내 rev면 버린다. rev − 1 > 내 rev면 빠진 것이 있다.
//   · map_snapshot은 언제든 다시 올 수 있다(느린 연결을 따라잡기, 다시 구독). 다 받으면 상태를 통째로 바꾼다.
// - 숨김 정보(자원·크리쳐)는 넣지 않는다. 볼 수 있는지는 서버가 확인한다(ADR 2026-10-28-fog-and-map-visibility).
// - 오류는 문장이 아니라 코드로 보낸다(기기가 번역).
import { z } from "zod";

/** 위치 고정소수점: 배치 칸 하나 = 1024단위 (packages/sim CELL_UNITS와 같다 — 서버 시험이 확인) */
export const POSITION_UNITS_PER_CELL = 1024;
/** 2차맵 배치 격자 한 변의 칸 수 (@terra/planet PLACEMENT_CELLS_PER_SIDE와 같다) */
export const SECOND_MAP_CELLS = 256;
/** 2차맵 한 변의 길이(단위). 위치는 0 이상 이 값 미만 */
export const SECOND_MAP_UNITS = SECOND_MAP_CELLS * POSITION_UNITS_PER_CELL;
/** 경로 하나의 꺾이는 점 상한. 넘는 경로는 서버가 쓰지 않는다(path_too_complex) */
export const MAX_PATH_POINTS = 1024;
/** 속도 상한(단위/초, packages/sim MAX_SPEED와 같다) */
export const MAX_UNIT_SPEED = 0x10_0000;
/** 건물 한 변의 상한(칸, S1 임시값) */
export const MAX_BUILDING_SIDE = 32;
/** 유닛 크기 등급 = 통과 폭(칸). 1 일반, 2 대형, 3 초대형 (packages/sim SizeClass) */
export const UNIT_SIZE_CLASSES = [1, 2, 3] as const;

/**
 * 시험 2차맵의 키: S2 시험 행성(면 레벨 9) 면 0의 (i, j) = (282, 328) 칸(초지, ADR 2026-10-31-second-map-from-planet 8절).
 * = @terra/planet `cellKey(0, EARTH_FACE_LEVEL, 282, 328)` (서버 시험이 같은 값인지 본다). 기기는 이 2차맵을 구독한다.
 * 옛 값(S1 임시 지형 시절, (256, 256) = 281_474_976_710_665)은 S2 시험 행성에서 깊은 바다 위라 옮겼다.
 */
export const S1_TEST_MAP_KEY = 312_905_547_382_793;

/** 2차맵 메시지에 필요한 가장 낮은 프로토콜 버전(시야 전송, S3). 더 낮게 인사한 연결이 보내면 invalid_message로 거절한다 */
export const SECOND_MAP_PROTOCOL_VERSION = 3;
/**
 * 유닛 조종 권한(docs/adr/2026-11-07-unit-control.md): 멈추기 명령 stop_unit, 결과 코드 not_owner(내 유닛이 아님)·unit_stays(수호신은 그 도시에
 * 머문다). 더 낮게 인사한 연결이 stop_unit을 보내면 invalid_message, 그 연결은 두 코드 대신 forbidden을 받는다
 */
export const UNIT_CONTROL_PROTOCOL_VERSION = 17;
/** 탐사 칸 비트 모음 바이트 수(시야 칸 32×32, packages/sim VISION_BYTES와 같다) */
export const VISION_BYTES = 128;
/** 개발 시험 명령 한 번에 받는 시험 일꾼 상한 */
export const MAX_DEV_SPAWN_UNITS = 20;

const u32 = z.number().int().nonnegative().max(0xffff_ffff);
/** 기기가 정하는 요청 번호. 명령은 같은 사용자 안에서 10분 동안 겹치지 않게 쓴다(중복 방지 키) */
const requestId = u32;
/** 2차맵 키 = 그 1차맵 최소 칸의 셀 키(@terra/planet). 셀 키 검사는 서버가 한다 */
const mapKey = z.number().int().nonnegative();
const unitId = z.number().int().positive().max(0xffff_ffff);
const buildingId = z.number().int().positive().max(0xffff_ffff);
const position = z
  .number()
  .int()
  .nonnegative()
  .max(SECOND_MAP_UNITS - 1);
const cell = z
  .number()
  .int()
  .nonnegative()
  .max(SECOND_MAP_CELLS - 1);
const buildingSide = z.number().int().min(1).max(MAX_BUILDING_SIDE);
const rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const sizeClass = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const revision = z.number().int().nonnegative();
const timestampMs = z.number().int().nonnegative();

// ---------- 기기 → 서버 ----------

/**
 * 2차맵 구독. 이미 구독 중이면 스냅샷을 새로 보낸다(빠진 것이 있을 때 다시 받는 방법).
 * observe: 관리자 전체 보기(dev·admin, 시야로 거르지 않는다. 서버가 감사 기록을 남긴다)
 */
export const subscribeMessage = z.object({
  t: z.literal("subscribe"),
  id: requestId,
  mapKey,
  observe: z.literal(true).optional(),
});

export const unsubscribeMessage = z.object({ t: z.literal("unsubscribe"), id: requestId, mapKey });

/**
 * 이동 명령: 유닛을 목표 위치(고정소수점)로 보낸다. 서버가 경로를 찾는다. 자기 유닛이거나 운영자(dev·admin, 권한 표 move-unit) —
 * 남의 유닛이면 not_owner, 내 수호신이면 unit_stays(프로토콜 17부터, 더 낮은 연결은 forbidden)
 */
export const moveUnitMessage = z.object({
  t: z.literal("move_unit"),
  id: requestId,
  mapKey,
  unitId,
  x: position,
  y: position,
});

/**
 * 멈추기 명령(프로토콜 17): 하던 이동을 멈추고 지금 자리에 세운다. 권한·소유 규칙은 move_unit과 같다(서버 봇·포로·중태는 invalid_request).
 * 그 유닛이 2차맵 사이를 가는 중이면 그 길도 끝난다("길에서 벗어남")
 */
export const stopUnitMessage = z.object({
  t: z.literal("stop_unit"),
  id: requestId,
  mapKey,
  unitId,
});

/**
 * 관리자 시험 명령: 직사각형 건물 놓기. (x, y) = 회전한 뒤 차지하는 직사각형의 왼쪽 위 칸,
 * width·height = 회전하기 전 칸 수. 90°·270°는 가로세로가 바뀐다(packages/sim placement.ts와 같은 규칙).
 */
export const placeBuildingMessage = z.object({
  t: z.literal("place_building"),
  id: requestId,
  mapKey,
  x: cell,
  y: cell,
  width: buildingSide,
  height: buildingSide,
  rotation,
});

export const removeBuildingMessage = z.object({
  t: z.literal("remove_building"),
  id: requestId,
  mapKey,
  buildingId,
});

/** 개발 시험 명령(dev·admin): 내 시험 일꾼 count개를 이 2차맵에 받는다(채집 직무, 오프라인 정산 시험용) */
export const devSpawnUnitsMessage = z.object({
  t: z.literal("dev_spawn_units"),
  id: requestId,
  mapKey,
  count: z.number().int().min(1).max(MAX_DEV_SPAWN_UNITS),
});

// ---------- 서버 → 기기 ----------

/** 유닛 하나의 지금 움직임. 위치는 경로를 따라 기기가 계산한다(packages/sim motion.ts와 같은 반올림 규칙) */
export const unitMotionSchema = z.object({
  id: unitId,
  size: sizeClass,
  /** 단위/초 */
  speed: z.number().int().min(1).max(MAX_UNIT_SPEED),
  /** 첫 점을 떠난 시각(서버 ms) */
  departAtMs: timestampMs,
  /** 꺾이는 점 [x0, y0, x1, y1, …]. 첫 점이 출발 위치, 마지막 점이 목적지다. 점 하나면 서 있다 */
  path: z
    .array(position)
    .min(2)
    .max(MAX_PATH_POINTS * 2)
    .refine((values) => values.length % 2 === 0, "path needs x, y pairs"),
  /**
   * 남의 유닛: 경로를 보이는 구간에서 자른 끝 시각(서버 ms). 경로의 마지막 점이 그 시각의 위치다.
   * 그 뒤는 서버가 다음 구간이나 hidden을 보낸다. 내 유닛은 없다(경로 전체)
   */
  until: timestampMs.optional(),
  /** 내 유닛(시야 전송, S3): 내가 움직일 수 있다. 전체 보기와 남의 유닛은 없다 */
  own: z.literal(true).optional(),
});
export type UnitMotionWire = z.infer<typeof unitMotionSchema>;

/** 놓인 건물. 칸 규칙은 place_building과 같다 */
export const buildingSchema = z.object({
  id: buildingId,
  x: cell,
  y: cell,
  width: buildingSide,
  height: buildingSide,
  rotation,
});
export type BuildingWire = z.infer<typeof buildingSchema>;

/**
 * 스냅샷 조각. 메시지 하나가 MAX_MESSAGE_BYTES를 넘지 않게 나눈다.
 * 조각들은 끊기지 않고 차례로 온다(사이에 다른 2차맵 메시지가 끼지 않는다). part 0이 오면 새로 모으기 시작하고,
 * 같은 snapshotId의 조각(part 0 ~ parts − 1)을 모두 받으면 적용한다. 조각마다 머리 정보는 같다.
 */
const mapSnapshotMessage = z.object({
  t: z.literal("map_snapshot"),
  mapKey,
  /** 2차맵마다 오르는 스냅샷 번호. 같은 번호면 같은 내용이다(여러 연결에 같은 조각을 보낼 수 있다) */
  snapshotId: u32,
  part: z.number().int().nonnegative(),
  parts: z.number().int().positive(),
  /** 이 스냅샷이 담은 2차맵 상태의 순서 번호 */
  rev: revision,
  /** 스냅샷을 만든 서버 시각(ms) */
  serverTime: timestampMs,
  /** 지형 이진 파일 주소(버전이 붙은 불변 주소, 로그인 필요)와 생성기 버전 */
  terrain: z.object({ url: z.string().min(1).max(256), generatorVersion: u32 }),
  units: z.array(unitMotionSchema),
  buildings: z.array(buildingSchema),
});

/**
 * 바뀐 유닛 움직임 묶음(약 100ms마다). (fromRev, rev] 사이 바뀐 유닛의 마지막 움직임만 담는다.
 * hidden: 그 사이 시야에서 사라진 유닛(지운다). units를 먼저 적용하고 hidden을 지운다. 둘 다 비지 않는다(하나는 있다)
 */
const unitPathsMessage = z
  .object({
    t: z.literal("unit_paths"),
    mapKey,
    fromRev: revision,
    rev: revision,
    units: z.array(unitMotionSchema),
    hidden: z.array(unitId).optional(),
  })
  .refine((message) => message.units.length > 0 || (message.hidden?.length ?? 0) > 0, "empty unit_paths");

/** 탐사 칸(시야 칸 32×32 비트, base64). 구독할 때와 바뀔 때. 통째 바꾸기라 순서 번호가 없다. 기기는 탐사하지 않은 곳을 검게 칠한다 */
const visionMessage = z.object({
  t: z.literal("vision"),
  mapKey,
  explored: z
    .string()
    .length(Math.ceil(VISION_BYTES / 3) * 4)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
});

const buildingPlacedMessage = z.object({
  t: z.literal("building_placed"),
  mapKey,
  rev: revision,
  building: buildingSchema,
});

const buildingRemovedMessage = z.object({
  t: z.literal("building_removed"),
  mapKey,
  rev: revision,
  buildingId,
});

/** 요청 결과 코드. 화면 문구는 기기가 코드로 고른다 */
export const RESULT_CODES = [
  /** 로그인하지 않음(구독·명령 모두 로그인 필요) */
  "sign_in_required",
  /** 권한 없음(건물 명령은 관리자만, 전체 보기는 dev·admin만. 프로토콜 16 이하 연결은 not_owner·unit_stays 대신 이것) */
  "forbidden",
  "rate_limited",
  /** 서버가 바쁨(경로 대기열이 참, 같은 연결의 요청이 너무 많이 밀림) */
  "busy",
  "unknown_map",
  /** 탐사·시야 규칙상 볼 수 없음(ADR 26. S1은 모두 통과) */
  "not_visible",
  /** 한 연결이 구독할 수 있는 2차맵 수를 넘음 */
  "too_many_maps",
  "unknown_unit",
  "unknown_building",
  /** 같은 유닛에 더 새 이동이 들어와 이 명령은 버려짐 */
  "superseded",
  "start_blocked",
  "goal_blocked",
  "no_path",
  /** 탐색 예산 안에 길을 못 찾음(길이 있는지 모름) */
  "budget_exceeded",
  /** 꺾이는 점이 MAX_PATH_POINTS를 넘음 */
  "path_too_complex",
  "out_of_bounds",
  "overlaps_building",
  "overlaps_road",
  /** 유닛이 서 있는 칸에는 건물을 놓지 않는다 */
  "overlaps_unit",
  "blocked_terrain",
  /** 2차맵의 건물 수 상한 */
  "building_limit",
  "invalid_request",
  "internal_error",
  /** 내 유닛이 아님(남의 유닛이거나 없는 유닛 — 둘을 나누지 않는다, 시야 밖 유닛이 있는지 새지 않게). 프로토콜 17부터 */
  "not_owner",
  /** 수호신은 그 도시에 머문다(기획 답 456 가 — 주인도 옮기거나 세우지 못한다). 프로토콜 17부터 */
  "unit_stays",
] as const;
export type ResultCode = (typeof RESULT_CODES)[number];

/** 요청(subscribe·unsubscribe·명령)의 결과. id는 요청의 id */
const resultMessage = z.discriminatedUnion("ok", [
  z.object({
    t: z.literal("result"),
    id: requestId,
    ok: z.literal(true),
    /** place_building이면 서버가 정한 건물 ID */
    buildingId: buildingId.optional(),
  }),
  z.object({ t: z.literal("result"), id: requestId, ok: z.literal(false), code: z.enum(RESULT_CODES) }),
]);

export const secondMapClientMessages = [
  subscribeMessage,
  unsubscribeMessage,
  moveUnitMessage,
  stopUnitMessage,
  placeBuildingMessage,
  removeBuildingMessage,
  devSpawnUnitsMessage,
] as const;

export const secondMapServerMessages = [
  mapSnapshotMessage,
  unitPathsMessage,
  visionMessage,
  buildingPlacedMessage,
  buildingRemovedMessage,
  resultMessage,
] as const;
