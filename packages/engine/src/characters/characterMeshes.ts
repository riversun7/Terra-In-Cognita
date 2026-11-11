// 캐릭터 그리기 — 조각(characterCompile.ts)을 도형마다 InstancedMesh 하나로 그린다. docs/adr/2026-11-11-character-3d.md 2절.
// - 그리기 호출 = 쓰는 (도형, 빛나는지) 묶음 수. 캐릭터 수·외형 가짓수와 상관없다(건물 그리기 buildingView.ts와 같은 방식).
// - 재질 둘을 모든 캐릭터가 함께 쓴다: 몸(Lambert, 각진 면 + 인스턴스 색 + 밤 빛), 빛(빛을 받지 않는 인스턴스 색 — 눈·등불).
// - 프레임마다 begin → add(캐릭터마다) → end. 인스턴스 버퍼는 모자라면 두 배로 키운다(메시를 다시 만든다).
// - 화면 밖 거르기는 부르는 쪽이 캐릭터마다 한다(three.js의 물체 단위 거르기는 끈다).
// 2차맵 층(characterLayer.ts)과 만들기 미리 보기(characterPreview.ts)가 함께 쓴다.
import {
  type BufferGeometry,
  DynamicDrawUsage,
  Group,
  type IUniform,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  MeshBasicMaterial,
  MeshLambertMaterial,
} from "three";
import { UNIT_BODY_SHADER_INSERT } from "../units/unitMaterials.ts";
import { type CharacterPose, type CompiledCharacter, writeGroupMatrices } from "./characterCompile.ts";
import { createCharacterGeometry } from "./characterGeometry.ts";
import { CHARACTER_SHAPES, GROUP_COUNT, multiplyAffine } from "./characterParts.ts";

/** three 프로그램 캐시 키 — 유닛 몸·건물 몸(같은 Lambert + 밤 빛)과 나눠 쓰지 않게 따로 준다 */
const BODY_PROGRAM_KEY = "terra-character-body";
/** 묶음 하나의 처음 인스턴스 수 */
const START_CAPACITY = 64;

/** 캐릭터 몸 재질: 인스턴스 색 Lambert(각진 면) + 밤 빛(자기 색 × 값) */
class CharacterBodyMaterial {
  readonly material = new MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private readonly uniforms: { uNightLift: IUniform<number> } = { uNightLift: { value: 0 } };

  constructor() {
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      const { anchor, code, pars } = UNIT_BODY_SHADER_INSERT;
      shader.fragmentShader = shader.fragmentShader
        .replace(pars[0], `${pars[0]}\n${pars[1]}`)
        .replace(anchor, `${anchor}\n${code}`);
    };
    this.material.customProgramCacheKey = () => BODY_PROGRAM_KEY;
  }

  setNightLift(value: number): void {
    this.uniforms.uNightLift.value = Math.max(0, value);
  }
}

/** (도형, 빛나는지) 하나의 인스턴스 버퍼와 메시 */
interface Bucket {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  matrices: Float32Array;
  colors: Float32Array;
  capacity: number;
  count: number;
  mesh: InstancedMesh | null;
  meshCapacity: number;
}

export class CharacterMeshes {
  readonly group = new Group();
  private readonly geometries: BufferGeometry[] = CHARACTER_SHAPES.map(createCharacterGeometry);
  private readonly body = new CharacterBodyMaterial();
  private readonly glow = new MeshBasicMaterial({ color: 0xffffff });
  /** 묶음: 도형 번호 × 2 + 빛나는지. 처음 쓸 때 만든다 */
  private readonly buckets: (Bucket | null)[] = CHARACTER_SHAPES.flatMap(() => [null, null]);
  private readonly groupMatrices = new Float32Array(GROUP_COUNT * 16);
  private readonly rootGroups = new Float32Array(GROUP_COUNT * 16);
  /** 마지막 end()까지 넣은 캐릭터·조각·삼각형 수 */
  characters = 0;
  parts = 0;
  triangles = 0;

  begin(): void {
    for (const bucket of this.buckets) if (bucket) bucket.count = 0;
    this.characters = 0;
    this.parts = 0;
    this.triangles = 0;
  }

