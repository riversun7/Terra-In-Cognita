#!/usr/bin/env node
// [1회성 이관 스크립트 — 추후 이 파일 1개만 삭제하면 됨]
// 구형 AntiGravt01(terra-server/seeds/creature_seed.js + 이미지 자산)에서 91종 크리쳐 데이터와 대표 이미지를
// 현 프로젝트(content/core/creatures.json + apps/game/public/creatures/)로 변환·복사한다.
// 실행: node scripts/oneoff-import-creatures.mjs [AntiGravt01 경로]
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const srcRepo =
  process.argv[2] ??
  "/Users/ks-imac26/.gemini/antigravity-cli/brain/3d92ef77-61f1-41dd-bf4a-d4f7d656903f/scratch/AntiGravt01";

const seedPath = path.join(srcRepo, "terra-server/seeds/creature_seed.js");
const profilesDir = path.join(srcRepo, "terra-server/public/assets/images/creatures/profiles");
const clientCreaturesDir = path.join(srcRepo, "terra-client/public/assets/creatures");

const outImagesDir = path.resolve("apps/game/public/creatures");
const outJsonPath = path.resolve("content/core/creatures.json");

mkdirSync(outImagesDir, { recursive: true });

const { CREATURE_TEMPLATES } = require(seedPath);
const profileFiles = existsSync(profilesDir) ? readdirSync(profilesDir) : [];
const clientFiles = existsSync(clientCreaturesDir) ? readdirSync(clientCreaturesDir) : [];

const SUBSPECIES_BY_INDEX = [
  "sub_water",
  "sub_water",
  "sub_fire",
  "sub_fire",
  "sub_wind",
  "sub_wind",
  "sub_earth",
  "sub_earth",
  "sub_light",
  "sub_light",
  "sub_dark",
  "sub_dark",
];

const FOUR_GODS = new Set(["AZURE_DRAGON", "WHITE_TIGER", "VERMILION_BIRD", "BLACK_TORTOISE"]);
const BOSS_SPECIES = new Set([
  "ELDER_DRAGON",
  "TIDAL_KRAKEN",
  "BEHEMOTH",
  "BALOR",
  "LICH",
  "ANCIENT_GOLEM",
  "TYRANNOSAURUS",
  "SHOGGOTH",
  "HYDRA",
]);
const GIANT_3TILE = new Set([
  "ELDER_DRAGON",
  "TIDAL_KRAKEN",
  "BEHEMOTH",
  "WORLD_TREE_TREANT",
  "MAMMOTH",
  "BRACHIOSAURUS",
  "TYRANNOSAURUS",
  "LEVIATHAN",
  "AZURE_DRAGON",
  "BLACK_TORTOISE",
]);
const MH_HOMAGE = new Set([
  "RATHALOS",
  "LAGIACRUS",
  "ZINOGRE",
  "NARGACUGA",
  "TIGREX",
  "DIABLOS",
  "KIRIN",
  "RAJANG",
  "DEVILJHO",
  "KUSHALA",
]);
const DQ_FF = new Set([
  "SLIME",
  "METAL_SLIME",
  "KING_SLIME",
  "TONBERRY",
  "MALBORO",
  "CACTUAR",
  "BEHEMOTH",
  "CATOBLEPAS",
  "MIMIC",
]);
const GREEK_MYTH = new Set([
  "PEGASUS",
  "GRIFFON",
  "STORM_GRIFFON",
  "MINOTAUR",
  "CENTAUR",
  "HYDRA",
  "CHIMERA",
  "MANTICORE",
  "CERBERUS",
  "SPHINX",
  "HARPY",
  "MEDUSA",
]);

function pickImageFile(code) {
  const lower = code.toLowerCase();
  const profWebp = profileFiles.find((f) => f.toLowerCase() === `${lower}.webp`);
  if (profWebp) return { src: path.join(profilesDir, profWebp), name: `${code}.webp` };
  const profPng = profileFiles.find((f) => f.toLowerCase() === `${lower}.png`);
  if (profPng) return { src: path.join(profilesDir, profPng), name: `${code}.png` };

  for (const cand of [`${lower}.webp`, `${lower}_1.webp`, `${lower}.png`, `${lower}_1.png`]) {
    const found = clientFiles.find((f) => f.toLowerCase() === cand);
    if (found) {
      const ext = path.extname(found).toLowerCase();
      return { src: path.join(clientCreaturesDir, found), name: `${code}${ext}` };
    }
  }
  return null;
}

