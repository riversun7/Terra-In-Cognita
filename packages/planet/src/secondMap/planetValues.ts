// 2차맵 생성기의 입력 = 행성 값(면 레벨 F 칸마다) — ADR 46 1절.
// - 저장 필드 8개(PlanetFields) + 생성기가 이미 계산하지만 저장하지 않던 값 셋(GeneratorDetails): 흐름 방향, 호수 수면, 웅덩이 종류.
//   생성기 출력 모양(PlanetFields)·GENERATOR_VERSION은 바꾸지 않는다: 셋은 runPlanetGenerator가 이미 돌려주는 부가 정보다.
// - 흐름 방향은 그 칸 면 틀의 8이웃 번호(0 ~ 7, generator/grid.ts NEIGHBOR_DI·NEIGHBOR_DJ 순서)이고, 255 = 없음(바다·흐름 끝).
// - 행성 값 파일(서버 캐시, 편집기 워커가 주고받는 꼴): 마법 "TCPV" + 머리 + 배열을 차례로. 작은 끝. Node·DOM API 없음.
import { cellsPerSide } from "../levels.ts";
import type { PlanetFields } from "../tiles/fields.ts";
import { NEIGHBOR_DI, NEIGHBOR_DJ } from "../generator/grid.ts";
import { FACES, wrapFaceIJ } from "../faces.ts";

/** 흐름 방향 없음(바다·호수·마른 분지에서 끝남, 또는 행성 밖) */
export const NO_RECEIVER = 255;

export interface PlanetValues {
  /** 면 레벨 F */
  readonly faceLevel: number;
  /** 행성 시드(u32) — 2차맵 노이즈 소금에 섞는다 */
  readonly seed: number;
  /** 바이옴 번호 → 바이옴 ID(행성 정의 biomes 순서). 지표·배치 규칙의 열쇠 */
  readonly biomeIds: readonly string[];
  readonly elevationM: Int16Array;
  readonly biome: Uint8Array;
  readonly temperatureC: Int8Array;
  readonly precipitationMm: Uint16Array;
  readonly humidity: Uint8Array;
  readonly water: Uint8Array;
  readonly river: Uint8Array;
  readonly forest: Uint8Array;
  /** 흐름 방향(0 ~ 7, NO_RECEIVER) */
  readonly receiverDir: Uint8Array;
  /** 호수 수면(게임 m). 호수 칸만 뜻이 있다 */
  readonly lakeSurfaceM: Int16Array;
  /** 웅덩이 종류(generator CELL_OPEN·CELL_LAKE·CELL_FILLED·CELL_DRY) */
  readonly basinKind: Uint8Array;
}

/** 생성 결과(runPlanetGenerator)의 받는 칸 번호(−1 = 바다) → 8이웃 번호 */
export function receiverDirections(faceLevel: number, receiver: Int32Array): Uint8Array {
  const n = cellsPerSide(faceLevel);
  const out = new Uint8Array(receiver.length).fill(NO_RECEIVER);
  for (let c = 0; c < receiver.length; c++) {
    const target = receiver[c] ?? -1;
    if (target < 0) continue;
    const face = FACES[Math.floor(c / (n * n))] ?? 0;
    const j = Math.floor((c - face * n * n) / n);
    const i = c - face * n * n - j * n;
    for (let k = 0; k < 8; k++) {
      const next = wrapFaceIJ(face, faceLevel, i + (NEIGHBOR_DI[k] ?? 0), j + (NEIGHBOR_DJ[k] ?? 0));
      if (next && next.face * n * n + next.j * n + next.i === target) {
        out[c] = k;
        break;
      }
    }
  }
  return out;
}

/** 생성 결과 → 2차맵 입력 */
export function planetValuesFromGeneration(
  fields: PlanetFields,
  details: {
    readonly receiver: Int32Array;
    readonly basinKind: Uint8Array;
    readonly lakeSurfaceM: Int16Array;
  },
  biomeIds: readonly string[],
): PlanetValues {
  const { faceLevel, seed } = fields.meta;
  return {
    faceLevel,
    seed,
    biomeIds,
    elevationM: fields.elevationM,
    biome: fields.biome,
    temperatureC: fields.temperatureC,
    precipitationMm: fields.precipitationMm,
    humidity: fields.humidity,
    water: fields.water,
    river: fields.river,
    forest: fields.forest,
    receiverDir: receiverDirections(faceLevel, details.receiver),
    lakeSurfaceM: details.lakeSurfaceM,
    basinKind: details.basinKind,
  };
}

