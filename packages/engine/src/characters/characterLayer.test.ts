import { characterLookForUnit } from "@terra/shared/characterLook";
import { Frustum, Matrix4, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import {
  CHARACTER_BUDGETS,
  CharacterLayer,
  type CharacterLayerView,
  LOD0_MIN_PX,
  MODEL_MIN_PX,
  MODEL_RETURN_PX,
} from "./characterLayer.ts";

const CELL_M = 5;
/** 키 1.8m가 화면 px 픽셀로 보이는 확대(1m의 픽셀) */
const ppmAt = (px: number): number => px / 1.8;

/** 위에서 내려다보는 넓은 시야(원점 둘레 수백 m가 다 든다) */
function wideFrustum(): Frustum {
  const camera = new PerspectiveCamera(60, 1, 1, 5000);
  camera.position.set(0, 600, 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
}

/** 유닛 count개를 원점에서 동쪽으로 spacingM 간격으로 놓은 보기 */
function viewOf(count: number, spacingM: number, over: Partial<CharacterLayerView> = {}): CharacterLayerView {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  for (let i = 0; i < count; i++) x[i] = (i * spacingM) / CELL_M;
  return {
    count,
    x,
    y,
    moving: new Uint8Array(count),
    cellM: CELL_M,
    groundAt: () => 0,
    frustum: wideFrustum(),
    targetX: 0,
    targetZ: 0,
    pixelsPerMetre: 20,
    icons: false,
    level: 2,
    deltaMs: 16,
    ...over,
  };
}

function layerWith(count: number, withLook: (id: number) => boolean = () => true): CharacterLayer {
  const layer = new CharacterLayer(512);
  const models = [];
  for (let id = 1; id <= count; id++)
    if (withLook(id)) models.push({ id, look: characterLookForUnit(id, "commoner") });
  layer.setLooks(models);
  layer.bind(count, (slot) => slot + 1);
  return layer;
}

describe("2차맵 캐릭터 층", () => {
  it("외형이 없으면 아무것도 모델로 그리지 않는다", () => {
    const layer = layerWith(10, () => false);
    layer.update(viewOf(10, 1));
    expect(layer.models).toBe(0);
    expect([...layer.drawn.subarray(0, 10)]).toEqual(Array.from({ length: 10 }, () => 0));
    layer.dispose();
  });

  it("가까운 차례로 상한까지 모델로 그리고, 가장 가까운 것부터 가까운 단계다", () => {
    const layer = layerWith(200);
    const budget = CHARACTER_BUDGETS[2];
    if (!budget) throw new Error("no budget");
    // 0.5m 간격 200개: 모두 110m 안
    layer.update(viewOf(200, 0.5));
    expect(layer.models).toBe(budget.maxModels);
    expect(layer.lod0).toBe(budget.maxLod0);
    for (let slot = 0; slot < 200; slot++) {
      const expected = slot < budget.maxLod0 ? 1 : slot < budget.maxModels ? 2 : 0;
      expect(layer.drawn[slot], `slot ${slot}`).toBe(expected);
      expect(layer.drawnAs(slot)).toBe(expected);
    }
    expect(layer.triangles).toBeLessThanOrEqual(
      budget.maxLod0 * 600 + (budget.maxModels - budget.maxLod0) * 150,
    );
    // 그리기 호출은 도형 수 안(캐릭터 수와 상관없다)
    expect(layer.drawCalls).toBeLessThanOrEqual(16);
    expect(layer.drawCalls).toBeGreaterThan(0);
    layer.dispose();
  });

  it("가시거리 단계가 낮으면 거리·상한이 줄고, 거리 밖 유닛은 캡슐로 남는다", () => {
    const layer = layerWith(40);
    const budget = CHARACTER_BUDGETS[0];
    if (!budget) throw new Error("no budget");
    // 5m 간격 40개(0 ~ 195m): 60m 안은 13개(0, 5, …, 60)
    layer.update(viewOf(40, 5, { level: 0 }));
    expect(layer.models).toBe(13);
    expect(layer.lod0).toBe(budget.maxLod0);
    expect(layer.drawn[12]).toBe(2);
    expect(layer.drawn[13]).toBe(0);
    // 단계 4: 180m 안 37개
    layer.update(viewOf(40, 5, { level: 4 }));
    expect(layer.models).toBe(37);
    layer.dispose();
  });

  it("점(아이콘) 표현이거나 화면에서 너무 작으면 모델을 그리지 않고, 돌아올 때는 조금 더 커야 한다", () => {
    const layer = layerWith(5);
    layer.update(viewOf(5, 1, { icons: true }));
    expect(layer.models).toBe(0);
    layer.update(viewOf(5, 1, { pixelsPerMetre: ppmAt(MODEL_RETURN_PX + 1) }));
    expect(layer.models).toBe(5);
    // 켜진 뒤에는 MODEL_MIN_PX까지 버틴다
    layer.update(viewOf(5, 1, { pixelsPerMetre: ppmAt(MODEL_MIN_PX + 0.2) }));
    expect(layer.models).toBe(5);
    layer.update(viewOf(5, 1, { pixelsPerMetre: ppmAt(MODEL_MIN_PX - 0.5) }));
    expect(layer.models).toBe(0);
    // 꺼진 뒤에는 MODEL_RETURN_PX를 넘어야 다시 켜진다
    layer.update(viewOf(5, 1, { pixelsPerMetre: ppmAt(MODEL_MIN_PX + 0.2) }));
    expect(layer.models).toBe(0);
    layer.update(viewOf(5, 1, { pixelsPerMetre: ppmAt(MODEL_RETURN_PX + 0.5) }));
    expect(layer.models).toBe(5);
    layer.dispose();
  });

  it("화면에서 작으면(가까운 단계 문턱 아래) 모두 먼 단계다", () => {
    const layer = layerWith(20);
    layer.update(viewOf(20, 1, { pixelsPerMetre: (LOD0_MIN_PX - 2) / 1.8 }));
    expect(layer.models).toBe(20);
    expect(layer.lod0).toBe(0);
    layer.update(viewOf(20, 1, { pixelsPerMetre: (LOD0_MIN_PX + 2) / 1.8 }));
    expect(layer.lod0).toBe(16);
    layer.dispose();
  });

  it("외형이 있는 유닛만 모델이고, 명단을 다시 이으면 새 칸으로 옮겨 간다", () => {
    const layer = layerWith(6, (id) => id % 2 === 0);
    layer.update(viewOf(6, 1));
    expect([...layer.drawn.subarray(0, 6)].map((value) => (value > 0 ? 1 : 0))).toEqual([0, 1, 0, 1, 0, 1]);
    expect(layer.hasLook(1)).toBe(true);
    expect(layer.hasLook(0)).toBe(false);
    // 명단이 줄어 유닛 2·4만 남으면(칸 0·1) 둘 다 모델이다
    layer.bind(2, (slot) => (slot + 1) * 2);
    layer.update(viewOf(2, 1));
    expect([...layer.drawn.subarray(0, 2)].map((value) => (value > 0 ? 1 : 0))).toEqual([1, 1]);
    // 외형 목록을 비우면 모델이 없다
    layer.setLooks([]);
    layer.bind(2, (slot) => (slot + 1) * 2);
    layer.update(viewOf(2, 1));
    expect(layer.models).toBe(0);
    layer.dispose();
  });

  it("맞지 않는 외형은 버린다", () => {
    const layer = new CharacterLayer(8);
    const bad = { ...characterLookForUnit(1, "commoner"), head: "tophat" };
    // @ts-expect-error 목록 밖 머리 모양(서버가 준 값이 틀렸을 때)
    layer.setLooks([{ id: 1, look: bad }]);
    layer.bind(1, () => 1);
    layer.update(viewOf(1, 1));
    expect(layer.models).toBe(0);
    layer.dispose();
  });

  it("같은 외형이 많아도 캐시에는 외형 × 단계만큼만 든다", () => {
    const layer = new CharacterLayer(64);
    const look = characterLookForUnit(7, "commoner");
    layer.setLooks(Array.from({ length: 40 }, (_, index) => ({ id: index + 1, look })));
    layer.bind(40, (slot) => slot + 1);
    layer.update(viewOf(40, 1));
    expect(layer.models).toBe(40);
    expect(layer.cached).toBe(2);
    layer.dispose();
  });

  it("큰 유닛(배율)·짐승·탈것도 같은 메시로 모델이 되고, 누르기 폭은 배율만큼 넓다", () => {
    const layer = new CharacterLayer(16);
    layer.setLooks([
      { id: 1, look: characterLookForUnit(1, "commoner") },
      { id: 2, look: characterLookForUnit(2, "android"), scale: 6 / 1.8 },
      { id: 3, body: { kind: "beast", seed: 3 }, scale: 6 },
      { id: 4, body: { kind: "car", seed: 4 } },
      { id: 5, body: { kind: "truck", seed: 5 } },
      { id: 6, body: { kind: "crawler", seed: 6 } },
    ]);
    layer.bind(6, (slot) => slot + 1);
    layer.update(viewOf(6, 12));
    expect(layer.models).toBe(6);
    expect([...layer.drawn.subarray(0, 6)].every((value) => value > 0)).toBe(true);
    // 도형 8 + 빛 2를 넘지 않는다(유닛 종류가 늘어도 그리기 호출은 그대로)
    expect(layer.drawCalls).toBeLessThanOrEqual(10);
    expect(layer.pickHalfWidth(0)).toBeCloseTo(0.45);
    expect(layer.pickHalfWidth(1)).toBeCloseTo((0.45 * 6) / 1.8);
    expect(layer.pickHalfWidth(3)).toBeGreaterThan(0.7);
    // 맞지 않는 몸 종류·배율은 버리거나 묶는다
    const dragon = { kind: "dragon", seed: 1 };
    layer.setLooks([
      // @ts-expect-error 목록 밖 몸 종류
      { id: 1, body: dragon },
      { id: 2, look: characterLookForUnit(2, "commoner"), scale: Number.NaN },
    ]);
    layer.bind(2, (slot) => slot + 1);
    layer.update(viewOf(2, 1));
    expect(layer.drawnAs(0)).toBe(0);
    expect(layer.drawnAs(1)).toBeGreaterThan(0);
    expect(layer.pickHalfWidth(1)).toBeCloseTo(0.45);
    layer.dispose();
  });
});