const WEAPON_NAMES_BY_CATEGORY = {
  beast: { ko: "야수의 송곳니와 발톱", en: "Beast Fang & Claw" },
  dragon: { ko: "용의 숨결과 발톱", en: "Dragon Breath & Talon" },
  aquatic: { ko: "심해의 아가리와 지느러미", en: "Abyssal Maw & Fin" },
  bird: { ko: "맹금의 발톱과 부리", en: "Raptor Talon & Beak" },
  insect: { ko: "갑충의 큰턱과 독침", en: "Chitin Mandible & Stinger" },
  undead: { ko: "망자의 원한 발톱", en: "Wraith Bone Claw" },
  humanoid: { ko: "전투 무구", en: "Tribal Warblade" },
  mythical: { ko: "신비의 뿔과 발톱", en: "Mythic Horn & Claw" },
  construct: { ko: "강철 파쇄 주먹", en: "Construct Crusher Fist" },
  dinosaur: { ko: "고대 폭룡의 턱과 꼬리", en: "Primeval Jaw & Tail" },
  elemental: { ko: "원소 핵 파동", en: "Elemental Core Pulse" },
  demon: { ko: "심연의 마조", en: "Infernal Demon Claw" },
  plant: { ko: "가시 덩굴 채찍", en: "Thorn Vine Lash" },
  aberration: { ko: "이계의 촉수", en: "Eldritch Tentacle" },
};

function mapOldDropItem(oldItem, category, grade) {
  const map = {
    RAW_LEATHER: "deer_hide",
    THICK_HIDE: "bison_hide",
    DRAGON_SCALE: "dragon_scale",
    DRAGON_HEART: "drakeheart_shard",
    FEATHER: "feather",
    GRIFFON_FEATHER: "gryphon_feather",
    UNICORN_HORN: "purifying_horn",
    MEAT: "raw_meat",
    PRIME_MEAT: "prime_beef",
    BONE: "hard_tusk",
    FANG: "croc_tooth",
    HORN: "bison_horn",
    FUR: "silver_fur",
    IRON_ORE: "iron_ore",
    GOLD_ORE: "gold_ore",
    MITHRIL: "mithril",
  };
  if (oldItem && map[oldItem]) return map[oldItem];
  if (category === "dragon")
    return grade === "legendary" || grade === "mythic" ? "dragon_scale" : "croc_hide";
  if (category === "bird") return grade === "common" ? "feather" : "gryphon_feather";
  if (category === "construct" || category === "elemental")
    return grade === "common" ? "iron_ore" : "mithril";
  if (category === "mythical") return "purifying_horn";
  if (category === "dinosaur" || category === "aquatic") return "croc_hide";
  if (category === "beast") return grade === "common" ? "deer_hide" : "bison_hide";
  return "raw_meat";
}

function buildDrops(raw, category, grade) {
  const result = [];
  const seen = new Set();
  const add = (item, chancePm, min, max) => {
    if (seen.has(item)) return;
    seen.add(item);
    result.push({ item, chancePm, min, max });
  };
  if (raw.drop_table) {
    try {
      const parsed = JSON.parse(raw.drop_table);
      for (const row of parsed) {
        const item = mapOldDropItem(row.item, category, grade);
        const chancePm = Math.max(10, Math.min(1000, Math.round((Number(row.prob) || 0.3) * 1000)));
        add(item, chancePm, Math.max(1, Number(row.min) || 1), Math.max(1, Number(row.max) || 2));
      }
    } catch {
      // ignore
    }
  }
  if (result.length === 0) {
    const primaryItem = mapOldDropItem(null, category, grade);
    add(primaryItem, grade === "common" ? 450 : 350, 1, 2);
    if (category === "dragon") add("dragon_meat", 250, 1, 1);
    else if (category === "beast" || category === "dinosaur") add("raw_meat", 500, 1, 3);
    else if (category === "bird") add("raptor_beak", 250, 1, 1);
    else if (category === "construct") add("copper_ore", 400, 1, 2);
  }
  return result;
}

function buildElements12(raw) {
  const water = Math.min(10, Math.max(0, Number(raw.elem_water) || 0));
  const fire = Math.min(10, Math.max(0, Number(raw.elem_fire) || 0));
  const wind = Math.min(10, Math.max(0, Number(raw.elem_wind) || 0));
  const earth = Math.min(10, Math.max(0, Number(raw.elem_earth) || 0));
  const light = Math.min(10, Math.max(0, Number(raw.elem_light) || 0));
  const dark = Math.min(10, Math.max(0, Number(raw.elem_dark) || 0));

  const code = raw.species_code;
  const frost = /FROST|ICE|YETI|MAMMOTH|WENDIGO/.test(code)
    ? Math.min(8, Math.max(2, Math.floor(water * 0.6)))
    : 0;
  const lightning = /THUNDER|STORM|STATIC|ZINOGRE|LAGIACRUS|KIRIN|AZURE/.test(code)
    ? Math.min(8, Math.max(2, Math.floor(wind * 0.6)))
    : 0;
  const crystal = /CRYSTAL|METAL|GOLEM|DIAMOND/.test(code)
    ? Math.min(8, Math.max(2, Math.floor(earth * 0.6)))
    : 0;
  const necro =
    raw.category === "undead" || /LICH|BANSHEE|WIGHT|ZOMBIE|SKELETON|DEATH/.test(code)
      ? Math.min(8, Math.max(2, Math.floor((dark || 4) * 0.6)))
      : 0;

  const arr = [
    water,
    fire,
    wind,
    earth,
    light,
    dark,
    crystal,
    crystal > 0 ? 2 : 0,
    frost,
    lightning,
    necro,
    0,
  ];
  let sum = arr.reduce((a, b) => a + b, 0);
  while (sum > 20) {
    let maxIdx = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > arr[maxIdx]) maxIdx = i;
    }
    arr[maxIdx] -= 1;
    sum -= 1;
  }
  return arr;
}

