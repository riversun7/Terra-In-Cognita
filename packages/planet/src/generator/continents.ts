// 대륙 배치(ADR 2026-10-31-continent-layouts) — 정의에 대륙 배치(continents)가 있을 때 대륙성 값을 정한다(tectonics.ts).
// 없으면 이 파일을 쓰지 않는다: 대륙성 = 1판 노이즈 + 판 치우침(출력 판 3 그대로).
// - 큰 땅덩어리(대륙) N개와 작은 조각(섬·미소 대륙)을 꽃잎(타원) 몇 개의 합집합으로 만든다(꽃잎 모양은
//   continentShapes.ts). 대륙성 = max(덩어리 값) + 잔 노이즈(경계를 앞뒤로 옮긴다). 대륙성의 면적 백분위로 대륙 지각을
//   정하는 것(tectonics.ts)은 노이즈 배치와 같다.
// - 큰 모양 흔들기: 점을 낮은 주파수 벡터 노이즈만큼 옮겨 잰다(굽은 대륙·만). 모든 덩어리가 같은 흔들기다.
// - 대륙 하나의 넓이를 목표 넓이(대륙 지각 몫 × 크기 비율)에 맞추고, 대륙 사이에 바다 틈(꽃잎끼리 잰다)을 두고 놓는다.
//   작은 조각은 대륙 지각의 0.8% 아래라 큰 땅덩어리(땅의 3% 이상)로 세지 않는다.
// - 배치 종류: 초대륙(초승달 모양 한 덩어리, 수가 2 이상이면 좁은 바다로 갈라진 덩어리들), 지구형(크기가 다른 대륙이
//   흩어짐), 여러 대륙·군도(비슷한 크기, 섬 많음), 한쪽 반구(대륙이 한 극 둘레에 모임).
// - 정육면체 꼭짓점: 배치를 무작위로 돌린 128개 중 꼭짓점 8곳이 가장 바다 쪽인 것(노이즈 배치의 회전 고르기와 같은
//   생각). 칸은 배치 좌표(q = 회전의 역 × 칸 중심)로 재므로 회전 고르기와 칸 값이 같은 함수다.
// - 판 닻: 대륙 가운데(큰 대륙·초대륙은 몇 곳)를 판 구조에 넘겨 대륙이 제 판에 실리게 한다(plates.ts anchorPlates).
// 거리는 구 위 각도·현 길이로 해상도와 무관하다. 계산은 사칙연산·Math.sqrt와 @terra/shared 결정적 근사만 쓴다.
import { type ContinentLayout, type ContinentLayoutKind, createRng, detCos } from "@terra/shared";
import { CUBE_CORNERS } from "../corners.ts";
import {
  FIELD_FLOOR,
  LOBE_MAX_RADIUS,
  LOBE_STRIDE,
  type LobeFrame,
  type LocalLobe,
  type Rng,
  type Vec3,
  angleBetween,
  continentLobes,
  crescentLobes,
  cross,
  dot,
  fitScale,
  fragmentLobes,
  intBetween,
  lobeAt,
  lobeReachAngle,
  lobesExtent,
  normalize,
  placeLobe,
  pointInCap,
  radiusOfShare,
  randomTangent,
  smoothMax,
  writeLobe,
} from "./continentShapes.ts";
import { NOISE_JITTER, type NoiseSetup, amplitudeSum, fbm3, octavesFor, offsetFbm3 } from "./noise.ts";
import { randomRotation } from "./plates.ts";
import {
  STREAM_CONTINENT_LAYOUT,
  STREAM_CONTINENT_ROTATION,
  randomUnitVector,
  streamRng,
  streamSeed,
  uniform,
  unitFloat,
} from "./random.ts";
import { km } from "./util.ts";

/**
 * 잔 노이즈: 주파수 3(격자 약 2,100km)에서 4옥타브까지(해상도에 맞게, 가장 잔 격자 약 260km. 더 잔 해안은 해안선
 * 흔들기 landforms.ts 몫), 경계를 대륙 크기에 비례해 앞뒤로 옮긴다
 */
