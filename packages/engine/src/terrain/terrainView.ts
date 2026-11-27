// 지형 그리기 — 워커가 만든 타입 배열을 BufferGeometry로 감싼다(화면 스레드는 복사하지 않는다).
// 물: 꼭짓점 물 높이가 있으면(TCTR 2판) 그 높이의 물 면(waterMesh.ts), 없으면 해수면 판 하나.
// 윗면 색은 지형 재질(terrainMaterial.ts)이 칸 자료 텍스처로 조각마다 칠한다. 가장자리 벽은 꼭짓점 색이다.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from "three";
import { buildWaterMesh } from "./waterMesh.ts";
import { type TerrainInput, mapSizeM } from "./terrainData.ts";
import { TerrainMaterial } from "./terrainMaterial.ts";
import { SURFACE_INDEX_COUNT, type TerrainMeshArrays } from "./terrainMesh.ts";

/** 물 색(파스텔 하늘물빛)과 인접 구역 톤 낮추기 색, 불투명도 */
const WATER_COLOR = 0x7ccbe8;
const WATER_BASE = new Color(WATER_COLOR);
const WATER_NEIGHBOUR = new Color(0x6199b3);
const WATER_OPACITY = 0.82;

function waterMaterial(): MeshLambertMaterial {
  return new MeshLambertMaterial({
    color: WATER_COLOR,
    transparent: true,
    opacity: WATER_OPACITY,
    depthWrite: false,
  });
}

export class TerrainView {
  readonly group = new Group();
  private geometry: BufferGeometry | null = null;
  private readonly surface = new TerrainMaterial();
  private water: Mesh<BufferGeometry, MeshLambertMaterial> | null = null;
  private walls = true;
  /** 인접 구역 톤 낮추기 세기(0 중심/끔 ~ 1 인접 최대) — 물 색에도 같이 반영한다 */
  private waterTone = 0;

  /**
   * 가장자리 벽(치마)을 보일지. 이웃 2차맵을 둘레에 그릴 때는 숨긴다: 이웃 땅과 맞닿은 벽 윗단이 깊이 정밀도 때문에
   * 경계에 가는 줄로 비쳤다(경계 너머 보기 화면 시험 사진)
   */
  setWalls(visible: boolean): void {
    this.walls = visible;
    this.geometry?.setDrawRange(0, visible ? Number.POSITIVE_INFINITY : SURFACE_INDEX_COUNT);
  }

  /** 탐사 칸(안개). null이면 끈다 */
  setExplored(bits: Uint8Array | null): void {
    this.surface.setExplored(bits);
  }

  /** 격자 선(개발자 2차맵 시험) */
  setGrid(on: boolean): void {
    this.surface.setGrid(on);
  }

  /** 2차맵 경계 점선·인접 톤 낮추기 세기와 역할(중심 / 인접) */
  setBorder(mainLine: number, subLine: number, neighbourTone: number, isNeighbour: boolean): void {
    this.surface.setBorder(mainLine, subLine, neighbourTone, isNeighbour);
    this.waterTone = isNeighbour ? neighbourTone : 0;
    this.applyWaterTone();
  }

  private applyWaterTone(): void {
    if (!this.water) return;
    this.water.material.color.copy(WATER_BASE).lerp(WATER_NEIGHBOUR, this.waterTone);
  }

  /** 메시(워커 결과)와 그 메시를 만든 지형 입력(칸 지표·칸 크기·물 높이), 지형 재질의 잡음 자료(terrainBuilder.ts) */
  /**
   * shade = 높이 밝기에 쓸 높이 범위(m). 없으면 이 지형의 범위. 이웃 2차맵은 지금 2차맵 범위를 써서 경계 양쪽 밝기가 같다
   * (2차맵마다 범위가 달라 같은 높이가 경계에서 다른 밝기로 보였다)
   */
  set(
    mesh: TerrainMeshArrays,
    terrain: TerrainInput,
    noise: Uint8Array,
    shade?: { minHeightM: number; maxHeightM: number },
  ): void {
    this.clear();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
    geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3, true));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    geometry.computeBoundingSphere();
    this.geometry = geometry;
    this.setWalls(this.walls);
    this.surface.setTerrain(
      terrain,
      shade?.minHeightM ?? mesh.minHeightM,
      shade?.maxHeightM ?? mesh.maxHeightM,
      noise,
    );
    this.group.add(new Mesh(geometry, this.surface.material));
    const surfaceMesh = buildWaterMesh(terrain);
    if (surfaceMesh) {
      const waterGeometry = new BufferGeometry();
      waterGeometry.setAttribute("position", new BufferAttribute(surfaceMesh.positions, 3));
      waterGeometry.setIndex(new BufferAttribute(surfaceMesh.indices, 1));
      waterGeometry.computeVertexNormals();
      waterGeometry.computeBoundingSphere();
      this.water = new Mesh(waterGeometry, waterMaterial());
      this.applyWaterTone();
      this.group.add(this.water);
    } else if (!terrain.waterLevels && mesh.hasWater) {
      const size = mapSizeM(terrain);
      const plane = new PlaneGeometry(size, size).rotateX(-Math.PI / 2);
      const water = new Mesh(plane, waterMaterial());
      water.position.set(size / 2, terrain.waterLevelM, size / 2);
      this.water = water;
      this.applyWaterTone();
      this.group.add(water);
    }
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    this.surface.dispose();
  }

  private clear(): void {
    this.group.clear();
    this.geometry?.dispose();
    this.geometry = null;
    if (this.water) {
      this.water.geometry.dispose();
      this.water.material.dispose();
      this.water = null;
    }
  }
}
