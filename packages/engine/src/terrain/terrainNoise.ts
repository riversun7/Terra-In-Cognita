// 2차맵 지형 재질의 잡음 텍스처 자료 — 순수 함수. three.js를 쓰지 않는다(단위 테스트가 가져온다).
// 이어 붙는(타일) 부드러운 잡음 4채널(RGBA8 256×256), 채널끼리 서로 다르다. 경계 흔들기·잔결에 쓴다(terrainMaterial.ts).
// 만드는 법: 흰 잡음(텍셀 번호의 정수 해시 lowbias32)을 상자 흐림으로 가로·세로 세 번씩 흐린다(가우스에 가깝다, σ ≈ 3.5텍셀).
// 가장자리는 반대쪽으로 감싸서 흐려 오른쪽 끝 다음이 왼쪽 끝과 이어진다(RepeatWrapping으로 무늬가 끊기지 않는다).
// 격자 잡음(값 잡음)과 달리 격자 방향 무늬가 없다(값 잡음을 돌려 읽으면 비스듬한 줄무늬가 보였다).
// 정수 연산(Math.imul)·사칙연산·Math.sqrt·Math.round만 쓴다: 기기·브라우저가 달라도 같은 바이트(같은 그림)다.
// 지형 워커가 처음 한 번 만들고 terrainBuilder.ts가 들고 있는다(개발 컨테이너 약 10ms, 처음 부를 때는 수십 ms).
// 화면 그림용이라 판정 코드의 시드 난수(createRng)를 쓰지 않는다(닫힘 함수 부르기가 이 크기에서 느렸다).
import { toByte } from "./terrainTextures.ts";

/** 잡음 텍스처 한 변(텍셀) */
export const NOISE_TEXTURE_SIZE = 256;
/** 무늬 하나(밝은 곳 하나)의 크기(텍셀, 약) — 한 줄에서 평균을 건너는 점 사이가 약 16텍셀(재어 봄)의 반 */
export const NOISE_FEATURE_TEXELS = 8;
/** 한 장(이어 붙는 단위)에 든 무늬 수(한 변). 셰이더는 "무늬 하나 = S m"가 되게 좌표를 1 / (S × 이 값)배 한다 */
export const NOISE_TILE_FEATURES = NOISE_TEXTURE_SIZE / NOISE_FEATURE_TEXELS;
/** 흐린 뒤 값의 표준편차(0~1 단위). 0.5 ± 0.18 — 바이트 범위를 넘어 잘리는 값(±2.8σ 밖)은 0.5% 남짓 */
export const NOISE_STD = 0.18;
/** 잡음 시드(그림을 바꾸려면 이 값을 바꾼다) */
const NOISE_SEED = 0x5ea2d17b;
/** 상자 흐림 반지름(텍셀, 폭 7)과 횟수 */
const BOX_RADIUS = 3;
const BOX_PASSES = 3;

/** 32비트 정수 해시(lowbias32, Chris Wellons) — 고른 흰 잡음 */
function hash32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** 감싸기 가리개(한 변이 2의 거듭제곱이라 나머지 대신 비트 AND) */
const WRAP = NOISE_TEXTURE_SIZE - 1;

/**
 * 한 줄(가로) 또는 한 열(세로)을 감싸며 상자 흐림한다. start = 첫 칸 번호, step = 다음 칸까지(가로 1, 세로 한 변).
 * 창 [i − r, i + r]의 합을 밀며 고친다(칸마다 더하기 하나·빼기 하나)
 */
function boxBlurLine(source: Float64Array, target: Float64Array, start: number, step: number): void {
  const width = 2 * BOX_RADIUS + 1;
  let sum = 0;
  for (let k = -BOX_RADIUS; k <= BOX_RADIUS; k++) sum += source[start + (k & WRAP) * step] ?? 0;
  for (let i = 0; i <= WRAP; i++) {
    target[start + i * step] = sum / width;
    const entering = source[start + ((i + BOX_RADIUS + 1) & WRAP) * step] ?? 0;
    const leaving = source[start + ((i - BOX_RADIUS) & WRAP) * step] ?? 0;
    sum += entering - leaving;
  }
}

/** 이어 붙는 부드러운 잡음 4채널(RGBA8, 256×256). 채널마다 평균 0.5, 표준편차 NOISE_STD로 맞춘다 */
export function buildNoiseTextureData(seed: number = NOISE_SEED): Uint8Array {
  const size = NOISE_TEXTURE_SIZE;
  const count = size * size;
  const data = new Uint8Array(count * 4);
  let field = new Float64Array(count);
  let scratch = new Float64Array(count);
  for (let channel = 0; channel < 4; channel++) {
    const channelSeed = hash32(seed + channel);
    for (let i = 0; i < count; i++) field[i] = hash32(Math.imul(i, 0x9e3779b1) ^ channelSeed) / 0x1_0000_0000;
    for (let pass = 0; pass < BOX_PASSES; pass++) {
      for (let y = 0; y < size; y++) boxBlurLine(field, scratch, y * size, 1);
      [field, scratch] = [scratch, field];
      for (let x = 0; x < size; x++) boxBlurLine(field, scratch, x, size);
      [field, scratch] = [scratch, field];
    }
    let mean = 0;
    for (let i = 0; i < count; i++) mean += field[i] ?? 0;
    mean /= count;
    let variance = 0;
    for (let i = 0; i < count; i++) {
      const d = (field[i] ?? 0) - mean;
      variance += d * d;
    }
    const scale = NOISE_STD / Math.sqrt(variance / count);
    for (let i = 0; i < count; i++) data[i * 4 + channel] = toByte(0.5 + ((field[i] ?? 0) - mean) * scale);
  }
  return data;
}