function buildSkills(raw, elements, maxSlots, isElementalAttack) {
  const links = [];
  const add = (skill, innate, unlockLevel) => {
    if (links.length >= maxSlots || links.some((x) => x.skill === skill)) return;
    links.push({
      skill,
      ...(innate ? { innate: true } : {}),
      ...(unlockLevel ? { unlockLevel } : {}),
    });
  };

  if (raw.base_str >= raw.base_int) {
    add("power_strike", true, undefined);
    if (raw.base_vit >= 12) add("shock_bash", false, 5);
    if (raw.size_class === "L" || raw.size_class === "XL") add("war_cry", false, 10);
    if (raw.base_vit >= 14) add("iron_skin", true, undefined);
  }

  if (isElementalAttack) {
    const [water, fire, wind, earth, light, dark, , , frost, lightning, necro] = elements;
    if (fire >= 4) add(fire >= 8 ? "flame_burst" : "fire_bolt", true, undefined);
    else if (water + frost >= 4) add("frost_bolt", true, undefined);
    else if (wind + lightning >= 4) add("chain_lightning", true, undefined);
    else if (earth >= 5) add("stone_spike", true, undefined);
    else if (light >= 4) {
      add("light_heal", true, undefined);
      add("radiant_ward", false, 8);
    } else if (dark + necro >= 4) {
      add("dark_curse", true, undefined);
    } else {
      add("fire_bolt", true, undefined);
    }
  }

  if (links.length === 0) add("power_strike", true, undefined);
  return links;
}

const entries = [];
let copiedImages = 0;