const DETAIL_NOISE: NoiseSetup = {
  name: "continent detail",
  frequency: 3,
  octaves: 4,
  gain: 0.5,
  jitter: NOISE_JITTER,
  kind: "fbm",
};
/** 잔 노이즈 세기(노이즈 값 그대로에 곱한다. 노이즈 표준편차 약 0.18이면 꽃잎 값으로 약 0.08) */
const DETAIL_AMOUNT = 0.45;
/**
 * 먼 바다: 꽃잎 모양 값이 이보다 낮으면 잔 노이즈를 재지 않는다(F9에서 칸마다 노이즈 7번을 아낀다). 잔 노이즈는 ±0.3
 * 안이라 그런 칸은 노이즈가 있어도 대륙 지각(문턱 약 0)이 못 되고, 판 끌림(plates.ts, 대륙성 −0.3에서 다 참)도 같다
 */
const DEEP_OCEAN = -0.6;
/** 이 파일의 노이즈 2판 설정(반복 검사 "노이즈 격자점"이 잰다) */
export const CONTINENT_NOISES: readonly NoiseSetup[] = [DETAIL_NOISE];
/**
 * 큰 모양 흔들기: 1판 fBm 세 개(주파수 1.6, 2옥타브, 판 흔들기와 같은 종류)를 벡터로 써서 점을 이 값 × 노이즈
 * (표준편차 약 0.15)만큼 옮긴 뒤 꽃잎을 잰다. 모든 덩어리가 같은 흔들기라 배치 전체를 한 번 휘는 것과 같다. 배율이 작아 공간이
 * 접히지 않으므로(노이즈 기울기 × 배율 < 1) 대륙 사이 바다는 늘거나 줄 뿐 메워지지 않는다. 세게 휘면(0.5) 공간이 접혀
 * 대륙이 이어지거나 팔이 떨어져 나갔고, 1옥타브로 줄이면 대륙 수가 어긋나는 경우가 3 → 9번(F6, 배치 넷 × 대륙 수 일곱 ×
 * 시드 여덟 = 224번 중)으로 늘었다(2026-10-31)
 */
const WARP_FREQUENCY = 1.6;
const WARP_OCTAVES = 2;
const WARP_AMOUNT = 0.3;
/** 회전 고르기: 꼭짓점의 대륙성이 이 값만큼 바다 쪽(−)이면 벌점이 없다(해안에서 조금 떨어지게) */
const CORNER_MARGIN = 0.3;
/** 회전 후보 수(0번은 회전 없음) */
const ROTATION_CANDIDATES = 128;
/**
 * 덩어리 사이 바다 틈(꽃잎끼리 잰다): 기본 + 두 꽃잎 반경 합의 몫. 잔 노이즈가 경계를 꽃잎 반경의 약 20%까지, 흔들기가
 * 틈을 약 30%까지 옮긴다. 꽃잎 반경에는 부드러운 최댓값이 넓히는 몫(LOBE_REACH)을 곱한다
 */
const GAP_BASE = km(450);
const GAP_SHARE = 0.18;
const LOBE_REACH = 1.12;
/** 작은 조각 하나의 넓이 상한(대륙 지각 몫 대비): 큰 땅덩어리 기준(땅의 3%)보다 충분히 작게 */
const FRAGMENT_MAX_SHARE = 0.008;
/** 조각과 다른 덩어리 사이 틈 배율(조각끼리 붙어 큰 땅덩어리가 되지 않게) */
const FRAGMENT_GAP_SCALE = 0.8;
/** 자리 고르기 시도 상한과, 틈을 만족한 후보가 나와도 더 보는 최소 횟수 */
const PLACE_TRIES = 256;
const PLACE_MIN_TRIES = 4;
/** 모아 놓기(초대륙·반구): 원 반경을 이만큼씩 넓히며 후보 PACK_TRIES개 중 틈을 만족하는 가장 가까운 자리 */
const PACK_STEP = 0.08;
const PACK_TRIES = 24;

