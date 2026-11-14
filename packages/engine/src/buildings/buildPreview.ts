// 건축 모드 미리보기 층 — 사용자 요청 2026-11-14 "2차맵에서 건설하는 기능"(docs/adr/2026-11-14-second-map-build.md), 기획 D-483
// "배치는 반투명 미리보기". 놓을 자리(배치 칸 왼쪽 위·크기·회전)에 반투명 상자와 바닥 판을 그린다. 지을 수 있으면 초록, 아니면 빨강.
// 판정은 하지 않는다(기기 대략 판정·서버 최종 판정은 화면과 서버 몫). 엔진 덧그림 층(EngineLayer)이라 엔진 파일을 키우지 않는다:
// 화면이 engine.addLayer(preview.layer)로 붙이고, set() 뒤 engine.requestFrame()을 부른다.
import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";
import type { EngineLayer } from "../render/engineLayers.ts";
import { type QuarterTurns, footprintRect } from "./footprint.ts";

/** 미리보기 한 건(배치 칸) */
export interface BuildPreviewInput {
  /** 왼쪽 위 칸(돌린 뒤) */
  readonly cellX: number;
  readonly cellY: number;
  /** 돌리기 전 크기(배치 칸) */
  readonly width: number;
  readonly depth: number;
  readonly rotation: QuarterTurns;
  /** 기기 대략 판정으로 지을 수 있나(색만 바꾼다) */
  readonly valid: boolean;
}

/** 상자 높이(m)·바닥 판을 띄우는 높이(m) */
const BOX_HEIGHT_M = 3;
const PLATE_LIFT_M = 0.12;
const VALID_COLOR = 0x5ad17a;
const INVALID_COLOR = 0xe2556b;

export interface BuildPreview {
  readonly layer: EngineLayer;
  /** 미리보기를 바꾼다(null이면 숨김) */
  set(preview: BuildPreviewInput | null): void;
  dispose(): void;
}

/** 돌린 크기(배치 칸)·가운데(배치 칸) — 시험 대상 */
export function previewBox(preview: BuildPreviewInput): {
  readonly sizeX: number;
  readonly sizeY: number;
  readonly centreX: number;
  readonly centreY: number;
} {
  const rect = footprintRect({
    id: 0,
    cellX: preview.cellX,
    cellY: preview.cellY,
    width: preview.width,
    depth: preview.depth,
    rotation: preview.rotation,
    heightM: 0,
  });
  return {
    sizeX: rect.x1 - rect.x0,
    sizeY: rect.y1 - rect.y0,
    centreX: (rect.x0 + rect.x1) / 2,
    centreY: (rect.y0 + rect.y1) / 2,
  };
}

export function createBuildPreview(): BuildPreview {
  const group = new Group();
  group.visible = false;
  group.renderOrder = 15;
  const boxGeometry = new BoxGeometry(1, 1, 1);
  const boxMaterial = new MeshBasicMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const box = new Mesh(boxGeometry, boxMaterial);
  const edgeGeometry = new EdgesGeometry(boxGeometry);
  const edgeMaterial = new LineBasicMaterial({ color: VALID_COLOR, transparent: true, opacity: 0.9 });
  const edges = new LineSegments(edgeGeometry, edgeMaterial);
  const plateGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const plateMaterial = new MeshBasicMaterial({
    color: VALID_COLOR,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const plate = new Mesh(plateGeometry, plateMaterial);
  group.add(plate, box, edges);
  let current: BuildPreviewInput | null = null;

  const layer: EngineLayer = {
    object: group,
    after(view) {
      if (!current) {
        group.visible = false;
        return;
      }
      const { sizeX, sizeY, centreX, centreY } = previewBox(current);
      const cell = view.cellM;
      const wx = centreX * cell;
      const wz = centreY * cell;
      // 땅이 기울어도 상자가 묻히지 않게 네 귀퉁이와 가운데 가운데 가장 높은 땅에 둔다
      const x0 = (centreX - sizeX / 2) * cell;
      const x1 = (centreX + sizeX / 2) * cell;
      const z0 = (centreY - sizeY / 2) * cell;
      const z1 = (centreY + sizeY / 2) * cell;
      const ground = Math.max(
        view.groundAt(wx, wz),
        view.groundAt(x0, z0),
        view.groundAt(x1, z0),
        view.groundAt(x0, z1),
        view.groundAt(x1, z1),
      );
      const w = sizeX * cell;
      const d = sizeY * cell;
      plate.position.set(wx, ground + PLATE_LIFT_M, wz);
      plate.scale.set(w, 1, d);
      box.position.set(wx, ground + BOX_HEIGHT_M / 2, wz);
      box.scale.set(w, BOX_HEIGHT_M, d);
      edges.position.copy(box.position);
      edges.scale.copy(box.scale);
      group.visible = true;
    },
  };

  return {
    layer,
    set(preview) {
      current = preview;
      const color = preview?.valid === false ? INVALID_COLOR : VALID_COLOR;
      boxMaterial.color.setHex(color);
      edgeMaterial.color.setHex(color);
      plateMaterial.color.setHex(color);
      if (!preview) group.visible = false;
    },
    dispose() {
      group.removeFromParent();
      boxGeometry.dispose();
      edgeGeometry.dispose();
      plateGeometry.dispose();
      boxMaterial.dispose();
      edgeMaterial.dispose();
      plateMaterial.dispose();
    },
  };
}
