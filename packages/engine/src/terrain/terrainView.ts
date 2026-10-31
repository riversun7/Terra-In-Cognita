// 지형 그리기 — 워커가 만든 타입 배열을 BufferGeometry로 감싼다(화면 스레드는 복사하지 않는다).
// 물: 꼭짓점 물 높이가 있으면(TCTR 2판) 그 높이의 물 면(waterMesh.ts), 없으면 해수면 판 하나.
// 윗면 색은 지형 재질(terrainMaterial.ts)이 칸 자료 텍스처로 조각마다 칠한다. 가장자리 벽은 꼭짓점 색이다.
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial, PlaneGeometry } from "three";
import { buildWaterMesh } from "./waterMesh.ts";
import { type TerrainInput, mapSizeM } from "./terrainData.ts";
import { TerrainMaterial } from "./terrainMaterial.ts";
import type { TerrainMeshArrays } from "./terrainMesh.ts";

/** 물 색(파스텔 하늘물빛)과 불투명도 */
const WATER_COLOR = 0x7ccbe8;
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

  /** 탐사 칸(안개). null이면 끈다 */
  setExplored(bits: Uint8Array | null): void {
    this.surface.setExplored(bits);
  }

  /** 메시(워커 결과)와 그 메시를 만든 지형 입력(칸 지표·칸 크기·물 높이), 지형 재질의 잡음 자료(terrainBuilder.ts) */
  set(mesh: TerrainMeshArrays, terrain: TerrainInput, noise: Uint8Array): void {
    this.clear();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
    geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3, true));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    geometry.computeBoundingSphere();
    this.geometry = geometry;
    this.surface.setTerrain(terrain, mesh.minHeightM, mesh.maxHeightM, noise);
    this.group.add(new Mesh(geometry, this.surface.material));
    const surfaceMesh = buildWaterMesh(terrain);
    if (surfaceMesh) {
      const waterGeometry = new BufferGeometry();
      waterGeometry.setAttribute("position", new BufferAttribute(surfaceMesh.positions, 3));
      waterGeometry.setIndex(new BufferAttribute(surfaceMesh.indices, 1));
      waterGeometry.computeVertexNormals();
      waterGeometry.computeBoundingSphere();
      this.water = new Mesh(waterGeometry, waterMaterial());
      this.group.add(this.water);
    } else if (!terrain.waterLevels && mesh.hasWater) {
      const size = mapSizeM(terrain);
      const plane = new PlaneGeometry(size, size).rotateX(-Math.PI / 2);
      const water = new Mesh(plane, waterMaterial());
      water.position.set(size / 2, terrain.waterLevelM, size / 2);
      this.water = water;
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