/** 배치 종류마다의 값(S2 임시값) */
interface LayoutParams {
  /** 대륙 지각 중 작은 조각 몫 */
  readonly fragmentShare: number;
  /** 작은 조각 수 범위(양 끝 포함) */
  readonly fragments: readonly [number, number];
  /** 작은 조각 중 대륙 가까이(앞바다 섬) 두는 몫 */
  readonly offshore: number;
  /** 대륙 크기 비율: equal = 0.75~1.25 고르게, unequal = 1 ÷ (1 + 0.6k)(큰 것부터), mild = 1 ÷ (1 + 0.3k) (continentWeights) */
  readonly sizes: "equal" | "unequal" | "mild";
  /** 대륙 사이 틈 배율(초대륙·반구는 좁은 바다) */
  readonly gapScale: number;
  /** 자리: spread = 구 전체에 흩음, pack = 기준점 둘레에 모음 */
  readonly placement: "spread" | "pack";
}

const LAYOUT_PARAMS: { readonly [K in ContinentLayoutKind]: LayoutParams } = {
  supercontinent: {
    fragmentShare: 0.05,
    fragments: [4, 7],
    offshore: 0.7,
    sizes: "equal",
    gapScale: 0.45,
    placement: "pack",
  },
  earthlike: {
    fragmentShare: 0.07,
    fragments: [6, 10],
    offshore: 0.5,
    sizes: "unequal",
    gapScale: 1,
    placement: "spread",
  },
  scattered: {
    fragmentShare: 0.12,
    fragments: [14, 22],
    offshore: 0.35,
    sizes: "equal",
    gapScale: 1,
    placement: "spread",
  },
  hemisphere: {
    fragmentShare: 0.06,
    fragments: [5, 8],
    offshore: 0.6,
    sizes: "mild",
    gapScale: 0.5,
    placement: "pack",
  },
};
/** 판 닻을 둘 더 받는 큰 대륙: 대륙 지각의 이 몫 이상 */
const BIG_CONTINENT_SHARE = 0.25;
/** 한쪽 반구: 큰 바다 쪽(어디든)에 두는 먼바다 조각 몫. 나머지 먼바다 조각은 땅 반구(극에서 90° 안) */
const HEMISPHERE_OPEN_FRAGMENTS = 0.3;
const HEMISPHERE_FRAGMENT_RADIUS = 0.5 * Math.PI;

/** 덩어리(대륙·조각) 하나: 자기 좌표 꽃잎들과 넓이 배율, 놓인 자리 */
interface Mass {
  readonly lobes: readonly LocalLobe[];
  /** 넓이 맞추기 배율(각도에 곱한다) */
  readonly scale: number;
  /** 둘레 반경(라디안): 중심에서 가장 먼 꽃잎 끝 × LOBE_REACH */
  readonly extent: number;
  /** 꽃잎(자기 좌표, 배율 적용): 중심·긴 축·짧은 축과 틈 계산용 긴·짧은 반경(× LOBE_REACH) */
  readonly local: readonly LobeFrame[];
  readonly majors: readonly number[];
  readonly minors: readonly number[];
  centre: Vec3;
  /** 자기 좌표 x축(접평면 단위 벡터) */
  east: Vec3;
  /** 놓인 자리의 꽃잎 */
  placedLobes: LobeFrame[];
}

/** 자리 후보: 덩어리 중심과 자기 좌표 x축 */
interface Spot {
  readonly centre: Vec3;
  readonly east: Vec3;
}

/** 덩어리 배열 한 줄: 중심 3, 영향 끝 내적 하한, 꽃잎 시작·끝 */
const GROUP_STRIDE = 6;

/** 행성 하나의 대륙 배치(생성 중에만 쓴다). 좌표는 배치 좌표다(칸 중심 p → q = rotation의 전치 × p) */
export interface ContinentModel {
  readonly lobes: Float64Array;
  readonly groups: Float64Array;
  readonly groupCount: number;
  /** 배치 좌표 → 격자 좌표 회전(행 우선 3×3) */
  readonly rotation: Float64Array;
  /** 잔 노이즈·흔들기 시드 */
  readonly detailSeed: number;
  readonly warpSeed: number;
  /**
   * 판 닻(격자 좌표 단위 벡터, 큰 대륙부터): 대륙마다 가운데, 큰 대륙(대륙 지각의 25% 이상)은 가장 먼 꽃잎도, 초대륙(한
   * 덩어리)은 초승달의 양 끝과 가운데. 판 구조(tectonics.ts)가 가까운 판 중심을 여기로 옮겨 대륙이 제 판에 실리게 한다
   */
  readonly anchors: readonly (readonly [number, number, number])[];
}

