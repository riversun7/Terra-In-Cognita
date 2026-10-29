// 행성 굽기 — 생성기 출력 → 타일(packages/planet) → 이진(packages/protocol) → gzip → 한 덩어리(pack)
// 굽기 워커(bakeWorker.ts)가 부른다. 시험은 같은 스레드에서 부른다(baker.ts createInlineBaker).
// pack = 압축한 타일을 planetTileIds 순서(맵 레벨 오름차순 → 키 오름차순)로 이은 것. 처음 화면용 거친 단계가 앞에 온다.
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import { type PlanetFields, buildPlanetTiles } from "@terra/planet";
import { encodePlanetTile } from "@terra/protocol";

/**
 * gzip 압축 수준 = zlib 기본값(6). 잰 값(합성 행성 F = 9, 작업 기록): 9는 0.3% 작은데 시간이 1.6배라 쓰지 않는다.
 */
export const PLANET_TILE_GZIP_LEVEL = 6;

/** 굽기 결과 (워커 → 메인 스레드로 넘긴다: pack 버퍼는 복사하지 않고 transfer) */
export interface BakedTiles {
  /** 압축한 타일을 이은 것 */
  pack: Uint8Array<ArrayBuffer>;
  /** 타일마다 [타일 ID, 압축 길이] (pack 순서) */
  tiles: [number, number][];
  /** 압축 전 바이트 합 */
  rawBytes: number;
  /** pack의 SHA-256 (디스크 캐시 무결성 확인) */
  packSha256: string;
  /** 생성기 결과 해시(meta.hash) */
  fieldsHash: string;
  /** 타일 만들기·이진 쓰기(ms) */
  tilesMs: number;
  /** gzip(ms) */
  gzipMs: number;
}

export interface TileHeaderValues {
  generatorVersion: number;
  definitionHash: string;
}

/** 생성기 출력 → 압축한 타일 덩어리 */
export function bakePlanetTiles(fields: PlanetFields, header: TileHeaderValues): BakedTiles {
  const chunks: Uint8Array[] = [];
  const tiles: [number, number][] = [];
  let rawBytes = 0;
  let packBytes = 0;
  let tilesMs = 0;
  let gzipMs = 0;
  let mark = performance.now();
  for (const { id, tile } of buildPlanetTiles(fields)) {
    const raw = encodePlanetTile({ ...tile, ...header });
    const encodedAt = performance.now();
    tilesMs += encodedAt - mark;
    const gzip = gzipSync(raw, { level: PLANET_TILE_GZIP_LEVEL });
    mark = performance.now();
    gzipMs += mark - encodedAt;
    chunks.push(gzip);
    tiles.push([id.key, gzip.byteLength]);
    rawBytes += raw.byteLength;
    packBytes += gzip.byteLength;
  }
  const pack = new Uint8Array(packBytes);
  let offset = 0;
  for (const chunk of chunks) {
    pack.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    pack,
    tiles,
    rawBytes,
    packSha256: createHash("sha256").update(pack).digest("hex"),
    fieldsHash: fields.meta.hash,
    tilesMs,
    gzipMs,
  };
}
