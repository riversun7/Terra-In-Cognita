// 자원 분포 레이어 텍스처 — 서버 자원 분포 지도(원자재 하나, 면 레벨 격자)를 타일 셰이더가 함께 쓰는 배열 텍스처로 올린다.
// 타일마다 따로 받지 않는다: 지도 하나를 모든 타일 재질이 같은 uniform 객체로 읽는다(타일 파이프라인·타일 형식은 그대로).
// 메모리: 면 레벨 9 = 면마다 512² → R8 1.5MB(밉맵 포함 약 2MB). 광석은 높은 티어 몫 한 장 더. 지도를 바꾸면 옛 텍스처를 바로 버린다.
import type { Texture } from "three";
import { RESOURCE_COLORS } from "./layerColors.ts";
import { type SharedTileUniforms, createEmptyLayerTexture, createLayerTexture } from "./planetMaterials.ts";
import type { PlanetResourceMap } from "./planetTypes.ts";

/** 받는 격자 면 레벨 상한(서버 RESOURCE_MAP_MAX_LEVEL과 같다 — 면마다 512²) */
export const RESOURCE_MAP_MAX_LEVEL = 9;

/** 밉맵까지 센 텍스처 바이트(R8 한 장 = 한 변² × 면 6 × 4/3) */
const layerBytes = (size: number): number => Math.ceil((size * size * 6 * 4) / 3);

/** 지도 모양이 틀린 이유(문장, 화면에 쓰지 않는다). 맞으면 null */
export function resourceMapProblem(map: PlanetResourceMap): string | null {
  if (!(Number.isInteger(map.level) && map.level >= 0 && map.level <= RESOURCE_MAP_MAX_LEVEL)) {
    return `resource map level must be in [0, ${RESOURCE_MAP_MAX_LEVEL}]: ${map.level}`;
  }
  const cells = 6 * (1 << map.level) * (1 << map.level);
  if (map.share.length !== cells)
    return `resource map share has ${map.share.length} cells, expected ${cells}`;
  if (map.high && map.high.length !== cells)
    return `resource map high has ${map.high.length} cells, expected ${cells}`;
  if (!(map.material in RESOURCE_COLORS)) return `unknown resource material: ${map.material}`;
  return null;
}

/** 자원 분포 텍스처 주인: 셰이더 uniform(uResource·uResourceHigh·uResourceColor·uResourceReady)을 바꾸고 옛 텍스처를 버린다 */
export class ResourceLayer {
  private bytes = 0;
  constructor(private readonly shared: SharedTileUniforms) {}

  /** 지도를 올린다(null이거나 틀리면 버리고 흐린 바탕만). 올린 지도의 텍스처 바이트를 돌려준다 */
  apply(map: PlanetResourceMap | null): number {
    this.release();
    if (!map || resourceMapProblem(map)) return 0;
    const size = 1 << map.level;
    this.shared.uResource.value = createLayerTexture(map.share, size, 6);
    this.shared.uResourceHigh.value = map.high
      ? createLayerTexture(map.high, size, 6)
      : createEmptyLayerTexture();
    const color = RESOURCE_COLORS[map.material];
    this.shared.uResourceColor.value.set(
      ((color >> 16) & 0xff) / 255,
      ((color >> 8) & 0xff) / 255,
      (color & 0xff) / 255,
    );
    this.shared.uResourceReady.value = 1;
    this.bytes = layerBytes(size) * (map.high ? 2 : 1);
    return this.bytes;
  }

  get textureBytes(): number {
    return this.bytes;
  }

  /** 지금 텍스처를 버리고 빈 텍스처로 */
  release(): void {
    const old: Texture[] = [this.shared.uResource.value, this.shared.uResourceHigh.value];
    this.shared.uResource.value = createEmptyLayerTexture();
    this.shared.uResourceHigh.value = createEmptyLayerTexture();
    this.shared.uResourceReady.value = 0;
    for (const texture of old) texture.dispose();
    this.bytes = 0;
  }
}