/**
 * 대륙 크기 비율(합 1, 큰 것부터). unequal·mild는 k번째가 1 ÷ (1 + c·k)이고, 가장 작은 대륙이 가장 큰 대륙의 약 30%
 * (unequal)·45%(mild) 아래로 내려가지 않게 c를 대륙 수에 맞춘다(대륙이 많아도 가장 작은 것이 큰 땅덩어리로 남게)
 */
function continentWeights(rng: Rng, count: number, sizes: LayoutParams["sizes"]): number[] {
  const raw: number[] = [];
  const steps = Math.max(1, count - 1);
  const decay = sizes === "unequal" ? Math.min(0.6, 2.4 / steps) : Math.min(0.3, 1.2 / steps);
  for (let k = 0; k < count; k++) {
    if (sizes === "equal") raw.push(uniform(rng, 0.75, 1.25));
    else raw.push(uniform(rng, 0.85, 1.15) / (1 + decay * k));
  }
  raw.sort((a, b) => b - a);
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

/** 자기 좌표 점 → 자리(중심·x축)의 점 */
function toSpot(spot: Spot, local: Vec3): Vec3 {
  const { centre, east } = spot;
  const north = cross(centre, east);
  return [
    east[0] * local[0] + north[0] * local[1] + centre[0] * local[2],
    east[1] * local[0] + north[1] * local[1] + centre[1] * local[2],
    east[2] * local[0] + north[2] * local[1] + centre[2] * local[2],
  ];
}

/** 꽃잎 틀을 자리로 옮긴다 */
const frameAt = (spot: Spot, frame: LobeFrame): LobeFrame => ({
  c: toSpot(spot, frame.c),
  u: toSpot(spot, frame.u),
  v: toSpot(spot, frame.v),
});

/** 꽃잎(긴 반경 a, 짧은 반경 b)의 toward 쪽 반경: 중심에서 본 그 방향의 타원 반경 */
function radiusToward(frame: LobeFrame, a: number, b: number, toward: Vec3): number {
  const tu = dot(toward, frame.u);
  const tv = dot(toward, frame.v);
  const n2 = tu * tu + tv * tv;
  if (n2 < 1e-18) return a;
  return 1 / Math.sqrt((tu * tu) / (a * a * n2) + (tv * tv) / (b * b * n2));
}

/**
 * 덩어리를 자리에 놓았을 때 놓인 덩어리들과의 틈(라디안, 음수면 겹침): 꽃잎 쌍마다 (중심 사이 각도 − 서로를 향한 타원
 * 반경 둘 − 요구 틈)의 최솟값. 둘레끼리 멀면(둘레 원으로 잰 틈이 양수) 그 값으로 줄인다(꽃잎으로 재면 더 넓다)
 */
function clearance(mass: Mass, spot: Spot, placed: readonly Mass[], gapScale: number): number {
  let worst = Number.POSITIVE_INFINITY;
  let frames: LobeFrame[] | undefined;
  for (const other of placed) {
    const far =
      angleBetween(spot.centre, other.centre) -
      mass.extent -
      other.extent -
      gapScale * (GAP_BASE + GAP_SHARE * (mass.extent + other.extent));
    if (far >= 0) {
      worst = Math.min(worst, far);
      continue;
    }
    frames ??= mass.local.map((frame) => frameAt(spot, frame));
    for (let i = 0; i < frames.length; i++) {
      const fa = frames[i];
      if (!fa) continue;
      for (let j = 0; j < other.placedLobes.length; j++) {
        const fb = other.placedLobes[j];
        if (!fb) continue;
        const ra = radiusToward(fa, mass.majors[i] ?? 0, mass.minors[i] ?? 0, fb.c);
        const rb = radiusToward(fb, other.majors[j] ?? 0, other.minors[j] ?? 0, fa.c);
        const room = angleBetween(fa.c, fb.c) - ra - rb - gapScale * (GAP_BASE + GAP_SHARE * (ra + rb));
        worst = Math.min(worst, room);
      }
    }
  }
  return worst;
}

/** 덩어리를 자리에 놓는다 */
function settle(mass: Mass, spot: Spot): void {
  mass.centre = spot.centre;
  mass.east = spot.east;
  mass.placedLobes = mass.local.map((frame) => frameAt(spot, frame));
}

/** 중심 후보 → 자리 후보(x축은 무작위) */
const spotAt = (rng: Rng, centre: Vec3): Spot => ({ centre, east: randomTangent(rng, centre) });

/**
 * 흩어 놓기: 후보 중 틈이 가장 넓은 것. 틈을 만족한 후보가 나오면 PLACE_MIN_TRIES번은 보고 멈춘다(너무 고르게 퍼지지
 * 않게). 끝까지 못 찾으면 가장 나은 것(겹치면 대륙이 이어진다: 육지 비율이 아주 클 때)
 */
function spreadPlace(
  rng: Rng,
  mass: Mass,
  placed: readonly Mass[],
  gapScale: number,
  candidate: () => Vec3,
): Spot {
  let best = spotAt(rng, candidate());
  let bestRoom = clearance(mass, best, placed, gapScale);
  for (let tries = 1; tries < PLACE_TRIES; tries++) {
    if (tries >= PLACE_MIN_TRIES && bestRoom >= 0) break;
    const next = spotAt(rng, candidate());
    const room = clearance(mass, next, placed, gapScale);
    if (room > bestRoom) {
      best = next;
      bestRoom = room;
    }
  }
  return best;
}

/**
 * 모아 놓기: 기준점(anchor) 둘레 원을 PACK_STEP씩 넓히며 후보 PACK_TRIES개 중 틈을 만족하고 기준점에 가장 가까운 것.
 * 원이 구 전체가 될 때까지 못 찾으면 틈이 가장 넓은 것
 */
function packPlace(rng: Rng, mass: Mass, placed: readonly Mass[], gapScale: number, anchor: Vec3): Spot {
  const first = spotAt(rng, anchor);
  if (placed.length === 0) return first;
  let fallback = first;
  let fallbackRoom = clearance(mass, first, placed, gapScale);
  for (let radius = PACK_STEP; radius < Math.PI + PACK_STEP; radius += PACK_STEP) {
    let best: Spot | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let tries = 0; tries < PACK_TRIES; tries++) {
      const next = spotAt(rng, pointInCap(rng, anchor, radius));
      const room = clearance(mass, next, placed, gapScale);
      if (room > fallbackRoom) {
        fallback = next;
        fallbackRoom = room;
      }
      if (room < 0) continue;
      const distance = angleBetween(next.centre, anchor);
      if (distance < bestDistance) {
        best = next;
        bestDistance = distance;
      }
    }
    if (best) return best;
  }
  return fallback;
}

