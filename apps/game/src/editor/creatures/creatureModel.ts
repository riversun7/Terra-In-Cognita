// 크리처 편집기 화면 모델 — 담기(stage)·정리(clean)·3방향 다시 얹기(merge)·분류 이름표.
import type { ElementCode } from "@terra/shared/roster";
import {
  CREATURE_PRIMARY_CODES,
  type CreatureClassJson,
  type CreatureEditorChange,
  type CreatureEditorListResponse,
  type CreatureStatTendency,
  allocateCreatureStats,
  creatureGroupRootId,
  type CreatureGrade,
  type CreatureJson,
  type CreaturePresetTag,
  type CreaturePrimaryCode,
  type CreatureSize,
  creatureDefaultSpread,
  creatureMainElement,
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

/** 담은 분류 바꿈: 넣기·고치기(put) 또는 지우기·팩 원본으로(revert) */
export type StagedClass =
  | {
      readonly op: "put";
      readonly entry: CreatureClassJson;
      readonly base: CreatureClassJson | null;
      readonly baseHash: string | null;
    }
  | { readonly op: "revert"; readonly base: CreatureClassJson; readonly baseHash: string };

export interface CreatureStage {
  readonly creatures: ReadonlyMap<string, StagedCreature>;
  readonly discard: ReadonlySet<string>;
  /** 분류 트리 바꿈(크리쳐와 한 묶음으로 적용한다) */
  readonly classes: ReadonlyMap<string, StagedClass>;
}

export const EMPTY_CREATURE_STAGE: CreatureStage = {
  creatures: new Map(),
  discard: new Set(),
  classes: new Map(),
};

/** 분류 한 줄을 팩 모양으로 정리한다(빈 그림 글자·자기 자신을 가리키는 위 분류는 뺀다) */
export function cleanClass(entry: CreatureClassJson): CreatureClassJson {
  const icon = entry.icon?.trim() ?? "";
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    ...(entry.parent !== undefined && entry.parent !== entry.id ? { parent: entry.parent } : {}),
    ...(icon === "" ? {} : { icon }),
  };
}

export function stageClass(stage: CreatureStage, id: string, next: StagedClass | null): CreatureStage {
  const classes = new Map(stage.classes);
  if (next === null) classes.delete(id);
  else classes.set(id, next);
  return { ...stage, classes };
}

/** 분류 한 줄: 실효 값(담은 바꿈을 얹은 것)과 표시 */
export interface CombinedClass {
  readonly entry: CreatureClassJson;
  /** 그 세계에서 만든 분류(지울 수 있다)·아직 적용하지 않은 새 분류 */
  readonly created: boolean;
  readonly isNew: boolean;
  readonly isStaged: boolean;
}

/** 실효 분류 트리 + 담은 바꿈(지우기로 담은 것은 뺀다, 새 분류는 뒤) */
export function combinedClasses(list: CreatureEditorListResponse, stage: CreatureStage): CombinedClass[] {
  const out: CombinedClass[] = [];
  const existing = new Set<string>();
  for (const row of list.classes) {
    existing.add(row.entry.id);
    const staged = stage.classes.get(row.entry.id);
    if (staged?.op === "revert" && row.origin === "created") continue;
    out.push({
      entry:
        staged?.op === "put" ? staged.entry : staged?.op === "revert" ? (row.pack ?? row.entry) : row.entry,
      created: row.origin === "created",
      isNew: false,
      isStaged: staged !== undefined,
    });
  }
  for (const [id, staged] of stage.classes) {
    if (!existing.has(id) && staged.op === "put")
      out.push({ entry: staged.entry, created: true, isNew: true, isStaged: true });
  }
  return out;
}

