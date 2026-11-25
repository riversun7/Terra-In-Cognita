// 게임형 3D 캐릭터(V2) PBR 재질 묶음 — 피부/사이버 쉘·의상·아머·브러시드 메탈·바이저 유리·네온 발광을 분리한다.
// CharacterLook(v2)의 5색(skin·primary·secondary·accent·glow)을 그대로 받아 질감과 반사만 게임 수준으로 끌어올린다.
import { CHARACTER_COLORS, type CharacterColorId, type CharacterLook } from "@terra/shared/characterLook";
import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from "three";
import { mixColor, shadeColor } from "../characterParts.ts";

/** 인간 피부 톤(매끄러운 새틴 피부 재질), 그 밖은 아노다이징 사이버 쉘 재질 */
const ORGANIC_SKIN_IDS: ReadonlySet<CharacterColorId> = new Set(["cream", "peach", "clay", "cocoa"]);

const STEEL_TINT = 0xd8e0ec;
const DARK_INK = 0x161e2e;
const LEATHER_TINT = 0x3b2c26;
const HORN_COLOR = 0xf2e6cc;

function hexOf(id: CharacterColorId): number {
  return Number.parseInt(CHARACTER_COLORS[id].slice(1), 16);
}

export interface HeroMaterialSet {
  readonly skin: MeshPhysicalMaterial;
  readonly skinShade: MeshStandardMaterial;
  readonly primary: MeshStandardMaterial;
  readonly primaryDark: MeshStandardMaterial;
  readonly primaryLight: MeshStandardMaterial;
  readonly armor: MeshPhysicalMaterial;
  readonly secondary: MeshStandardMaterial;
  readonly secondaryDark: MeshStandardMaterial;
  readonly hair: MeshStandardMaterial;
  readonly accent: MeshStandardMaterial;
  readonly accentDark: MeshStandardMaterial;
  readonly metal: MeshStandardMaterial;
  readonly metalDark: MeshStandardMaterial;
  readonly visor: MeshPhysicalMaterial;
  readonly glow: MeshStandardMaterial;
  readonly eyeWhite: MeshStandardMaterial;
  readonly eyePupil: MeshStandardMaterial;
  readonly eyeIris: MeshStandardMaterial;
  readonly leather: MeshStandardMaterial;
  readonly horn: MeshStandardMaterial;
  readonly ink: MeshStandardMaterial;
  dispose(): void;
}

export function createHeroMaterials(look: CharacterLook): HeroMaterialSet {
  const skinHex = hexOf(look.skin);
  const primaryHex = hexOf(look.primary);
  const secondaryHex = hexOf(look.secondary);
  const accentHex = hexOf(look.accent);
  const glowHex = shadeColor(hexOf(look.glow), 1.18);
  const organic = ORGANIC_SKIN_IDS.has(look.skin);

  const metalHex = mixColor(secondaryHex, STEEL_TINT, 0.65);
  const metalDarkHex = shadeColor(metalHex, 0.44);
  const leatherHex = mixColor(accentHex, LEATHER_TINT, 0.58);

  const skin = new MeshPhysicalMaterial({
    color: skinHex,
    roughness: organic ? 0.58 : 0.3,
    metalness: organic ? 0.03 : 0.36,
    clearcoat: organic ? 0.04 : 0.48,
    clearcoatRoughness: 0.25,
  });

  const skinShade = new MeshStandardMaterial({
    color: shadeColor(skinHex, 0.86),
    roughness: organic ? 0.62 : 0.36,
    metalness: organic ? 0.03 : 0.34,
  });

  const primary = new MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.54,
    metalness: 0.14,
  });

  const primaryDark = new MeshStandardMaterial({
    color: shadeColor(primaryHex, 0.68),
    roughness: 0.62,
    metalness: 0.12,
  });

  const primaryLight = new MeshStandardMaterial({
    color: shadeColor(primaryHex, 1.24),
    roughness: 0.46,
    metalness: 0.18,
  });

  const armor = new MeshPhysicalMaterial({
    color: primaryHex,
    roughness: 0.32,
    metalness: 0.46,
    clearcoat: 0.42,
    clearcoatRoughness: 0.22,
  });

  const secondary = new MeshStandardMaterial({
    color: secondaryHex,
    roughness: 0.66,
    metalness: 0.08,
  });

  const secondaryDark = new MeshStandardMaterial({
    color: shadeColor(secondaryHex, 0.62),
    roughness: 0.72,
    metalness: 0.1,
  });

  const hair = new MeshStandardMaterial({
    color: secondaryHex,
    roughness: 0.4,
    metalness: 0.14,
  });

  const accent = new MeshStandardMaterial({
    color: accentHex,
    roughness: 0.34,
    metalness: 0.44,
  });

  const accentDark = new MeshStandardMaterial({
    color: shadeColor(accentHex, 0.66),
    roughness: 0.44,
    metalness: 0.38,
  });

  const metal = new MeshStandardMaterial({
    color: metalHex,
    roughness: 0.24,
    metalness: 0.86,
  });

  const metalDark = new MeshStandardMaterial({
    color: metalDarkHex,
    roughness: 0.34,
    metalness: 0.78,
  });

  const visor = new MeshPhysicalMaterial({
    color: 0x0a1324,
    roughness: 0.08,
    metalness: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    emissive: new Color(glowHex),
    emissiveIntensity: 0.08,
  });

  const glow = new MeshStandardMaterial({
    color: glowHex,
    emissive: new Color(glowHex),
    emissiveIntensity: 2.1,
    roughness: 0.16,
    metalness: 0.1,
    toneMapped: false,
  });

  const eyeWhite = new MeshStandardMaterial({
    color: 0xf4f7fb,
    roughness: 0.2,
    metalness: 0.02,
  });

  const eyePupil = new MeshStandardMaterial({
    color: 0x0d1320,
    roughness: 0.14,
    metalness: 0.1,
  });

  const litEye = look.plating > 0 || !organic;
  const eyeIris = new MeshStandardMaterial({
    color: litEye ? glowHex : mixColor(accentHex, 0x223048, 0.42),
    emissive: new Color(litEye ? glowHex : 0x000000),
    emissiveIntensity: litEye ? 1.55 : 0,
    roughness: 0.18,
    metalness: 0.1,
  });

  const leather = new MeshStandardMaterial({
    color: leatherHex,
    roughness: 0.68,
    metalness: 0.12,
  });

  const horn = new MeshStandardMaterial({
    color: HORN_COLOR,
    roughness: 0.38,
    metalness: 0.06,
  });

  const ink = new MeshStandardMaterial({
    color: DARK_INK,
    roughness: 0.42,
    metalness: 0.48,
  });

  const all: Material[] = [
    skin,
    skinShade,
    primary,
    primaryDark,
    primaryLight,
    armor,
    secondary,
    secondaryDark,
    hair,
    accent,
    accentDark,
    metal,
    metalDark,
    visor,
    glow,
    eyeWhite,
    eyePupil,
    eyeIris,
    leather,
    horn,
    ink,
  ];

  return {
    skin,
    skinShade,
    primary,
    primaryDark,
    primaryLight,
    armor,
    secondary,
    secondaryDark,
    hair,
    accent,
    accentDark,
    metal,
    metalDark,
    visor,
    glow,
    eyeWhite,
    eyePupil,
    eyeIris,
    leather,
    horn,
    ink,
    dispose() {
      for (const material of all) material.dispose();
    },
  };
}