/** 덩어리 하나를 만든다(자기 좌표, 넓이 맞추기 배율) */
function makeMass(lobes: readonly LocalLobe[], scale: number): Mass {
  const local = lobes.map((lobe): LobeFrame => {
    const placed = placeLobe(lobe, scale, [0, 0, 1], [1, 0, 0]);
    return { c: placed.c, u: placed.u, v: placed.v };
  });
  return {
    lobes,
    scale,
    extent: LOBE_REACH * lobesExtent(lobes, scale),
    local,
    majors: lobes.map((lobe) => LOBE_REACH * Math.min(LOBE_MAX_RADIUS, lobe.major * scale)),
    minors: lobes.map((lobe) => LOBE_REACH * Math.min(LOBE_MAX_RADIUS, lobe.minor * scale)),
    centre: [0, 0, 1],
    east: [1, 0, 0],
    placedLobes: [],
  };
}

/**
 * 대륙 배치 만들기. crustShare = 대륙 지각 몫(육지 + 대륙붕, 0~1). 같은 시드·배치·몫이면 같은 결과(면 레벨과 무관)
 */
export function buildContinentModel(
  seed: number,
  layout: ContinentLayout,
  crustShare: number,
): ContinentModel {
  const rng = streamRng(seed, STREAM_CONTINENT_LAYOUT);
  const params = LAYOUT_PARAMS[layout.layout];
  const count = layout.count;
  const fragmentCount = intBetween(rng, params.fragments[0], params.fragments[1]);
  const majorShare = crustShare * (1 - params.fragmentShare);
  const weights = continentWeights(rng, count, params.sizes);
  const areaRng = createRng(streamSeed(seed, STREAM_CONTINENT_LAYOUT) ^ 0x5f3759df);

  // ── 대륙 모양(자기 좌표)과 넓이 맞추기 ──
  const majors: Mass[] = weights.map((weight) => {
    const share = majorShare * weight;
    const radius = radiusOfShare(share);
    const lobes =
      layout.layout === "supercontinent" && count === 1
        ? crescentLobes(rng, radius, intBetween(rng, 6, 8))
        : continentLobes(rng, radius, share > 0.08 ? intBetween(rng, 4, 6) : intBetween(rng, 2, 4));
    return makeMass(lobes, fitScale(areaRng, lobes, share));
  });

  // ── 대륙 자리: 흩거나(지구형·군도) 북극 둘레에 모은다(초대륙·반구. 첫 덩어리는 북극) ──
  const placed: Mass[] = [];
  for (const mass of majors) {
    const spot =
      params.placement === "pack"
        ? packPlace(rng, mass, placed, params.gapScale, [0, 0, 1])
        : spreadPlace(rng, mass, placed, params.gapScale, () => randomUnitVector(rng));
    settle(mass, spot);
    placed.push(mass);
  }

  // ── 작은 조각(섬·미소 대륙): 앞바다(대륙 둘레 바로 밖) 또는 먼바다 ──
  const fragmentTotal = crustShare * params.fragmentShare;
  for (let k = 0; k < fragmentCount; k++) {
    const share = Math.min(
      FRAGMENT_MAX_SHARE * crustShare,
      (fragmentTotal / fragmentCount) * uniform(rng, 0.5, 1.5),
    );
    const mass = makeMass(fragmentLobes(rng, share), 1);
    const offshore = unitFloat(rng) < params.offshore;
    const open = unitFloat(rng) < HEMISPHERE_OPEN_FRAGMENTS;
    const candidate = (): Vec3 => {
      if (offshore) {
        // 대륙 하나를 넓이 비례로 고르고 그 둘레 바로 밖에
        let pick = unitFloat(rng);
        let host = majors[0];
        for (let j = 0; j < majors.length; j++) {
          host = majors[j];
          pick -= weights[j] ?? 0;
          if (pick < 0) break;
        }
        const anchor = host ?? majors[0];
        if (anchor) return pointInCap(rng, anchor.centre, anchor.extent + mass.extent + 2 * GAP_BASE);
      }
      if (layout.layout === "hemisphere" && !open)
        return pointInCap(rng, [0, 0, 1], HEMISPHERE_FRAGMENT_RADIUS);
      return randomUnitVector(rng);
    };
    settle(mass, spreadPlace(rng, mass, placed, FRAGMENT_GAP_SCALE, candidate));
    placed.push(mass);
  }

  // ── 배열로 ──
  const lobeTotal = placed.reduce((sum, mass) => sum + mass.lobes.length, 0);
  const lobes = new Float64Array(lobeTotal * LOBE_STRIDE);
  const groups = new Float64Array(placed.length * GROUP_STRIDE);
  let index = 0;
  placed.forEach((mass, g) => {
    const start = index;
    // 영향 끝: 꽃잎마다 (덩어리 중심에서 꽃잎 중심까지 + 꽃잎 바닥까지 각도)의 최댓값. 그 밖은 모든 꽃잎이 바닥이다
    let reach = 0;
    for (const lobe of mass.lobes) {
      const placedLobe = placeLobe(lobe, mass.scale, mass.centre, mass.east);
      writeLobe(lobes, index++, placedLobe);
      reach = Math.max(
        reach,
        angleBetween(mass.centre, placedLobe.c) + lobeReachAngle(placedLobe.majorChord),
      );
    }
    groups.set([...mass.centre, reach >= Math.PI ? -2 : detCos(reach), start, index], g * GROUP_STRIDE);
  });
  const layoutSeed = streamSeed(seed, STREAM_CONTINENT_LAYOUT);
  const model: ContinentModel = {
    lobes,
    groups,
    groupCount: placed.length,
    rotation: Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1),
    detailSeed: layoutSeed + 1,
    warpSeed: layoutSeed + 2,
    anchors: [],
  };
  const rotation = chooseLayoutRotation(seed, model);
  const crescent = layout.layout === "supercontinent" && count === 1;
  const anchors: Vec3[] = [];
  majors.forEach((mass, k) => {
    const lobeCentres = mass.placedLobes.map((frame) => frame.c);
    if (crescent) {
      const last = lobeCentres.length - 1;
      for (const at of [0, Math.floor(last / 2), last]) anchors.push(lobeCentres[at] ?? mass.centre);
      return;
    }
    anchors.push(lobeCentres[0] ?? mass.centre);
    if ((weights[k] ?? 0) * (1 - params.fragmentShare) >= BIG_CONTINENT_SHARE) {
      // 가운데에서 가장 먼 꽃잎
      let far = lobeCentres[0] ?? mass.centre;
      let farthest = -1;
      for (const centre of lobeCentres) {
        const distance = angleBetween(centre, mass.centre);
        if (distance > farthest) {
          farthest = distance;
          far = centre;
        }
      }
      anchors.push(far);
    }
  });
  const placedModel: ContinentModel = { ...model, rotation };
  return { ...placedModel, anchors: anchors.map((anchor) => layoutToGrid(placedModel, anchor)) };
}