/** 빈 선택 칸·빈 배열을 정리해 팩 스키마와 같은 모양으로 맞춘다 */
export function cleanCreature(entry: CreatureJson): CreatureJson {
  const koDesc = entry.description?.ko.trim() ?? "";
  const enDesc = entry.description?.en.trim() ?? "";
  const hasDesc = koDesc !== "" && enDesc !== "";
  const tags = entry.tags ? [...new Set(entry.tags.filter((t) => t.trim() !== ""))] : [];
  const skills = entry.skills ? entry.skills.filter((s) => s.skill.trim() !== "") : [];
  const drops = entry.drops ? entry.drops.filter((d) => d.item.trim() !== "") : [];
  const allowedSubspecies = entry.allowedSubspecies ? [...new Set(entry.allowedSubspecies)] : [];
  // 오차가 여섯 칸 모두 기본 규칙과 같으면 적지 않는다(기준값을 바꾸면 오차도 기본 규칙을 따라간다)
  const spread =
    entry.primarySpread &&
    CREATURE_PRIMARY_CODES.some(
      (code) => entry.primarySpread?.[code] !== creatureDefaultSpread(entry.primaries[code]),
    )
      ? { ...entry.primarySpread }
      : null;
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
    ...(entry.model && entry.model.trim() !== "" ? { model: entry.model.trim() } : {}),
    ...(entry.variantOf && entry.variantOf !== entry.id ? { variantOf: entry.variantOf } : {}),
    primaries: { ...entry.primaries },
    ...(spread ? { primarySpread: spread } : {}),
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
    model: pick("model"),
    variantOf: pick("variantOf"),
    primaries: pick("primaries"),
    primarySpread: pick("primarySpread"),
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
    ...[...stage.classes.keys()].toSorted().map((id) => `class/${id}`),
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
  // 분류가 먼저다(크리쳐가 새 분류를 가리킬 수 있다 — 서버는 묶음 전체를 한 번에 본다)
  const classes: CreatureEditorChange[] = [...stage.classes.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, item]): CreatureEditorChange =>
        item.op === "revert"
          ? { op: "revert_class", id, baseHash: item.baseHash }
          : { op: "put_class", entry: item.entry, baseHash: item.baseHash },
    );
  return [...classes, ...puts, ...discards];
}

/** 목록 한 줄: 실효 항목(담은 바꿈을 얹은 것)과 담김 표시 */
export interface CombinedCreature {
  readonly entry: CreatureJson;
  readonly isStaged: boolean;
  readonly isNew: boolean;
  readonly isReverting: boolean;
}

/** 실효 목록 + 아직 적용하지 않은 새 크리쳐(앞쪽) — 도감 탭과 상세 탭 목록이 같이 쓴다 */
export function combinedCreatures(
  list: CreatureEditorListResponse,
  stage: CreatureStage,
): CombinedCreature[] {
  const existing = new Set(list.creatures.map((row) => row.entry.id));
  const created: CombinedCreature[] = [];
  for (const [id, staged] of stage.creatures) {
    if (!existing.has(id) && staged.op === "put")
      created.push({ entry: staged.entry, isStaged: true, isNew: true, isReverting: false });
  }
  return [
    ...created,
    ...list.creatures.map((row): CombinedCreature => {
      const staged = stage.creatures.get(row.entry.id);
      return {
        entry: staged?.op === "put" ? staged.entry : row.entry,
        isStaged: staged !== undefined,
        isNew: false,
        isReverting: staged?.op === "revert",
      };
    }),
  ];
}

/** 변종을 만들 때 원본에서 무엇을 바꿀까: 그대로 복제·주속성 바꿈·스탯 성향 바꿈 */
export type VariantChange =
  | { readonly kind: "copy" }
  | { readonly kind: "element"; readonly element: number }
  | { readonly kind: "stats"; readonly tendency: CreatureStatTendency };

function swapAt(list: readonly number[] | undefined, a: number, b: number): number[] | undefined {
  if (!list) return undefined;
  const next = [...list];
  const left = next[a] ?? 0;
  next[a] = next[b] ?? 0;
  next[b] = left;
  return next;
}

/**
 * 원본을 복제해 그룹(rootId)의 변종을 만든다(docs/adr/2026-11-25-creature-codex-groups.md 2절).
 * - 속성 변종: 주속성 칸과 고른 속성 칸을 맞바꾼다(속성 점수·저항·고유 무기 속성 계수 모두). 주속성이 없으면 고른 칸에 5점.
 * - 스탯 변종: 같은 합을 고른 성향으로 다시 나눈다(성향 태그도 바꾸고, 오차는 기본 규칙으로 돌린다).
 */
export function variantFrom(
  source: CreatureJson,
  rootId: string,
  id: string,
  name: { readonly ko: string; readonly en: string },
  change: VariantChange,
): CreatureJson {
  let next: CreatureJson = { ...source, id, name, variantOf: rootId };
  if (change.kind === "element") {
    const main = mainElementIndex(source.elements);
    if (main === null) {
      const elements = [...source.elements];
      elements[change.element] = 5;
      next = { ...next, elements };
    } else if (main !== change.element) {
      const swap = (list: readonly number[] | undefined) => swapAt(list, main, change.element);
      const weapon = source.naturalWeapon;
      next = {
        ...next,
        elements: swap(source.elements) ?? [...source.elements],
        resistPm: swap(source.resistPm),
        naturalWeapon: weapon
          ? {
              ...weapon,
              skillElementsPm: swap(weapon.skillElementsPm),
              physical: weapon.physical
                ? { ...weapon.physical, elementsPm: swap(weapon.physical.elementsPm) }
                : undefined,
              elemental: weapon.elemental
                ? { ...weapon.elemental, elementsPm: swap(weapon.elemental.elementsPm) }
                : undefined,
            }
          : undefined,
      };
    }
  }
  if (change.kind === "stats") {
    const sum = CREATURE_PRIMARY_CODES.reduce((acc, code) => acc + source.primaries[code], 0);
    next = {
      ...next,
      primaries: allocateCreatureStats({
        grade: source.grade,
        size: source.size,
        tendency: change.tendency,
        customBudget: sum,
      }),
      primarySpread: undefined,
      tags: [change.tendency, ...(source.tags ?? []).filter((tag) => !tag.startsWith("tendency_"))],
    };
  }
  return cleanCreature(next);
}

