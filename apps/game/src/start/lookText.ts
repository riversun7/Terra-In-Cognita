// 외형 단계 문구 표 — 외형 칸·부위·색·프리셋 ID → 메시지 키(ko·en). 키로 고르는 문구는 표에 적는다(oxlint import(namespace)).
// docs/adr/2026-11-11-character-3d.md 3절. 모르는 ID(더 새 서버)는 표 밖이라 ID로 보인다.
import type {
  CharacterColorId,
  CharacterColorSlot,
  CharacterLook,
  CharacterLookKey,
  CharacterPartSlot,
} from "@terra/shared/characterLook";
import { m } from "../paraglide/messages.js";

type Text = () => string;

const KEYS = {
  build: m.start_looks_slot_build,
  head: m.start_looks_slot_head,
  face: m.start_looks_slot_face,
  top: m.start_looks_slot_top,
  torso: m.start_looks_slot_torso,
  arms: m.start_looks_slot_arms,
  legs: m.start_looks_slot_legs,
  back: m.start_looks_slot_back,
  extra: m.start_looks_slot_extra,
  height: m.start_looks_slot_height,
  plating: m.start_looks_slot_plating,
  skin: m.start_looks_slot_skin,
  primary: m.start_looks_slot_primary,
  secondary: m.start_looks_slot_secondary,
  accent: m.start_looks_slot_accent,
  glow: m.start_looks_slot_glow,
} satisfies Record<CharacterLookKey, Text>;

/** 칸 이름(부위·키·장갑·색 칸) */
export const lookKeyText = (key: CharacterLookKey): string => KEYS[key]();
export const colorSlotText = (slot: CharacterColorSlot): string => KEYS[slot]();

const PARTS: { readonly [S in CharacterPartSlot]: Readonly<Record<CharacterLook[S], Text>> } = {
  build: {
    standard: m.start_looks_build_standard,
    compact: m.start_looks_build_compact,
    sturdy: m.start_looks_build_sturdy,
    slender: m.start_looks_build_slender,
  },
  head: {
    round: m.start_looks_head_round,
    block: m.start_looks_head_block,
    tall: m.start_looks_head_tall,
    wide: m.start_looks_head_wide,
    egg: m.start_looks_head_egg,
    dome: m.start_looks_head_dome,
    hex: m.start_looks_head_hex,
    jaw: m.start_looks_head_jaw,
  },
  face: {
    visor: m.start_looks_face_visor,
    eyes: m.start_looks_face_eyes,
    mono: m.start_looks_face_mono,
    grill: m.start_looks_face_grill,
    goggles: m.start_looks_face_goggles,
    mask: m.start_looks_face_mask,
    screen: m.start_looks_face_screen,
    slit: m.start_looks_face_slit,
  },
  top: {
    none: m.start_looks_top_none,
    short: m.start_looks_top_short,
    bob: m.start_looks_top_bob,
    spiky: m.start_looks_top_spiky,
    ponytail: m.start_looks_top_ponytail,
    mohawk: m.start_looks_top_mohawk,
    bun: m.start_looks_top_bun,
    cap: m.start_looks_top_cap,
    helm: m.start_looks_top_helm,
    hood: m.start_looks_top_hood,
    antenna: m.start_looks_top_antenna,
    crest: m.start_looks_top_crest,
    horns: m.start_looks_top_horns,
  },
  torso: {
    tunic: m.start_looks_torso_tunic,
    plate: m.start_looks_torso_plate,
    jacket: m.start_looks_torso_jacket,
    robe: m.start_looks_torso_robe,
    vest: m.start_looks_torso_vest,
    core: m.start_looks_torso_core,
    suit: m.start_looks_torso_suit,
    poncho: m.start_looks_torso_poncho,
  },
  arms: {
    plain: m.start_looks_arms_plain,
    sleeve: m.start_looks_arms_sleeve,
    piston: m.start_looks_arms_piston,
    gauntlet: m.start_looks_arms_gauntlet,
    claw: m.start_looks_arms_claw,
  },
  legs: {
    plain: m.start_looks_legs_plain,
    boots: m.start_looks_legs_boots,
    piston: m.start_looks_legs_piston,
    greaves: m.start_looks_legs_greaves,
    skirt: m.start_looks_legs_skirt,
  },
  back: {
    none: m.start_looks_back_none,
    pack: m.start_looks_back_pack,
    tank: m.start_looks_back_tank,
    cape: m.start_looks_back_cape,
    wings: m.start_looks_back_wings,
    array: m.start_looks_back_array,
    shield: m.start_looks_back_shield,
    jet: m.start_looks_back_jet,
  },
  extra: {
    none: m.start_looks_extra_none,
    scarf: m.start_looks_extra_scarf,
    pads: m.start_looks_extra_pads,
    belt: m.start_looks_extra_belt,
    collar: m.start_looks_extra_collar,
    badge: m.start_looks_extra_badge,
    sash: m.start_looks_extra_sash,
    lamp: m.start_looks_extra_lamp,
  },
};