// ── 행성 값 파일 ──

/** 보이는 ASCII 글자만인가(바이옴 ID는 snake_case라 늘 맞다) */
function isPrintableAscii(text: string): boolean {
  for (let k = 0; k < text.length; k++) {
    const code = text.charCodeAt(k);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

/** 파일 형식 판(모양이 바뀌면 올린다) */
export const PLANET_VALUES_FORMAT = 1;
const MAGIC = [0x54, 0x43, 0x50, 0x56] as const; // "TCPV"
const HEADER_BYTES = 16;

/** 칸 하나의 바이트 수: 고도 2 + 바이옴 1 + 기온 1 + 강수 2 + 습도 1 + 물 1 + 하천 1 + 숲 1 + 흐름 1 + 호수 2 + 웅덩이 1 */
export const PLANET_VALUES_BYTES_PER_CELL = 14;

/**
 * 행성 값 → 파일 바이트. 머리 16바이트(마법·형식 판·면 레벨·바이옴 수·시드) + 바이옴 ID(글자 수 u8 + ASCII) + 배열.
 * 배열 차례: 고도 i16, 기온 i8, 강수 u16, 호수 수면 i16, 바이옴·습도·물·하천·숲·흐름·웅덩이 u8.
 */
export function encodePlanetValues(values: PlanetValues): Uint8Array {
  const count = 6 * cellsPerSide(values.faceLevel) * cellsPerSide(values.faceLevel);
  const idBytes = values.biomeIds.reduce((sum, id) => sum + 1 + id.length, 0);
  const total = HEADER_BYTES + idBytes + count * PLANET_VALUES_BYTES_PER_CELL;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  MAGIC.forEach((byte, index) => view.setUint8(index, byte));
  view.setUint16(4, PLANET_VALUES_FORMAT, true);
  view.setUint8(6, values.faceLevel);
  view.setUint8(7, values.biomeIds.length);
  view.setUint32(8, values.seed >>> 0, true);
  view.setUint32(12, count, true);
  let at = HEADER_BYTES;
  for (const id of values.biomeIds) {
    if (id.length > 255 || !isPrintableAscii(id)) {
      throw new RangeError(`biome id must be short printable ASCII: ${id}`);
    }
    view.setUint8(at++, id.length);
    for (let k = 0; k < id.length; k++) view.setUint8(at++, id.charCodeAt(k));
  }
  for (let c = 0; c < count; c++, at += 2) view.setInt16(at, values.elevationM[c] ?? 0, true);
  for (let c = 0; c < count; c++, at += 1) view.setInt8(at, values.temperatureC[c] ?? 0);
  for (let c = 0; c < count; c++, at += 2) view.setUint16(at, values.precipitationMm[c] ?? 0, true);
  for (let c = 0; c < count; c++, at += 2) view.setInt16(at, values.lakeSurfaceM[c] ?? 0, true);
  for (const array of [
    values.biome,
    values.humidity,
    values.water,
    values.river,
    values.forest,
    values.receiverDir,
    values.basinKind,
  ]) {
    out.set(array.subarray(0, count), at);
    at += count;
  }
  return out;
}

/** 파일 머리(마법·형식 판·면 레벨·시드·칸 수·바이옴 표)와 배열이 시작하는 자리. 틀리면 RangeError */
function readHeader(bytes: Uint8Array) {
  const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < HEADER_BYTES || MAGIC.some((byte, index) => data[index] !== byte)) {
    throw new RangeError("not a planet values file");
  }
  const format = view.getUint16(4, true);
  if (format !== PLANET_VALUES_FORMAT) throw new RangeError(`unsupported planet values format: ${format}`);
  const faceLevel = view.getUint8(6);
  const biomeCount = view.getUint8(7);
  const seed = view.getUint32(8, true);
  const count = view.getUint32(12, true);
  const n = cellsPerSide(faceLevel);
  if (count !== 6 * n * n) throw new RangeError(`cell count ${count} does not match face level ${faceLevel}`);
  let at = HEADER_BYTES;
  const biomeIds: string[] = [];
  for (let b = 0; b < biomeCount; b++) {
    const length = view.getUint8(at++);
    biomeIds.push(String.fromCharCode(...data.subarray(at, at + length)));
    at += length;
  }
  if (data.length !== at + count * PLANET_VALUES_BYTES_PER_CELL)
    throw new RangeError("planet values length mismatch");
  return { data, view, faceLevel, seed, count, biomeIds, at };
}

/** 칸 하나의 값(파일에서 바로 읽은 것) */
export interface PlanetValuesCell {
  readonly faceLevel: number;
  readonly biomeId: string | null;
  readonly elevationM: number;
  readonly temperatureC: number;
  readonly precipitationMm: number;
  readonly humidity: number;
  readonly water: number;
  readonly river: number;
  readonly forest: number;
}

/** 파일에서 칸을 여럿 읽는 읽개 — 머리(바이옴 표)를 한 번만 푼다(자원 분포 지도처럼 칸 전체를 훑을 때) */
export interface PlanetValuesReader {
  readonly faceLevel: number;
  /** 칸 수(6 × n²) */
  readonly count: number;
  /** 칸 하나(배열 번호 = 면 × n² + j × n + i). 범위 밖이면 RangeError */
  cell(index: number): PlanetValuesCell;
}

/** 행성 값 파일 → 칸 읽개(전체를 풀지 않는다). 파일이 틀리면 RangeError */
export function planetValuesReader(bytes: Uint8Array): PlanetValuesReader {
  const { data, view, faceLevel, count, biomeIds, at } = readHeader(bytes);
  // 배열 차례: 고도 i16, 기온 i8, 강수 u16, 호수 수면 i16, 바이옴·습도·물·하천·숲·흐름·웅덩이 u8
  const elevationAt = at;
  const temperatureAt = elevationAt + count * 2;
  const precipitationAt = temperatureAt + count;
  const lakeAt = precipitationAt + count * 2;
  const bytesAt = lakeAt + count * 2;
  return {
    faceLevel,
    count,
    cell(index) {
      if (!Number.isInteger(index) || index < 0 || index >= count)
        throw new RangeError(`cell ${index} is outside the planet`);
      const u8 = (k: number): number => data[bytesAt + k * count + index] ?? 0;
      return {
        faceLevel,
        biomeId: biomeIds[u8(0)] ?? null,
        elevationM: view.getInt16(elevationAt + index * 2, true),
        temperatureC: view.getInt8(temperatureAt + index),
        precipitationMm: view.getUint16(precipitationAt + index * 2, true),
        humidity: u8(1),
        water: u8(2),
        river: u8(3),
        forest: u8(4),
      };
    },
  };
}

/**
 * 파일에서 칸 하나(배열 번호 = 면 × n² + j × n + i)의 값만 읽는다. 전체를 풀지 않는다(서버가 행성 값 22MB를 한 벌 더 만들지 않게,
 * 개발자 2차맵 시험). 번호가 범위 밖이면 RangeError
 */
export function readPlanetValuesCell(bytes: Uint8Array, cell: number): PlanetValuesCell {
  return planetValuesReader(bytes).cell(cell);
}

/** 파일 바이트 → 행성 값. 마법·형식 판·길이가 틀리면 RangeError */
export function decodePlanetValues(bytes: Uint8Array): PlanetValues {
  const header = readHeader(bytes);
  const { data, view, faceLevel, seed, count, biomeIds } = header;
  let { at } = header;
  const elevationM = new Int16Array(count);
  for (let c = 0; c < count; c++, at += 2) elevationM[c] = view.getInt16(at, true);
  const temperatureC = new Int8Array(count);
  for (let c = 0; c < count; c++, at += 1) temperatureC[c] = view.getInt8(at);
  const precipitationMm = new Uint16Array(count);
  for (let c = 0; c < count; c++, at += 2) precipitationMm[c] = view.getUint16(at, true);
  const lakeSurfaceM = new Int16Array(count);
  for (let c = 0; c < count; c++, at += 2) lakeSurfaceM[c] = view.getInt16(at, true);
  const bytesAt = (): Uint8Array => {
    const array = data.slice(at, at + count);
    at += count;
    return array;
  };
  const biome = bytesAt();
  const humidity = bytesAt();
  const water = bytesAt();
  const river = bytesAt();
  const forest = bytesAt();
  const receiverDir = bytesAt();
  const basinKind = bytesAt();
  return {
    faceLevel,
    seed,
    biomeIds,
    elevationM,
    biome,
    temperatureC,
    precipitationMm,
    humidity,
    water,
    river,
    forest,
    receiverDir,
    lakeSurfaceM,
    basinKind,
  };
}
