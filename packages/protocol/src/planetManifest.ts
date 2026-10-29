// 행성 목록 정보(JSON) — GET /api/planets/<행성 ID>. ADR 2026-10-29-s2-planet-lod(36) "전송"
// 서버가 보내고 기기(렌더러)가 읽는다. 기기는 이 스키마로 검사한 뒤 타일 주소 틀로 타일을 받는다.
// 새 필드를 더해도 옛 기기가 읽게 모르는 필드는 버린다(strict가 아니다). 필드 뜻을 바꾸면 tileFormatVersion이나
// 새 필드로 알린다. WebSocket 메시지가 아니라서 PROTOCOL_VERSION과 무관하다.
import { z } from "zod";
import {
  PLANET_FACE_LEVEL_MAX,
  PLANET_FACE_LEVEL_MIN,
  PLANET_TILE_FORMAT_VERSION,
  PLANET_TILE_KEY_PLACEHOLDER,
} from "./planetTile.ts";

/** 콘텐츠 ID 형식(영어 snake_case 2~48자, packages/content ID_PATTERN과 같다 — 서버 시험이 확인) */
export const PLANET_ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

/** 행성 상태: 굽는 중(타일 없음) · 완료(타일을 받을 수 있다) */
export const PLANET_STATUSES = ["generating", "ready"] as const;
export type PlanetStatus = (typeof PLANET_STATUSES)[number];

const contentIdSchema = z.string().regex(PLANET_ID_PATTERN);
const localizedNameSchema = z.object({ ko: z.string().min(1).max(200), en: z.string().min(1).max(200) });

/** 바이옴 범례 한 줄: 타일 바이옴 바이트 값(index) → ID·색·이름 */
export const planetBiomeSchema = z.object({
  index: z.number().int().min(0).max(255),
  id: contentIdSchema,
  /** 화면 색 "#rrggbb"(소문자) */
  colour: z.string().regex(/^#[0-9a-f]{6}$/),
  name: localizedNameSchema,
});
export type PlanetBiome = z.output<typeof planetBiomeSchema>;

export const planetManifestSchema = z.object({
  /** 행성 ID = 콘텐츠 ID */
  id: contentIdSchema,
  name: localizedNameSchema,
  faceLevel: z.number().int().min(PLANET_FACE_LEVEL_MIN).max(PLANET_FACE_LEVEL_MAX),
  /** 반지름(m, 표시용) */
  radiusM: z.number().positive().finite(),
  generatorVersion: z.number().int().min(0).max(0xffff_ffff),
  /** 정의 해시(SHA-256 소문자 16진수) — 타일 내용을 정하는 입력 */
  definitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(PLANET_STATUSES),
  /** 타일 이진 형식 버전. 기기가 아는 버전(PLANET_TILE_FORMAT_VERSION)과 다르면 타일을 읽지 못한다 */
  tileFormatVersion: z.number().int().min(1).max(0xffff),
  /** 타일 주소 틀(같은 출처 경로). {tileKey} 자리에 타일 ID(10진수)를 넣는다(planetTilePath) */
  tileUrlTemplate: z
    .string()
    .max(512)
    .refine(
      (value) =>
        value.startsWith("/") && !value.startsWith("//") && value.includes(PLANET_TILE_KEY_PLACEHOLDER),
    ),
  /** 바이옴 범례(index·ID가 겹치지 않는다) */
  biomes: z
    .array(planetBiomeSchema)
    .max(256)
    .refine((list) => new Set(list.map((biome) => biome.index)).size === list.length)
    .refine((list) => new Set(list.map((biome) => biome.id)).size === list.length),
});
export type PlanetManifest = z.output<typeof planetManifestSchema>;

/** 이 기기가 이 행성의 타일을 읽을 수 있는가 */
export function canReadPlanetTiles(manifest: Pick<PlanetManifest, "tileFormatVersion">): boolean {
  return manifest.tileFormatVersion === PLANET_TILE_FORMAT_VERSION;
}