/** 그룹의 대표를 id로 바꾼다: 바뀌는 항목만 돌려준다(새 대표는 variantOf를 지우고, 옛 대표·다른 변종은 새 대표를 가리킨다) */
export function promoteToRoot(all: readonly CreatureJson[], id: string): CreatureJson[] {
  const target = all.find((entry) => entry.id === id);
  if (!target?.variantOf) return [];
  const oldRoot = target.variantOf;
  return all
    .filter((entry) => creatureGroupRootId(entry) === oldRoot)
    .map((entry) =>
      entry.id === id
        ? cleanCreature({ ...entry, variantOf: undefined })
        : cleanCreature({ ...entry, variantOf: id }),
    );
}

/** ID 글자 → 색 고르기 씨앗(임시 3D 몸) */
export function seedOfId(id: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16_777_619);
  return hash >>> 0;
}

/** 임시 3D 몸의 크기 배율(크기 등급) */
export const SIZE_PREVIEW_SCALE: Readonly<Record<CreatureSize, number>> = { S: 0.5, M: 0.8, L: 1.2, XL: 2 };

/** 새 크리처 기본 템플릿 */
export function createDefaultCreature(id: string, image?: string, category = "beast"): CreatureJson {
  return {
    id,
    name: { ko: id, en: id },
    description: { ko: "새 크리처 설명", en: "New creature description" },
    category,
    grade: "common",
    size: "M",
    tags: ["tendency_attack"],
    ...(image ? { image } : {}),
    portraitCrop: { cxPm: 500, cyPm: 360, radiusPm: 320 },
    primaries: { str: 12, dex: 10, agi: 11, vit: 11, int: 6, wis: 7 },
    elements: [0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0],
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

/** 주속성 칸(강화형은 2배로 센다, D-5015) — @terra/shared creatureMainElement */
export const mainElementIndex = creatureMainElement;

/**
 * 12속성 이름표 — 차례는 판정 코드의 속성 칸과 같다(@terra/shared ELEMENT_CODES: 짝수 칸 = 기본, 홀수 칸 = 그 계열의 강화형).
 * 색은 기획 시그니처 색(50_Content_Rules §3.2)을 어두운·밝은 개발 화면 둘에서 읽히게 고른 값이다(세계 색, 테마와 상관없다).
 * 아이콘은 ui/elementIcons.tsx(code)
 */
export const ELEMENT_LABELS: readonly {
  readonly id: ElementCode;
  readonly ko: string;
  readonly en: string;
  readonly color: string;
  readonly enhanced: boolean;
}[] = [
  { id: "water", ko: "물", en: "Water", color: "#38a8f0", enhanced: false },
  { id: "frost", ko: "빙결", en: "Frost", color: "#4fd1c5", enhanced: true },
  { id: "fire", ko: "불", en: "Fire", color: "#f2603c", enhanced: false },
  { id: "blaze", ko: "폭렬", en: "Blaze", color: "#e11d48", enhanced: true },
  { id: "wind", ko: "바람", en: "Wind", color: "#34b56a", enhanced: false },
  { id: "lightning", ko: "번개", en: "Lightning", color: "#d4a80a", enhanced: true },
  { id: "earth", ko: "땅", en: "Earth", color: "#a8742c", enhanced: false },
  { id: "crystal", ko: "크리스탈", en: "Crystal", color: "#a855f7", enhanced: true },
  { id: "light", ko: "빛", en: "Light", color: "#e0a81c", enhanced: false },
  { id: "holy", ko: "성", en: "Holy", color: "#8b9bb8", enhanced: true },
  { id: "dark", ko: "어둠", en: "Dark", color: "#8b7fd6", enhanced: false },
  { id: "necro", ko: "사령", en: "Necro", color: "#14a39a", enhanced: true },
];