/**
 * 배치 좌표의 점(흔들기 뒤 꽃잎 자리) → 격자 좌표: 흔들기를 한 번 되돌린 뒤(q − 배율 × 흔들기(q)) 회전한다. 흔들기가
 * 작아 한 번이면 꽃잎 중심 근처에 온다
 */
function layoutToGrid(model: ContinentModel, point: Vec3): [number, number, number] {
  warpVector(model, point[0], point[1], point[2], warp);
  const q = normalize([
    point[0] - WARP_AMOUNT * (warp[0] ?? 0),
    point[1] - WARP_AMOUNT * (warp[1] ?? 0),
    point[2] - WARP_AMOUNT * (warp[2] ?? 0),
  ]);
  const r = model.rotation;
  return [
    (r[0] ?? 0) * q[0] + (r[1] ?? 0) * q[1] + (r[2] ?? 0) * q[2],
    (r[3] ?? 0) * q[0] + (r[4] ?? 0) * q[1] + (r[5] ?? 0) * q[2],
    (r[6] ?? 0) * q[0] + (r[7] ?? 0) * q[1] + (r[8] ?? 0) * q[2],
  ];
}

/** 흔들기 벡터(배치 좌표 q에서, 노이즈 단위)를 out에 */
function warpVector(model: ContinentModel, x: number, y: number, z: number, out: Float64Array): void {
  const seed = model.warpSeed;
  out[0] = fbm3(seed, x, y, z, WARP_FREQUENCY, WARP_OCTAVES, 0.5);
  out[1] = fbm3(seed + 1, x, y, z, WARP_FREQUENCY, WARP_OCTAVES, 0.5);
  out[2] = fbm3(seed + 2, x, y, z, WARP_FREQUENCY, WARP_OCTAVES, 0.5);
}

