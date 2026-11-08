// 크리처 편집기 화면 모델 — 담기(stage)·정리(clean)·3방향 다시 얹기(merge)·분류 이름표.
import type {
  CreatureCategory,
  CreatureEditorChange,
  CreatureGrade,
  CreatureJson,
  CreaturePresetTag,
  CreaturePrimaryCode,
  CreatureSize,
} from "@terra/shared/creatureEditor";
import { sameJson } from "../content/contentEditorModel.ts";

export type StagedCreature =
  | {
      readonly op: "put";
      readonly entry: CreatureJson;
      readonly base: CreatureJson | null;
      readonly baseHash: string | null;
    }
  | {
      readonly op: "revert";
      readonly base: CreatureJson;
      readonly baseHash: string;
    };

export interface CreatureStage {
  readonly creatures: ReadonlyMap<string, StagedCreature>;
  readonly discard: ReadonlySet<string>;
}

export const EMPTY_CREATURE_STAGE: CreatureStage = {
  creatures: new Map(),
  discard: new Set(),
};

/** 빈 선택 칸·빈 배열을 정리해 팩 스키마와 같은 모양으로 맞춘다 */
export function cleanCreature(entry: CreatureJson): CreatureJson {
  const koDesc = entry.description?.ko.trim() ?? "";
  const enDesc = entry.description?.en.trim() ?? "";
  const hasDesc = koDesc !== "" && enDesc !== "";
  const tags = entry.tags ? [...new Set(entry.tags.filter((t) => t.trim() !== ""))] : [];
  const skills = entry.skills ? entry.skills.filter((s) => s.skill.trim() !== "") : [];
  const drops = entry.drops ? entry.drops.filter((d) => d.item.trim() !== "") : [];
  const allowedSubspecies = entry.allowedSubspecies ? [...new Set(entry.allowedSubspecies)] : [];
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    ...(hasDesc ? { description: { ko: koDesc, en: enDesc } } : {}),
    category: entry.category,
    grade: entry.grade,
    size: entry.size,
    ...(entry.size === "XL" && entry.giant3Tile === true ? { giant3Tile: true } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(entry.image && entry.image.trim() !== "" ? { image: entry.image.trim() } : {}),
    ...(entry.portraitCrop ? { portraitCrop: { ...entry.portraitCrop } } : {}),
    primaries: { ...entry.primaries },
    elements: [...entry.elements],
    ...(entry.resistPm ? { resistPm: [...entry.resistPm] } : {}),
    ...(allowedSubspecies.length > 0 ? { allowedSubspecies } : {}),
    skillSlots: { ...entry.skillSlots },
    ...(skills.length > 0 ? { skills: skills.map((s) => ({ ...s })) } : {}),
    ...(entry.naturalWeapon ? { naturalWeapon: { ...entry.naturalWeapon } } : {}),
    ...(drops.length > 0 ? { drops: drops.map((d) => ({ ...d })) } : {}),
    ...(entry.unitKind && entry.unitKind.trim() !== "" ? { unitKind: entry.unitKind.trim() } : {}),
    enabled: entry.enabled,
  };
}

/** 3방향 다시 얹기(entry_changed 뒤): 내 바꿈을 새 실효 항목 위로 얹는다 */
export function mergeCreature(
  base: CreatureJson,
  mine: CreatureJson,
  theirs: CreatureJson,
): { entry: CreatureJson; conflicts: string[] } {
  const conflicts: string[] = [];
  const pick = <K extends keyof CreatureJson>(key: K): CreatureJson[K] => {
    if (sameJson(base[key], mine[key])) return theirs[key];
    if (!sameJson(base[key], theirs[key]) && !sameJson(mine[key], theirs[key])) conflicts.push(key);
    return mine[key];
  };
  const entry = cleanCreature({
    id: theirs.id,
    name: pick("name"),
    description: pick("description"),
    category: pick("category"),
    grade: pick("grade"),
    size: pick("size"),
    giant3Tile: pick("giant3Tile"),
    tags: pick("tags"),
    image: pick("image"),
    portraitCrop: pick("portraitCrop"),
    primaries: pick("primaries"),
    elements: pick("elements"),
    resistPm: pick("resistPm"),
    allowedSubspecies: pick("allowedSubspecies"),
    skillSlots: pick("skillSlots"),
    skills: pick("skills"),
    naturalWeapon: pick("naturalWeapon"),
    drops: pick("drops"),
    unitKind: pick("unitKind"),
    enabled: pick("enabled"),
  });
  return { entry, conflicts };
}

