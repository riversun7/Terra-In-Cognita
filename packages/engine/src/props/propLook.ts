// 2차맵 소품(나무·바위·덤불·갈대·쓰러진 나무 + 2026-11-11 장식 소품 11종) 겉모습 표 — 순수 코드(three를 쓰지 않는다, 시험·워커도 가져온다).
// 소품 그림 번호는 지형 파일 TCTR 2판 소품 그림 층(@terra/shared MAP_PROP_ARTS)이다. 판정에 쓰지 않는 기기 장식이다
// (ADR 2026-10-31-second-map-from-planet 5절, 사용자 결정 U5 (가): 가까이만 모델, 멀리는 땅 색에 섞는다).
// - 땅 색 섞기: 배치 칸마다 소품 색과 세기(엄폐 값에 따라, 장식 소품은 그림마다 옅게). 지형 재질이 읽는다(먼 거리에서도 숲이 보인다).
// - 모델: 가까이(화면 짧은 변 PROP_MODEL_SPAN_M 아래)에서 카메라 둘레 배치 칸마다 하나(성긴 숲은 둘에 하나).
// - 땅 잔소품(풀포기·자갈·버섯·부들 등, ground clutter): 그림이 없는 칸에 지표(지형 칸)와 칸 해시로 기기가 정한다(groundClutter).
//   판정·지형 파일과 상관없다(ADR 46 5절 표 "장식 소품 … 기기가 정한다").
// 세계 색은 화면 테마와 상관없다(D-070). 모르는 그림 번호는 그리지 않는다(서버가 더 새 번호를 보낼 수 있다).
import { MAP_PROP_ARTS } from "@terra/shared";
import { PLACEMENT_CELLS, SURFACE, TERRAIN_CELLS } from "../terrain/terrainData.ts";
import { type Rgb, toByte } from "../terrain/terrainTextures.ts";

/** 모델 모양(propView.ts가 부분 인스턴스로 짓는다) */
export type PropShape =
  | "broadleaf"
  | "conifer"
  | "palm"
  | "bush"
  | "reeds"
  | "boulder"
  | "log"
  | "cactus"
  | "dryShrub"
  | "tallGrass"
  | "flowers"
  | "stones"
  | "driftwood"
  | "termiteMound"
  | "deadTree"
  | "fern"
  | "iceBlock"
  | "bones"
  | "outcrop";

export interface PropLook {
  readonly shape: PropShape;
  /** 땅 색 섞기·모델 주 색(0~1) */
  readonly color: Rgb;
  /** 모델 높이(m, 대략) */
  readonly heightM: number;
  /** 엄폐 없는 칸의 땅 색 섞기 세기(0~255). 없으면 60. 작은 장식은 옅게(멀리서 땅 색이 얼룩지지 않게) */
  readonly tint?: number;
  /** 광맥 조각 색(노두 — 없으면 바위 색) */
  readonly vein?: Rgb;
}

/** 그림 이름 → 겉모습. 이름표에 없는 그림(새 콘텐츠)은 그리지 않는다 */
const LOOKS: Readonly<Record<string, PropLook>> = {
  tree_broadleaf: { shape: "broadleaf", color: [0.27, 0.52, 0.27], heightM: 11 },
  tree_conifer: { shape: "conifer", color: [0.2, 0.42, 0.32], heightM: 14 },
  tree_palm: { shape: "palm", color: [0.42, 0.62, 0.3], heightM: 10 },
  bush: { shape: "bush", color: [0.42, 0.6, 0.3], heightM: 1.6 },
  reeds: { shape: "reeds", color: [0.7, 0.72, 0.42], heightM: 2 },
  boulder: { shape: "boulder", color: [0.55, 0.54, 0.52], heightM: 3 },
  log: { shape: "log", color: [0.5, 0.38, 0.26], heightM: 0.8 },
  cactus: { shape: "cactus", color: [0.36, 0.56, 0.34], heightM: 3.2, tint: 50 },
  dry_shrub: { shape: "dryShrub", color: [0.62, 0.55, 0.36], heightM: 1.1, tint: 45 },
  tall_grass: { shape: "tallGrass", color: [0.56, 0.7, 0.34], heightM: 1.2, tint: 45 },
  flowers: { shape: "flowers", color: [0.5, 0.68, 0.36], heightM: 0.5, tint: 35 },
  stones: { shape: "stones", color: [0.6, 0.59, 0.56], heightM: 0.7, tint: 40 },
  driftwood: { shape: "driftwood", color: [0.72, 0.66, 0.56], heightM: 0.4, tint: 25 },
  termite_mound: { shape: "termiteMound", color: [0.68, 0.5, 0.34], heightM: 2.4, tint: 40 },
  dead_tree: { shape: "deadTree", color: [0.48, 0.43, 0.37], heightM: 7, tint: 30 },
  fern: { shape: "fern", color: [0.3, 0.56, 0.28], heightM: 1, tint: 55 },
  ice_block: { shape: "iceBlock", color: [0.78, 0.89, 0.96], heightM: 1.8, tint: 70 },
  bones: { shape: "bones", color: [0.92, 0.9, 0.84], heightM: 0.3, tint: 15 },
  // 노두(기획 D-534 질문 1083 나): 서버 채집 오브젝트 자리에 기기가 덮어 세운다. 낮고 넓은 바위 + 광맥 조각(돌 = 밝은 회색, 구리 = 푸른 녹)
  outcrop_stone: {
    shape: "outcrop",
    color: [0.62, 0.6, 0.56],
    heightM: 1.4,
    tint: 40,
    vein: [0.82, 0.8, 0.74],
  },
  outcrop_copper: {
    shape: "outcrop",
    color: [0.52, 0.48, 0.44],
    heightM: 1.4,
    tint: 40,
    vein: [0.33, 0.68, 0.56],
  },
};

