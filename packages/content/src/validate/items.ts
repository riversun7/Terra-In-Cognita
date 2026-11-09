// 2단계 뒤 아이템 검사 — 항목 사이를 보는 규칙(docs/adr/2026-11-01-item-editor.md 2절, 설계안 2.7).
// - 중분류의 대분류가 아이템 대분류와 같다(item_subcategory_major).
// - 무기 종류의 칸이 장비 칸과 같다(item_weapon_type_slot). 무기의 탄약 연결은 보조 칸 종류만(item_ammo_type).
// - 무기 종류의 상위 중분류는 장비 대분류의 중분류다(weapon_type_subcategory_major). 상위 중분류가 있는 무기 종류를 단 장비는
//   중분류가 그 상위 중분류여야 한다(item_weapon_type_subcategory, 비어도 문제). D-497 기획 정리 896: 나무 = 대분류 → 중분류 → 무기 종류.
// - 신선도 0이면 바뀌는 아이템: 자기 자신이 아니고(item_spoils_self) 사슬이 돌고 돌지 않는다(item_spoils_cycle).
// 참조가 없는 경우는 참조 단계가 알리므로 여기서는 건너뛴다. 권고(저장을 막지 않는 것)는 여기 두지 않는다(서버 편집기가 셈한다).
// 항목은 스키마를 통과한 파싱 결과(참조 = ContentRef)다. 타입을 좁히지 않고 칸을 읽는다(planets.ts와 같은 방식).
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";
import { ContentRef } from "../schema/common.ts";

const FILE = "items.json";

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const refId = (value: unknown): string | undefined => (value instanceof ContentRef ? value.id : undefined);
const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** 분류 항목 ID → 칸 하나(글자) */
function fieldById(pack: ContentPack, category: string, key: string): Map<string, string | undefined> {
  return new Map((pack.entries.get(category) ?? []).map((entry) => [entry.id, text(get(entry, key))]));
}

export function checkItems(pack: ContentPack): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const items = pack.entries.get("items") ?? [];
  const majorOf = fieldById(pack, "item_subcategories", "major");
  const typeSlotOf = fieldById(pack, "weapon_types", "slot");
  /** 무기 종류 → 상위 중분류 ID(있고 그 중분류가 팩에 있을 때만: 없는 참조는 참조 단계가 알린다) */
  const typeParentOf = new Map<string, string>();
  const error = (id: string, path: string, code: string, message: string, params?: ContentIssue["params"]) =>
    issues.push({
      stage: "references",
      level: "error",
      file: FILE,
      id,
      path,
      message,
      code,
      ...(params ? { params } : {}),
    });

  for (const type of pack.entries.get("weapon_types") ?? []) {
    const parent = refId(get(type, "subcategory"));
    if (parent === undefined || !majorOf.has(parent)) continue;
    const major = majorOf.get(parent);
    if (major !== "equipment") {
      issues.push({
        stage: "references",
        level: "error",
        file: "weapon_types.json",
        id: type.id,
        path: "subcategory",
        message: `상위 중분류 ${parent}는 대분류 ${major ?? "?"}의 것입니다. 무기 종류는 장비(equipment) 중분류 아래에만 둡니다.`,
        code: "weapon_type_subcategory_major",
        params: { subcategory: parent, major: major ?? "" },
      });
      continue;
    }
    typeParentOf.set(type.id, parent);
  }

  const spoils = new Map<string, string>();
  for (const item of items) {
    const category = text(get(item, "category"));
    const sub = refId(get(item, "subcategory"));
    const major = sub === undefined ? undefined : majorOf.get(sub);
    if (sub !== undefined && major !== undefined && major !== category)
      error(
        item.id,
        "subcategory",
        "item_subcategory_major",
        `중분류 ${sub}는 대분류 ${major}의 것입니다(이 아이템은 ${category ?? "?"}). 같은 대분류의 중분류를 고르세요.`,
        { subcategory: sub, major },
      );
    const equip = get(item, "equip");
    const slot = text(get(equip, "slot"));
    const type = refId(get(equip, "weaponType"));
    const typeSlot = type === undefined ? undefined : typeSlotOf.get(type);
    if (type !== undefined && typeSlot !== undefined && typeSlot !== slot)
      error(
        item.id,
        "equip.weaponType",
        "item_weapon_type_slot",
        `무기 종류 ${type}는 ${typeSlot} 칸 종류입니다(이 장비는 ${slot ?? "?"} 칸).`,
        { weaponType: type, slot: typeSlot },
      );
    const parent = type === undefined ? undefined : typeParentOf.get(type);
    if (parent !== undefined && sub !== parent)
      error(
        item.id,
        "subcategory",
        "item_weapon_type_subcategory",
        `무기 종류 ${type ?? "?"}는 중분류 ${parent} 아래 종류입니다(이 아이템 중분류는 ${sub ?? "없음"}). 중분류를 ${parent}로 고르세요.`,
        { weaponType: type ?? "", subcategory: parent },
      );
    const ammo = refId(get(get(equip, "weapon"), "ammo"));
    const ammoSlot = ammo === undefined ? undefined : typeSlotOf.get(ammo);
    if (ammo !== undefined && ammoSlot !== undefined && ammoSlot !== "offhand")
      error(
        item.id,
        "equip.weapon.ammo",
        "item_ammo_type",
        `탄약 연결은 보조 칸 무기 종류(화살통·탄창 등)만 가리킵니다(${ammo}는 ${ammoSlot} 칸).`,
        { weaponType: ammo },
      );
    const target = refId(get(get(item, "perish"), "spoilsTo"));
    if (target === item.id)
      error(
        item.id,
        "perish.spoilsTo",
        "item_spoils_self",
        "신선도가 0이 되면 바뀌는 아이템이 자기 자신입니다. 다른 아이템을 고르세요.",
      );
    else if (target !== undefined) spoils.set(item.id, target);
  }

  // 신선도 사슬: A → B → … → A 이면 끝없이 바뀐다. 고리마다 가장 앞 ID(글자 차례)에 한 번만 알린다
  const reported = new Set<string>();
  for (const start of spoils.keys()) {
    const path: string[] = [];
    for (let at: string | undefined = start; at !== undefined; at = spoils.get(at)) {
      const index = path.indexOf(at);
      if (index >= 0) {
        const loop = path.slice(index);
        const first = loop.toSorted()[0] ?? at;
        if (!reported.has(first)) {
          reported.add(first);
          const chain = [...loop, at].join(" → ");
          error(
            first,
            "perish.spoilsTo",
            "item_spoils_cycle",
            `신선도 사슬이 돌고 돕니다(${chain}). 사슬 끝은 썩지 않는 아이템이어야 합니다.`,
            { chain },
          );
        }
        break;
      }
      path.push(at);
    }
  }
  return issues;
}
