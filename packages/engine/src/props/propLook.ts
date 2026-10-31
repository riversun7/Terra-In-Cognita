// 2차맵 소품(나무·바위·덤불·갈대·쓰러진 나무) 겉모습 표 — 순수 코드(three를 쓰지 않는다, 시험·워커도 가져온다).
// 소품 그림 번호는 지형 파일 TCTR 2판 소품 그림 층(@terra/shared MAP_PROP_ARTS)이다. 판정에 쓰지 않는 기기 장식이다
// (ADR 2026-10-31-second-map-from-planet 5절, 사용자 결정 U5 (가): 가까이만 모델, 멀리는 땅 색에 섞는다).
// - 땅 색 섞기: 배치 칸마다 소품 색과 세기(엄폐 값에 따라). 지형 재질이 읽는다(먼 거리에서도 숲이 보인다).
// - 모델: 가까이(화면 짧은 변 PROP_MODEL_SPAN_M 아래)에서 카메라 둘레 배치 칸마다 하나(성긴 숲은 둘에 하나).
// 세계 색은 화면 테마와 상관없다(D-070). 모르는 그림 번호는 그리지 않는다(서버가 더 새 번호를 보낼 수 있다).
import { MAP_PROP_ARTS } from "@terra/shared";
import { PLACEMENT_CELLS } from "../terrain/terrainData.ts";
import { type Rgb, toByte } from "../terrain/terrainTextures.ts";

/** 모델 모양(propView.ts가 InstancedMesh를 만든다) */
export type PropShape = "broadleaf" | "conifer" | "palm" | "bush" | "reeds" | "boulder" | "log";

export interface PropLook {
  readonly shape: PropShape;
  /** 땅 색 섞기·모델 주 색(0~1) */
  readonly color: Rgb;
  /** 모델 높이(m, 대략) */
  readonly heightM: number;
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
  return 60;
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