/** 그림 번호 → 겉모습(없음·모름이면 undefined) */
export function propLook(art: number): PropLook | undefined {
  const name = MAP_PROP_ARTS[art];
  return name === undefined ? undefined : LOOKS[name];
}

/**
 * 땅 색 섞기 세기(0~255): 차폐 > 은폐 > 엄폐 없는 소품. 은폐를 차폐에 가깝게 둔다: 숲의 빈 길(차폐 → 은폐)이 멀리서
 * 밝은 곧은 줄로 보이지 않게(경계 너머 보기 사진)
 */
export function propTint(cover: number, art: number): number {
  if (!propLook(art)) return cover === 2 ? 150 : cover === 1 ? 120 : 0;
  if (cover === 2) return 190;
  if (cover === 1) return 160;
  return propLook(art)?.tint ?? 60;
}

/** 소품 색 텍스처 바이트 수(배치 칸 256² RGBA8) */
export const PROP_TEXTURE_BYTES = PLACEMENT_CELLS * PLACEMENT_CELLS * 4;

/** 엄폐가 있는데 그림이 없는 칸(숲 그림 항목이 없을 때)의 색 */
const COVER_ONLY_RGB: Rgb = [0.3, 0.48, 0.3];

/**
 * 소품 색 텍스처: 배치 칸마다 (r, g, b, 세기). 행 우선(index = 행 × 256 + 열) — 텍스처 (x = 열, y = 행).
 * 세기 0이면 땅 색 그대로다. out을 주면 그 배열에 쓴다
 */
export function buildPropTextureData(
  art: Uint8Array,
  cover: Uint8Array,
  out: Uint8Array = new Uint8Array(PROP_TEXTURE_BYTES),
): Uint8Array {
  for (let i = 0; i < PLACEMENT_CELLS * PLACEMENT_CELLS; i++) {
    const code = art[i] ?? 0;
    const value = cover[i] ?? 0;
    const color = propLook(code)?.color ?? COVER_ONLY_RGB;
    const o = i * 4;
    out[o] = toByte(color[0]);
    out[o + 1] = toByte(color[1]);
    out[o + 2] = toByte(color[2]);
    out[o + 3] = propTint(value, code);
  }
  return out;
}

/** 소금 범위(칸 해시에 섞는 작은 정수) */
const SALT_RANGE = 4_096;

/**
 * 2차맵 이름 → 소품 소금. 같은 2차맵이면 지금 2차맵이든 이웃이든 같은 값이라, 옆 2차맵으로 넘어도 나무가 같은 자리에 선다
 * (docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)"). 이름을 모르면 0
 */
export function propSalt(id: string | null): number {
  if (id === null) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return (hash >>> 0) % SALT_RANGE;
}

/** 땅 잔소품 종류(그림이 없는 칸, 지표로 고른다) */
export type ClutterKind =
  | "tuft"
  | "sedge"
  | "pebbles"
  | "shell"
  | "snowLump"
  | "iceShard"
  | "cattail"
  | "blossom";

/** 지표(SURFACE) → [잔소품 종류, 칸마다 놓일 몫 0~1]. 물·모르는 지표는 없다 [임시: 눈으로 맞춘 값] */
const CLUTTER_BY_SURFACE: Readonly<Partial<Record<number, readonly [ClutterKind, number]>>> = {
  [SURFACE.grass]: ["tuft", 0.5],
  [SURFACE.dirt]: ["tuft", 0.22],
  [SURFACE.rock]: ["pebbles", 0.35],
  [SURFACE.sand]: ["shell", 0.12],
  [SURFACE.gravel]: ["pebbles", 0.4],
  [SURFACE.snow]: ["snowLump", 0.16],
  [SURFACE.ice]: ["iceShard", 0.08],
  [SURFACE.mud]: ["sedge", 0.32],
  [SURFACE.ash]: ["pebbles", 0.2],
  [SURFACE.shallowWater]: ["cattail", 0.28],
};

/** 풀 칸에서 풀포기 대신 꽃 한 송이가 될 몫 */
const BLOSSOM_SHARE = 0.08;

/**
 * 배치 칸 하나의 땅 잔소품(없으면 null). surface = 지형 칸 지표 128², roll·pick = 칸 해시(0~1, 서로 다른 소금).
 * 그림이 있는 칸은 부르지 않는다(소품이 먼저다)
 */
export function groundClutter(
  surface: Uint8Array | undefined,
  cell: number,
  roll: number,
  pick: number,
): ClutterKind | null {
  if (!surface) return null;
  const x = cell % PLACEMENT_CELLS;
  const z = Math.floor(cell / PLACEMENT_CELLS);
  const code = surface[(z >> 1) * TERRAIN_CELLS + (x >> 1)] ?? -1;
  const entry = CLUTTER_BY_SURFACE[code];
  if (!entry || roll >= entry[1]) return null;
  if (entry[0] === "tuft" && code === SURFACE.grass && pick < BLOSSOM_SHARE) return "blossom";
  return entry[0];
}

/** 배치 칸의 지표가 눈·얼음인가(나무·바위에 눈을 얹는다). 지표가 없으면 false */
export function snowyCell(surface: Uint8Array | undefined, cell: number): boolean {
  if (!surface) return false;
  const x = cell % PLACEMENT_CELLS;
  const z = Math.floor(cell / PLACEMENT_CELLS);
  const code = surface[(z >> 1) * TERRAIN_CELLS + (x >> 1)];
  return code === SURFACE.snow || code === SURFACE.ice;
}