const PLATING: readonly Text[] = [
  m.start_looks_plating_0,
  m.start_looks_plating_1,
  m.start_looks_plating_2,
  m.start_looks_plating_3,
];

const COLORS = {
  mint: m.start_color_mint,
  peach: m.start_color_peach,
  sky: m.start_color_sky,
  lilac: m.start_color_lilac,
  lemon: m.start_color_lemon,
  coral: m.start_color_coral,
  slate: m.start_color_slate,
  cream: m.start_color_cream,
  leaf: m.start_color_leaf,
  teal: m.start_color_teal,
  azure: m.start_color_azure,
  indigo: m.start_color_indigo,
  plum: m.start_color_plum,
  rose: m.start_color_rose,
  crimson: m.start_color_crimson,
  orange: m.start_color_orange,
  clay: m.start_color_clay,
  cocoa: m.start_color_cocoa,
  silver: m.start_color_silver,
  charcoal: m.start_color_charcoal,
} satisfies Record<CharacterColorId, Text>;

export const lookColorText = (id: CharacterColorId): string => COLORS[id]();

const isPartSlot = (key: CharacterLookKey): key is CharacterPartSlot => Object.hasOwn(PARTS, key);

/** 칸의 값 이름: 부위 = 부위 이름, 키 = "100%", 장갑 = 단계 이름, 색 = 색 이름 */
export function lookValueText(look: CharacterLook, key: CharacterLookKey): string {
  if (key === "height") return m.start_looks_height_value({ value: String(look.height) });
  if (key === "plating") return PLATING[look.plating]?.() ?? String(look.plating);
  if (isPartSlot(key)) {
    const table: Readonly<Record<string, Text>> = PARTS[key];
    return table[look[key]]?.() ?? look[key];
  }
  return lookColorText(look[key]);
}

const PRESETS: Readonly<Record<string, Text>> = {
  scout: m.start_preset_scout,
  guard: m.start_preset_guard,
  tinker: m.start_preset_tinker,
  drifter: m.start_preset_drifter,
  ranger: m.start_preset_ranger,
  medic: m.start_preset_medic,
  pilot: m.start_preset_pilot,
  miner: m.start_preset_miner,
  farmer: m.start_preset_farmer,
  merchant: m.start_preset_merchant,
  scholar: m.start_preset_scholar,
  mystic: m.start_preset_mystic,
  knight: m.start_preset_knight,
  raider: m.start_preset_raider,
  diver: m.start_preset_diver,
  courier: m.start_preset_courier,
  engineer: m.start_preset_engineer,
  sentinel: m.start_preset_sentinel,
  nomad: m.start_preset_nomad,
  envoy: m.start_preset_envoy,
  smith: m.start_preset_smith,
  hunter: m.start_preset_hunter,
  bard: m.start_preset_bard,
  warden: m.start_preset_warden,
};

export const lookPresetText = (id: string): string => PRESETS[id]?.() ?? id;