export function stageCreature(stage: CreatureStage, id: string, next: StagedCreature | null): CreatureStage {
  const creatures = new Map(stage.creatures);
  if (next === null) creatures.delete(id);
  else creatures.set(id, next);
  return { ...stage, creatures };
}

export function stageCreatureDiscard(stage: CreatureStage, id: string, on: boolean): CreatureStage {
  const discard = new Set(stage.discard);
  if (on) discard.add(id);
  else discard.delete(id);
  return { ...stage, discard };
}

export function creatureStageKeys(stage: CreatureStage): string[] {
  return [
    ...[...stage.creatures.keys()].toSorted(),
    ...[...stage.discard].toSorted().map((id) => `sleeping/${id}`),
  ];
}

export function creatureChangesOf(stage: CreatureStage): CreatureEditorChange[] {
  const puts: CreatureEditorChange[] = [...stage.creatures.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, item]): CreatureEditorChange =>
        item.op === "revert"
          ? { op: "revert", id, baseHash: item.baseHash }
          : { op: "put", entry: item.entry, baseHash: item.baseHash },
    );
  const discards: CreatureEditorChange[] = [...stage.discard]
    .toSorted()
    .map((id) => ({ op: "discard_sleeping", id }));
  return [...puts, ...discards];
}

/** 새 크리처 기본 템플릿 */
export function createDefaultCreature(id: string, image?: string): CreatureJson {
  return {
    id,
    name: { ko: id, en: id },
    description: { ko: "새 크리처 설명", en: "New creature description" },
    category: "beast",
    grade: "common",
    size: "M",
    tags: ["tendency_attack"],
    ...(image ? { image } : {}),
    portraitCrop: { cxPm: 500, cyPm: 360, radiusPm: 320 },
    primaries: { str: 12, dex: 10, agi: 11, vit: 11, int: 6, wis: 7 },
    elements: [0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    skillSlots: { base: 2, perRebirth: 1, max: 5 },
    naturalWeapon: {
      name: { ko: `${id} 고유 무기`, en: `${id} Natural Weapon` },
      appropriate: "str",
      physical: { attack: 24, min: 19, max: 31 },
      hitPm: 900,
      critPm: 60,
      intervalMs: 1400,
      range: 1,
      staminaCost: 5,
    },
    drops: [],
    enabled: true,
  };
}

export const CATEGORY_LABELS: Readonly<
  Record<CreatureCategory, { readonly ko: string; readonly en: string }>
> = {
  beast: { ko: "야수 (Beast)", en: "Beast" },
  dragon: { ko: "드래곤 (Dragon)", en: "Dragon" },
  aquatic: { ko: "수생 (Aquatic)", en: "Aquatic" },
  bird: { ko: "조류 (Bird)", en: "Bird" },
  insect: { ko: "곤충·절지 (Insect)", en: "Insect" },
  undead: { ko: "언데드 (Undead)", en: "Undead" },
  humanoid: { ko: "인간형 (Humanoid)", en: "Humanoid" },
  mythical: { ko: "환수·신화 (Mythical)", en: "Mythical" },
  construct: { ko: "골렘·기계 (Construct)", en: "Construct" },
  dinosaur: { ko: "공룡·고대종 (Dinosaur)", en: "Dinosaur" },
  elemental: { ko: "정령 (Elemental)", en: "Elemental" },
  demon: { ko: "악마·마족 (Demon)", en: "Demon" },
  plant: { ko: "식물 (Plant)", en: "Plant" },
  aberration: { ko: "이형·괴수 (Aberration)", en: "Aberration" },
};

export const GRADE_LABELS: Readonly<Record<CreatureGrade, { readonly ko: string; readonly en: string }>> = {
  common: { ko: "일반 (Common)", en: "Common" },
  rare: { ko: "희귀 (Rare)", en: "Rare" },
  epic: { ko: "영웅 (Epic)", en: "Epic" },
  boss: { ko: "보스 (Boss)", en: "Boss" },
  legendary: { ko: "전설 (Legendary)", en: "Legendary" },
  mythic: { ko: "신수 (Mythic)", en: "Mythic" },
};

export const SIZE_LABELS: Readonly<Record<CreatureSize, { readonly ko: string; readonly en: string }>> = {
  S: { ko: "소형 (S)", en: "Small (S)" },
  M: { ko: "중형 (M)", en: "Medium (M)" },
  L: { ko: "대형 (L · 탑승 가능)", en: "Large (L · Mountable)" },
  XL: { ko: "초대형 (XL · 거대 크리처)", en: "Extra Large (XL · Giant)" },
};

export const PRESET_TAG_LABELS: Readonly<
  Record<CreaturePresetTag, { readonly ko: string; readonly en: string }>
> = {
  tendency_attack: { ko: "성향: 공격형", en: "Tendency: Attack" },
  tendency_defense: { ko: "성향: 방어·탱커형", en: "Tendency: Defense" },
  tendency_agile: { ko: "성향: 민첩·속공형", en: "Tendency: Agile" },
  tendency_mount: { ko: "성향: 탑승·기동형", en: "Tendency: Mount" },
  tendency_magic: { ko: "성향: 마법·원소형", en: "Tendency: Magic" },
  tendency_production: { ko: "성향: 생산·작업형", en: "Tendency: Production" },
  set_zodiac_12: { ko: "세트: 12지신 (동양)", en: "Set: 12 Eastern Zodiac" },
  set_horoscope_12: { ko: "세트: 황도 12궁 (서양)", en: "Set: 12 Horoscope" },
  set_four_gods: { ko: "세트: 사신수 (청룡·백호·주작·현무)", en: "Set: Four Guardian Gods" },
  set_mh_homage: { ko: "세트: 수렵 오마주", en: "Set: Monster Hunter Homage" },
  set_dq_ff: { ko: "세트: JRPG 오마주", en: "Set: Classic JRPG Homage" },
  set_greek_myth: { ko: "세트: 그리스·북유럽 신화", en: "Set: Greek & Norse Myth" },
  set_ancient_dino: { ko: "세트: 고대 공룡·화석", en: "Set: Ancient Dinosaurs" },
};

export const STAT_LABELS: Readonly<
  Record<CreaturePrimaryCode, { readonly ko: string; readonly en: string }>
> = {
  str: { ko: "힘 (STR)", en: "STR" },
  dex: { ko: "솜씨 (DEX)", en: "DEX" },
  agi: { ko: "민첩 (AGI)", en: "AGI" },
  vit: { ko: "체력 (VIT)", en: "VIT" },
  int: { ko: "지능 (INT)", en: "INT" },
  wis: { ko: "지혜 (WIS)", en: "WIS" },
};

export const ELEMENT_LABELS: readonly {
  readonly id: string;
  readonly ko: string;
  readonly en: string;
  readonly color: string;
}[] = [
  { id: "water", ko: "물 (Water)", en: "Water", color: "#38bdf8" },
  { id: "fire", ko: "불 (Fire)", en: "Fire", color: "#f97316" },
  { id: "wind", ko: "바람 (Wind)", en: "Wind", color: "#34d399" },
  { id: "earth", ko: "땅 (Earth)", en: "Earth", color: "#d97706" },
  { id: "light", ko: "빛 (Light)", en: "Light", color: "#facc15" },
  { id: "dark", ko: "어둠 (Dark)", en: "Dark", color: "#a855f7" },
  { id: "wood", ko: "나무 (Wood)", en: "Wood", color: "#22c55e" },
  { id: "metal", ko: "금속 (Metal)", en: "Metal", color: "#94a3b8" },
  { id: "ice", ko: "얼음 (Ice)", en: "Ice", color: "#67e8f9" },
  { id: "lightning", ko: "번개 (Lightning)", en: "Lightning", color: "#eab308" },
  { id: "poison", ko: "독 (Poison)", en: "Poison", color: "#c084fc" },
  { id: "acid", ko: "산 (Acid)", en: "Acid", color: "#a3e635" },
];
