import { describe, expect, it } from "vitest";
import {
  CHARACTER_COLORS,
  CHARACTER_COLOR_IDS,
  CHARACTER_HEIGHT,
  CHARACTER_LOOK_KEYS,
  CHARACTER_PARTS,
  CHARACTER_PLATING_MAX,
  CHARACTER_PRESETS,
  type CharacterLook,
  type CharacterLookKey,
  DEFAULT_CHARACTER_LOOK,
  characterLookChoices,
  characterLookForUnit,
  characterLookFromLegacy,
  characterLookKey,
  characterSeedOf,
  isCharacterLook,
  randomCharacterLook,
  rerollCharacterLook,
  sameCharacterLook,
  stepCharacterLook,
} from "./characterLook.ts";
import {
  CYBORG_COLORS,
  type CyborgAppearance,
  DEFAULT_CYBORG_APPEARANCE,
  isCyborgAppearance,
} from "./cyborgLooks.ts";

describe("character look (3D 외형 2판)", () => {
  it("목록 크기: 머리 8·얼굴 8·머리 장식 12 이상, 몸통 6 이상, 팔·다리 4 이상, 장식 6 이상, 색 16 이상, 프리셋 24 이상", () => {
    expect(CHARACTER_PARTS.head.length).toBeGreaterThanOrEqual(8);
    expect(CHARACTER_PARTS.face.length).toBeGreaterThanOrEqual(8);
    expect(CHARACTER_PARTS.top.length).toBeGreaterThanOrEqual(12);
    expect(CHARACTER_PARTS.torso.length).toBeGreaterThanOrEqual(6);
    expect(CHARACTER_PARTS.arms.length).toBeGreaterThanOrEqual(4);
    expect(CHARACTER_PARTS.legs.length).toBeGreaterThanOrEqual(4);
    // 장식 = 등 + 덧장식("없음" 빼고)
    expect(CHARACTER_PARTS.back.length - 1 + CHARACTER_PARTS.extra.length - 1).toBeGreaterThanOrEqual(6);
    expect(CHARACTER_COLOR_IDS.length).toBeGreaterThanOrEqual(16);
    expect(CHARACTER_PRESETS.length).toBeGreaterThanOrEqual(24);
  });

  it("색 ID 차례는 색 표의 열쇠와 같고, 옛 색 8개는 값이 그대로다", () => {
    expect([...CHARACTER_COLOR_IDS].toSorted()).toEqual(Object.keys(CHARACTER_COLORS).toSorted());
    for (const [id, hex] of Object.entries(CYBORG_COLORS)) {
      expect(Object.entries(CHARACTER_COLORS)).toContainEqual([id, hex]);
    }
    for (const hex of Object.values(CHARACTER_COLORS)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("칸마다 ID가 겹치지 않고 ID 모양(영어 소문자)이다", () => {
    for (const list of Object.values(CHARACTER_PARTS)) {
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(id).toMatch(/^[a-z][a-z0-9_]{1,31}$/);
    }
  });

  it("프리셋은 모두 맞는 외형이고 ID·외형이 겹치지 않는다. 앞 넷은 옛 프리셋 ID다", () => {
    for (const preset of CHARACTER_PRESETS) expect(isCharacterLook(preset.look)).toBe(true);
    expect(new Set(CHARACTER_PRESETS.map((preset) => preset.id)).size).toBe(CHARACTER_PRESETS.length);
    expect(new Set(CHARACTER_PRESETS.map((preset) => characterLookKey(preset.look))).size).toBe(
      CHARACTER_PRESETS.length,
    );
    // 앞 넷은 옛 2D 프리셋 ID(옛 프리셋 목록은 D-560 1421로 뺐다 — ID는 그대로 남긴다)
    expect(CHARACTER_PRESETS.slice(0, 4).map((preset) => preset.id)).toEqual([
      "scout",
      "guard",
      "tinker",
      "drifter",
    ]);
    expect(DEFAULT_CHARACTER_LOOK).toBe(CHARACTER_PRESETS[0]?.look);
  });

  it("프리셋끼리 충분히 다르다(어느 둘이든 칸 넷 이상이 다르다)", () => {
    for (const a of CHARACTER_PRESETS) {
      for (const b of CHARACTER_PRESETS) {
        if (a.id >= b.id) continue;
        const different = CHARACTER_LOOK_KEYS.filter((key) => a.look[key] !== b.look[key]).length;
        expect(different, `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("목록 밖 ID·범위 밖 수·빠진 칸·더 있는 칸·다른 판·객체가 아닌 값은 받지 않는다", () => {
    const ok = DEFAULT_CHARACTER_LOOK;
    expect(isCharacterLook(ok)).toBe(true);
    expect(isCharacterLook({ ...ok, head: "tophat" })).toBe(false);
    expect(isCharacterLook({ ...ok, primary: "#ff0000" })).toBe(false);
    expect(isCharacterLook({ ...ok, height: 89 })).toBe(false);
    expect(isCharacterLook({ ...ok, height: 111 })).toBe(false);
    expect(isCharacterLook({ ...ok, height: 100.5 })).toBe(false);
    expect(isCharacterLook({ ...ok, height: "100" })).toBe(false);
    expect(isCharacterLook({ ...ok, plating: -1 })).toBe(false);
    expect(isCharacterLook({ ...ok, plating: CHARACTER_PLATING_MAX + 1 })).toBe(false);
    expect(isCharacterLook({ ...ok, v: 1 })).toBe(false);
    expect(isCharacterLook({ ...ok, hat: "cap" })).toBe(false);
    const { glow: _glow, ...missing } = ok;
    expect(isCharacterLook(missing)).toBe(false);
    expect(isCharacterLook(null)).toBe(false);
    expect(isCharacterLook([])).toBe(false);
    expect(isCharacterLook("scout")).toBe(false);
    // 키는 5 단위가 아니어도 범위 안 정수면 받는다(화면만 5씩 넘긴다)
    expect(isCharacterLook({ ...ok, height: 97 })).toBe(true);
  });

  it("칸 넘기기는 끝에서 처음으로 돈다(부위·키·장갑·색)", () => {
    const keys: CharacterLookKey[] = ["head", "height", "plating", "glow"];
    for (const key of keys) {
      const list = characterLookChoices(key);
      const first = { ...DEFAULT_CHARACTER_LOOK, [key]: list[0] };
      expect(isCharacterLook(first)).toBe(true);
      if (!isCharacterLook(first)) continue;
      const back = stepCharacterLook(first, key, -1);
      expect(back[key]).toBe(list[list.length - 1]);
      expect(stepCharacterLook(back, key, 1)[key]).toBe(list[0]);
      expect(isCharacterLook(back)).toBe(true);
    }
    expect(characterLookChoices("height")).toEqual([90, 95, 100, 105, 110]);
    expect(CHARACTER_HEIGHT.base).toBe(100);
  });

  it("무작위는 씨앗이 같으면 같고, 늘 맞는 외형이며, 씨앗마다 다양하다", () => {
    expect(randomCharacterLook(42)).toEqual(randomCharacterLook(42));
    const keys = new Set<string>();
    const seen: Record<string, Set<string | number>> = {};
    for (let seed = 0; seed < 400; seed++) {
      const look = randomCharacterLook(seed);
      expect(isCharacterLook(look)).toBe(true);
      keys.add(characterLookKey(look));
      for (const key of CHARACTER_LOOK_KEYS) (seen[key] ??= new Set()).add(look[key]);
    }
    expect(keys.size).toBeGreaterThan(390);
    // 부위 칸은 400번이면 모든 ID가 한 번은 나온다
    for (const [slot, list] of Object.entries(CHARACTER_PARTS)) {
      expect(seen[slot]?.size, slot).toBe(list.length);
    }
  });

  it("고정 값(다른 엔진에서도 같아야 한다): 씨앗 1의 무작위 외형", () => {
    expect(characterLookKey(randomCharacterLook(1))).toBe(
      "compact.wide.mask.ponytail.tunic.claw.plain.none.scarf.100.2.peach.sky.mint.sky.coral",
    );
  });

  it("다시 뽑기: 잠근 칸은 그대로, 칸 하나만 뽑으면 그 칸만 바뀐다", () => {
    const look = DEFAULT_CHARACTER_LOOK;
    const locked = new Set<CharacterLookKey>(["head", "primary", "height"]);
    for (let seed = 1; seed < 50; seed++) {
      const next = rerollCharacterLook(look, seed, locked);
      expect(isCharacterLook(next)).toBe(true);
      expect(next.head).toBe(look.head);
      expect(next.primary).toBe(look.primary);
      expect(next.height).toBe(look.height);
      const one = rerollCharacterLook(look, seed, locked, "torso");
      expect(one.torso).not.toBe(look.torso);
      expect({ ...one, torso: look.torso }).toEqual(look);
    }
    // 모두 잠그면 그대로
    expect(rerollCharacterLook(look, 7, new Set(CHARACTER_LOOK_KEYS))).toEqual(look);
  });

  it("유닛 기본 외형은 ID로 정해지고(같은 ID = 같은 외형) 휴먼은 수수하고 지도자는 망토·장갑이다", () => {
    const commoners = new Set<string>();
    for (let id = 1; id <= 200; id++) {
      const look = characterLookForUnit(id, "commoner");
      expect(isCharacterLook(look)).toBe(true);
      expect(look).toEqual(characterLookForUnit(id, "commoner"));
      expect(look.plating).toBe(0);
      expect(look.face).toBe("eyes");
      commoners.add(characterLookKey(look));
      const leader = characterLookForUnit(id, "leader");
      expect(isCharacterLook(leader)).toBe(true);
      expect(leader.back).toBe("cape");
      expect(leader.plating).toBe(CHARACTER_PLATING_MAX);
      // 큰 걷는 유닛의 임시 기계 몸: 온몸 장갑·피스톤 다리, 살색 얼굴이 아니다
      const android = characterLookForUnit(id, "android");
      expect(isCharacterLook(android)).toBe(true);
      expect(android).toEqual(characterLookForUnit(id, "android"));
      expect(android.plating).toBe(CHARACTER_PLATING_MAX);
      expect(["piston", "greaves"]).toContain(android.legs);
      expect(android.face).not.toBe("eyes");
    }
    expect(commoners.size).toBeGreaterThan(150);
  });

  it("옛 2D 외형 → 3D(켤 때 옮기기, D-560 1421): 같은 입력이면 같고, 고른 색·얼굴이 남는다", () => {
    const legacy: readonly CyborgAppearance[] = [
      DEFAULT_CYBORG_APPEARANCE,
      { head: "helm", face: "grill", body: "plate", limbs: "stub", primary: "slate", accent: "coral" },
      { head: "dome", face: "mono", body: "core", limbs: "claw", primary: "peach", accent: "sky" },
      { head: "crest", face: "eyes", body: "round", limbs: "wheel", primary: "lilac", accent: "cream" },
    ];
    legacy.forEach((appearance, index) => {
      expect(isCyborgAppearance(appearance)).toBe(true);
      const seed = characterSeedOf(`user-${index}`);
      const look = characterLookFromLegacy(appearance, seed);
      expect(isCharacterLook(look)).toBe(true);
      expect(look).toEqual(characterLookFromLegacy(appearance, seed));
      expect(look.primary).toBe(appearance.primary);
      expect(look.glow).toBe(appearance.accent);
      expect(look.face).toBe(appearance.face);
    });
  });

  it("같은 외형인지·표지", () => {
    const a = randomCharacterLook(5);
    const b: CharacterLook = { ...a };
    expect(sameCharacterLook(a, b)).toBe(true);
    expect(characterLookKey(a)).toBe(characterLookKey(b));
    expect(sameCharacterLook(a, stepCharacterLook(a, "glow", 1))).toBe(false);
    expect(characterSeedOf("abc")).toBe(characterSeedOf("abc"));
    expect(characterSeedOf("abc")).not.toBe(characterSeedOf("abd"));
  });
});