  /** 캐릭터 하나. root = 세계 행렬(열 우선 16칸: 자리·돌림), pose = 자세 */
  add(compiled: CompiledCharacter, root: ArrayLike<number>, pose: CharacterPose): void {
    writeGroupMatrices(this.groupMatrices, compiled.pivots, pose);
    for (let group = 0; group < GROUP_COUNT; group++)
      multiplyAffine(this.rootGroups, group * 16, root, 0, this.groupMatrices, group * 16);
    for (let part = 0; part < compiled.count; part++) {
      const bucket = this.bucketOf((compiled.shapes[part] ?? 0) * 2 + (compiled.glow[part] ?? 0));
      if (bucket.count === bucket.capacity) grow(bucket);
      const at = bucket.count++;
      multiplyAffine(
        bucket.matrices,
        at * 16,
        this.rootGroups,
        (compiled.groups[part] ?? 0) * 16,
        compiled.matrices,
        part * 16,
      );
      bucket.colors[at * 3] = compiled.colors[part * 3] ?? 1;
      bucket.colors[at * 3 + 1] = compiled.colors[part * 3 + 1] ?? 1;
      bucket.colors[at * 3 + 2] = compiled.colors[part * 3 + 2] ?? 1;
    }
    this.characters += 1;
    this.parts += compiled.count;
    this.triangles += compiled.triangles;
  }

  /** 넣은 만큼만 올리고 그리기 수를 맞춘다 */
  end(): void {
    for (const bucket of this.buckets) {
      if (!bucket) continue;
      if (bucket.count > 0 && (!bucket.mesh || bucket.meshCapacity < bucket.capacity)) this.rebuild(bucket);
      const mesh = bucket.mesh;
      if (!mesh) continue;
      mesh.count = bucket.count;
      mesh.visible = bucket.count > 0;
      if (bucket.count === 0) continue;
      const matrix = mesh.instanceMatrix;
      matrix.clearUpdateRanges();
      matrix.addUpdateRange(0, bucket.count * 16);
      matrix.needsUpdate = true;
      const color = mesh.instanceColor;
      if (color) {
        color.clearUpdateRanges();
        color.addUpdateRange(0, bucket.count * 3);
        color.needsUpdate = true;
      }
    }
  }

  /** 지금 그리는 묶음 수(= 그리기 호출) */
  get drawCalls(): number {
    let calls = 0;
    for (const bucket of this.buckets) if (bucket && bucket.count > 0) calls += 1;
    return calls;
  }

  /** 밤 빛: 몸이 자기 색 × 값만큼 스스로 낸다(0이면 낮과 같다) */
  setNightLift(value: number): void {
    this.body.setNightLift(value);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const bucket of this.buckets) {
      if (!bucket?.mesh) continue;
      this.group.remove(bucket.mesh);
      bucket.mesh.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    this.body.material.dispose();
    this.glow.dispose();
  }

  private bucketOf(index: number): Bucket {
    const found = this.buckets[index];
    if (found) return found;
    const geometry = this.geometries[index >> 1];
    if (!geometry) throw new RangeError(`unknown character shape: ${index >> 1}`);
    const bucket: Bucket = {
      geometry,
      material: (index & 1) === 1 ? this.glow : this.body.material,
      matrices: new Float32Array(START_CAPACITY * 16),
      colors: new Float32Array(START_CAPACITY * 3),
      capacity: START_CAPACITY,
      count: 0,
      mesh: null,
      meshCapacity: 0,
    };
    this.buckets[index] = bucket;
    return bucket;
  }

  /** 버퍼가 커졌으면 메시를 다시 만든다(인스턴스 속성은 크기를 바꿀 수 없다) */
  private rebuild(bucket: Bucket): void {
    if (bucket.mesh) {
      this.group.remove(bucket.mesh);
      bucket.mesh.dispose();
    }
    const mesh = new InstancedMesh(bucket.geometry, bucket.material, bucket.capacity);
    mesh.instanceMatrix = new InstancedBufferAttribute(bucket.matrices, 16).setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(bucket.colors, 3).setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    bucket.mesh = mesh;
    bucket.meshCapacity = bucket.capacity;
    this.group.add(mesh);
  }
}

function grow(bucket: Bucket): void {
  const capacity = bucket.capacity * 2;
  const matrices = new Float32Array(capacity * 16);
  matrices.set(bucket.matrices);
  const colors = new Float32Array(capacity * 3);
  colors.set(bucket.colors);
  bucket.matrices = matrices;
  bucket.colors = colors;
  bucket.capacity = capacity;
}