for (const raw of CREATURE_TEMPLATES) {
  const code = raw.species_code;
  const id = code.toLowerCase();
  const img = pickImageFile(code);
  let imageName;
  if (img) {
    const dest = path.join(outImagesDir, img.name);
    copyFileSync(img.src, dest);
    imageName = img.name;
    copiedImages += 1;
  }

  let grade = raw.rarity;
  if (FOUR_GODS.has(code)) grade = "mythic";
  else if (BOSS_SPECIES.has(code)) grade = "boss";
  else if (!["common", "rare", "epic", "boss", "legendary", "mythic"].includes(grade)) grade = "common";

  const size = ["S", "M", "L", "XL"].includes(raw.size_class) ? raw.size_class : "M";
  const giant3Tile = size === "XL" && GIANT_3TILE.has(code) ? true : undefined;
  const moveMode = (raw.move_mode || "WALK").toLowerCase();

  const tags = [];
  if (raw.base_str >= 13) tags.push("tendency_attack");
  if (raw.base_vit >= 13) tags.push("tendency_defense");
  if (raw.base_agi >= 12) tags.push("tendency_agile");
  if (raw.base_int >= 11 || raw.base_wis >= 11) tags.push("tendency_magic");
  if (
    (size === "L" || size === "XL") &&
    raw.base_agi >= 7 &&
    (raw.category === "beast" ||
      raw.category === "dragon" ||
      raw.category === "mythical" ||
      raw.category === "bird")
  ) {
    tags.push("tendency_mount");
  }
  if (FOUR_GODS.has(code)) tags.push("set_four_gods");
  if (MH_HOMAGE.has(code)) tags.push("set_mh_homage");
  if (DQ_FF.has(code)) tags.push("set_dq_ff");
  if (GREEK_MYTH.has(code)) tags.push("set_greek_myth");

  const elements = buildElements12(raw);
  const maxElemIdx = elements.reduce(
    (bestIdx, val, idx) => (val > (elements[bestIdx] ?? 0) ? idx : bestIdx),
    0,
  );
  const allowedSubspecies = [
    ...new Set(
      elements.map((val, idx) => (val >= 3 ? SUBSPECIES_BY_INDEX[idx] : null)).filter((v) => v !== null),
    ),
  ];

  const maxSlots = Math.max(2, Math.min(10, Number(raw.max_skill_slots) || 4));
  const baseSlots = Math.min(maxSlots, Math.max(2, Math.floor(maxSlots / 2)));

  const physBase = Math.max(
    8,
    Math.round(
      raw.base_str * 2.2 +
        (grade === "mythic"
          ? 28
          : grade === "legendary"
            ? 20
            : grade === "boss"
              ? 16
              : grade === "epic"
                ? 12
                : grade === "rare"
                  ? 6
                  : 2),
    ),
  );
  const physMin = Math.max(4, Math.round(physBase * 0.82));
  const physMax = Math.round(physBase * 1.28);

  const hasElemAttack =
    raw.base_int >= 8 ||
    raw.category === "dragon" ||
    raw.category === "elemental" ||
    raw.category === "mythical" ||
    raw.category === "demon" ||
    raw.category === "undead";
  const elemBase = Math.max(
    8,
    Math.round(raw.base_int * 2.2 + (grade === "mythic" ? 28 : grade === "legendary" ? 20 : 10)),
  );
  const elemMin = Math.max(4, Math.round(elemBase * 0.82));
  const elemMax = Math.round(elemBase * 1.28);

  const weaponNames = WEAPON_NAMES_BY_CATEGORY[raw.category] ?? { ko: "타고난 무기", en: "Natural Weapon" };
  const skillElementsPm = Array.from({ length: 12 }, (_, i) =>
    i === maxElemIdx && (elements[i] ?? 0) > 0 ? 50 : 0,
  );

  const appropriate =
    raw.base_int > raw.base_str && hasElemAttack
      ? "int"
      : raw.base_agi > raw.base_str
        ? "agi"
        : raw.base_dex > raw.base_str
          ? "dex"
          : "str";

  const naturalWeapon = {
    name: {
      ko: `${raw.name_ko}의 ${weaponNames.ko}`,
      en: `${raw.name_en}'s ${weaponNames.en}`,
    },
    appropriate,
    physical: {
      attack: physBase,
      min: physMin,
      max: physMax,
    },
    ...(hasElemAttack
      ? {
          elemental: {
            attack: elemBase,
            min: elemMin,
            max: elemMax,
          },
        }
      : {}),
    ...(skillElementsPm.some((v) => v > 0) ? { skillElementsPm } : {}),
    hitPm: Math.min(980, Math.max(780, 840 + raw.base_dex * 5)),
    critPm: Math.min(350, Math.max(40, 40 + raw.base_dex * 8)),
    intervalMs: Math.max(700, Math.min(2000, 1400 - raw.base_agi * 25)),
    range: moveMode === "fly" || hasElemAttack ? 3 : 1,
    arc: false,
    staminaCost: 10,
    ...(hasElemAttack ? { mpCost: 5 } : {}),
    stats: [
      {
        stat: "phys_defense",
        min: Math.max(5, raw.base_vit * 2),
        max: Math.max(15, raw.base_vit * 5),
      },
      {
        stat: "crit_damage_pm",
        min: 10,
        max: Math.max(40, raw.base_dex * 8),
      },
    ],
  };

  const skills = buildSkills(raw, elements, maxSlots, hasElemAttack);
  const drops = buildDrops(raw, raw.category, grade);

  entries.push({
    id,
    name: {
      ko: raw.name_ko,
      en: raw.name_en,
    },
    ...(raw.description
      ? {
          description: {
            ko: raw.description,
            en: `${raw.name_en} (${raw.category}, ${size}).`,
          },
        }
      : {}),
    category: raw.category,
    grade,
    size,
    ...(giant3Tile ? { giant3Tile: true } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(imageName ? { image: imageName } : {}),
    portraitCrop: {
      cxPm: 500,
      cyPm: size === "S" ? 450 : 340,
      radiusPm: size === "XL" ? 260 : 300,
    },
    primaries: {
      str: Math.max(1, Number(raw.base_str) || 5),
      dex: Math.max(1, Number(raw.base_dex) || 5),
      agi: Math.max(1, Number(raw.base_agi) || 5),
      vit: Math.max(1, Number(raw.base_vit) || 5),
      int: Math.max(1, Number(raw.base_int) || 5),
      wis: Math.max(1, Number(raw.base_wis) || 5),
    },
    elements,
    ...(allowedSubspecies.length > 0 ? { allowedSubspecies } : {}),
    skillSlots: {
      base: baseSlots,
      perRebirth: 1,
      max: maxSlots,
    },
    skills,
    naturalWeapon,
    drops,
    enabled: true,
  });
}

writeFileSync(outJsonPath, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");
console.log(
  `Converted ${entries.length} creatures to ${outJsonPath} and copied ${copiedImages} images to ${outImagesDir}`,
);
