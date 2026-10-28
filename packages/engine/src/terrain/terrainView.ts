// 지형 그리기 — 워커가 만든 타입 배열을 BufferGeometry로 감싼다(화면 스레드는 복사하지 않는다). 물은 판 하나.
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial, PlaneGeometry } from "three";
import type { TerrainMeshArrays } from "./terrainMesh.ts";

/** 물 색(파스텔 하늘물빛)과 불투명도 */
const WATER_COLOR = 0x7ccbe8;
const WATER_OPACITY = 0.82;

export class TerrainView {
  readonly group = new Group();
  private geometry: BufferGeometry | null = null;
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  private water: Mesh<PlaneGeometry, MeshLambertMaterial> | null = null;

  set(mesh: TerrainMeshArrays, mapSizeM: number, waterLevelM: number): void {
    this.clear();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(mesh.normals, 3));
    geometry.setAttribute("color", new BufferAttribute(mesh.colors, 3, true));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    geometry.computeBoundingSphere();
    this.geometry = geometry;
    this.group.add(new Mesh(geometry, this.material));
    if (mesh.hasWater) {
      const plane = new PlaneGeometry(mapSizeM, mapSizeM).rotateX(-Math.PI / 2);
      const water = new Mesh(
        plane,
        new MeshLambertMaterial({
          color: WATER_COLOR,
          transparent: true,
          opacity: WATER_OPACITY,
          depthWrite: false,
        }),
      );
      water.position.set(mapSizeM / 2, waterLevelM, mapSizeM / 2);
      this.water = water;
      this.group.add(water);
    }
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    this.material.dispose();
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