/** 흔들기 벡터 임시 칸(한 스레드 안에서만 쓴다) */
const warp = new Float64Array(3);

/** 꽃잎 모양 값(배치 좌표 q, 잔 노이즈 전): 흔든 점에서 max(바닥, 덩어리마다 꽃잎 값의 부드러운 최댓값) */
function shapeAt(model: ContinentModel, x: number, y: number, z: number): number {
  const { lobes, groups } = model;
  warpVector(model, x, y, z, warp);
  let qx = x + WARP_AMOUNT * (warp[0] ?? 0);
  let qy = y + WARP_AMOUNT * (warp[1] ?? 0);
  let qz = z + WARP_AMOUNT * (warp[2] ?? 0);
  const length = Math.sqrt(qx * qx + qy * qy + qz * qz);
  qx /= length;
  qy /= length;
  qz /= length;
  let best = FIELD_FLOOR;
  for (let g = 0; g < model.groupCount; g++) {
    const at = g * GROUP_STRIDE;
    if (
      qx * (groups[at] ?? 0) + qy * (groups[at + 1] ?? 0) + qz * (groups[at + 2] ?? 0) <
      (groups[at + 3] ?? 0)
    )
      continue;
    // 한 덩어리 안 꽃잎은 부드러운 최댓값으로 잇는다(꽃잎 사이 잘록한 곳을 메워 잔 노이즈가 대륙을 끊지 않게).
    // 덩어리끼리는 그냥 최댓값(떨어진 대륙은 떨어진 채로)
    const end = groups[at + 5] ?? 0;
    let group = FIELD_FLOOR;
    for (let k = groups[at + 4] ?? 0; k < end; k++)
      group = smoothMax(group, lobeAt(lobes, k * LOBE_STRIDE, qx, qy, qz));
    if (group > best) best = group;
  }
  return best;
}

