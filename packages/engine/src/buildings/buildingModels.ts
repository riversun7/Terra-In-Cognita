// 시설 종류별 로우폴리 건물 모델 — 순수 코드(three를 쓰지 않는다, 시험 대상). ADR 2026-11-08-building-art.
// 입력: 모델 종류·바닥 크기(m, 돌리기 전 가로 x·세로 z)·레벨·상태·국가 색·씨앗(건물 ID). 출력: 조각 목록(buildingParts.ts 좌표).
// - 모든 조각은 바닥 판(가로 × 세로) 안에 든다(마지막에 안으로 맞춘다, 시험이 본다).
// - 레벨: 2부터 종류마다 덧붙이는 것(사일로·통나무 더미·굴뚝 등), 3부터 본채가 한 층씩 높아진다(5까지).
// - 상태: 짓는 중 = 뼈대·낮은 벽·재료 더미, 손상·멈춤 = 어둡게 + 돌 조각(멈춤은 창 불 꺼짐·깃발 없음), 폐허 = 낮은 벽 조각과 돌 더미.
// - 좌우 뒤집기·지붕 색 고르기는 씨앗으로 정한다(같은 종류가 모인 도시에서 똑같이 찍어 낸 것처럼 보이지 않게).
import { type BuildingArtKind, type BuildingCondition, MAX_ART_LEVEL } from "./buildingLook.ts";
import { KIND_MODELS, type KindContext, mainRectOf } from "./buildingKinds.ts";
import {
  BUILDING_COLORS as C,
  STATE_SHADE,
  type Rgb,
  WINDOW_DARK,
  WINDOW_LIT,
  nationAccent,
} from "./buildingPalette.ts";
import { type BuildingPart, FLOOR_M, MARGIN_M, PartList, partBounds, seededRandom } from "./buildingParts.ts";

export interface ModelInput {
  readonly kind: BuildingArtKind;
  /** 바닥 크기(m): 돌리기 전 가로(로컬 x)·세로(로컬 z, 앞뒤) */
  readonly widthM: number;
  readonly depthM: number;
  /** 1 ~ MAX_ART_LEVEL */
  readonly level: number;
  readonly state: BuildingCondition;
  readonly upgrading?: boolean;
  /** 국가 색 번호(null = 깃발 없음) */
  readonly accent: number | null;
  /** 씨앗(건물 ID) */
  readonly seed: number;
}

export function buildingModel(input: ModelInput): BuildingPart[] {
  const W = Math.max(2, input.widthM);
  const D = Math.max(2, input.depthM);
  const level = Math.min(MAX_ART_LEVEL, Math.max(1, Math.floor(input.level)));
  const random = seededRandom(input.seed);
  const list = new PartList();
  const accent = nationAccent(input.accent);
  const shade = STATE_SHADE[input.state];
  list.windowColor = input.state === "ok" || input.state === "damaged" ? WINDOW_LIT : WINDOW_DARK;
  const ctx: KindContext = {
    list,
    W,
    D,
    level,
    extraH: Math.max(0, level - 2) * 3,
    random,
    ridge: input.state === "ok" || input.state === "damaged" ? accent : null,
    main: mainRectOf(input.kind, W, D),
  };
  list.pad(W, D, input.kind === "government" || input.kind === "temple" ? C.padStone : C.pad);
  if (input.state === "building") underConstruction(ctx);
  else if (input.state === "ruin") ruin(ctx);
  else {
    KIND_MODELS[input.kind](ctx);
    if (input.upgrading) {
      const m = ctx.main;
      list.scaffold(m.x, m.z, m.w, m.d, 4 + ctx.extraH + 2);
    }
    if (input.state === "damaged" || input.state === "disabled") {
      const m = ctx.main;
      const count = input.state === "damaged" ? 3 : 6;
      list.rubble(m.x + m.w * 0.45, m.z + m.d * 0.55, count, Math.min(m.w, m.d) * 0.35, random);
    }
    // 깃발(국가 색): 다 지었고 멈추지 않은 건물만, 판 앞 왼쪽 모서리
    if (accent && (input.state === "ok" || input.state === "damaged") && input.kind !== "government")
      list.flag(-W / 2 + MARGIN_M + 0.2, D / 2 - MARGIN_M - 0.2, 5 + level * 0.6, accent);
  }
  // 좌우 뒤집기(씨앗) → 상태 색 → 판 안으로 맞추기
  const mirror = random() < 0.5 ? -1 : 1;
  return list.parts.map((part) => {
    const shaded = shade === 1 || part.shape === "glow" ? part.color : scaleRgb(part.color, shade);
    return fitInside({ ...part, x: part.x * mirror, turn: part.turn * mirror, color: shaded }, W, D);
  });
}

/** 판(가로 W × 세로 D) 밖으로 나간 조각을 안으로 옮기고, 판보다 크면 줄인다 */
function fitInside(part: BuildingPart, W: number, D: number): BuildingPart {
  const b = partBounds(part);
  const limitX = W / 2;
  const limitZ = D / 2;
  let { x, z, sx, sz } = part;
  const spanX = b.x1 - b.x0;
  const spanZ = b.z1 - b.z0;
  if (spanX > W || spanZ > D) {
    const k = Math.min(W / spanX, D / spanZ);
    sx *= k;
    sz *= k;
    return fitInside({ ...part, sx, sz }, W, D);
  }
  if (b.x0 < -limitX) x += -limitX - b.x0;
  if (b.x1 > limitX) x -= b.x1 - limitX;
  if (b.z0 < -limitZ) z += -limitZ - b.z0;
  if (b.z1 > limitZ) z -= b.z1 - limitZ;
  return x === part.x && z === part.z ? part : { ...part, x, z };
}

const scaleRgb = (color: Rgb, k: number): Rgb => [color[0] * k, color[1] * k, color[2] * k];

// ---------- 상태 공통 ----------

function underConstruction(ctx: KindContext): void {
  const { list, main: m, random, W, D } = ctx;
  list.frame(m.x, m.z, m.w, m.d, 4.2);
  // 재료 더미: 앞 오른쪽에 상자와 통나무
  list.crates(W * 0.28, D * 0.32, 3, random, 1);
  list.logPile(-W * 0.22, D * 0.34, Math.min(4, W * 0.3), 2);
}

function ruin(ctx: KindContext): void {
  const { list, main: m, random } = ctx;
  const t = 0.5;
  // 무너진 벽 네 토막(높이 제각각, 앞쪽은 가운데가 비었다)
  list.add("box", m.x, FLOOR_M, m.z - m.d / 2, m.w, 1.2 + random() * 1.4, t, C.wallStone);
  list.add("box", m.x - m.w / 2, FLOOR_M, m.z, t, 0.8 + random() * 1.8, m.d, C.wallStone);
  list.add("box", m.x + m.w / 2, FLOOR_M, m.z - m.d * 0.15, t, 0.6 + random() * 1.2, m.d * 0.7, C.wallStone);
  list.add("box", m.x - m.w * 0.3, FLOOR_M, m.z + m.d / 2, m.w * 0.4, 0.7 + random(), t, C.wallStone);
  list.rubble(m.x, m.z, 8, Math.min(m.w, m.d) * 0.4, random);
  list.add("pyramid", m.x + m.w * 0.15, FLOOR_M, m.z, m.w * 0.5, 1.6, m.d * 0.45, C.rubble, { turn: 0.3 });
}