/** 잔 노이즈 옥타브 수(해상도에 맞게) */
export function continentDetailOctaves(cellAngle: number): number {
  return octavesFor(DETAIL_NOISE.frequency, cellAngle, DETAIL_NOISE.octaves);
}

/** 배치 좌표에서 잰 대륙성(회전을 이미 푼 점) */
function valueInLayout(model: ContinentModel, x: number, y: number, z: number, octaves: number): number {
  const { frequency, gain, jitter } = DETAIL_NOISE;
  // 옥타브 합이 아니라 가장 많은 옥타브의 합으로 나눈다: 낮은 면 레벨은 잔 옥타브만 빠지고 낮은 옥타브 세기는 같다
  const shape = shapeAt(model, x, y, z);
  if (shape < DEEP_OCEAN) return shape;
  const scale = amplitudeSum(gain, octaves) / amplitudeSum(gain, DETAIL_NOISE.octaves);
  const noise = offsetFbm3(model.detailSeed, x, y, z, frequency, octaves, gain, jitter) * scale;
  return shape + DETAIL_AMOUNT * noise;
}

/**
 * 대륙성 값(격자 좌표 칸 중심 x·y·z) = 꽃잎 모양 + 잔 노이즈. octaves = continentDetailOctaves(칸 크기)
 */
export function continentValue(
  model: ContinentModel,
  x: number,
  y: number,
  z: number,
  octaves: number,
): number {
  const r = model.rotation;
  // 배치 좌표 = 회전의 전치 × 격자 좌표
  const qx = (r[0] ?? 0) * x + (r[3] ?? 0) * y + (r[6] ?? 0) * z;
  const qy = (r[1] ?? 0) * x + (r[4] ?? 0) * y + (r[7] ?? 0) * z;
  const qz = (r[2] ?? 0) * x + (r[5] ?? 0) * y + (r[8] ?? 0) * z;
  return valueInLayout(model, qx, qy, qz, octaves);
}

/**
 * 꼭짓점이 바다에 오는 배치 회전: 후보마다 꼭짓점 8곳의 대륙성(잔 노이즈는 가장 많은 옥타브로, 해상도와 무관)을 보고
 * Σ max(0, 값 + CORNER_MARGIN)²이 가장 작은 것. 최댓값만 보면 초대륙처럼 꼭짓점 하나를 피할 수 없을 때 나머지가 아무
 * 데나 놓였다(땅 안 꼭짓점마다 둥근 바다가 생긴다)
 */
function chooseLayoutRotation(seed: number, model: ContinentModel): Float64Array {
  const rng = streamRng(seed, STREAM_CONTINENT_ROTATION);
  const norm = Math.sqrt(3);
  let best = model.rotation;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let candidate = 0; candidate < ROTATION_CANDIDATES; candidate++) {
    const rotation = candidate === 0 ? model.rotation : Float64Array.from(randomRotation(rng));
    const trial: ContinentModel = { ...model, rotation };
    let score = 0;
    for (const corner of CUBE_CORNERS) {
      const [sx, sy, sz] = corner.axisSigns;
      const value = continentValue(trial, sx / norm, sy / norm, sz / norm, DETAIL_NOISE.octaves);
      const over = Math.max(0, value + CORNER_MARGIN);
      score += over * over;
    }
    if (score < bestScore) {
      bestScore = score;
      best = rotation;
    }
  }
  return best;
}
