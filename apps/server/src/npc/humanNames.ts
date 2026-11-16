// NPC 휴먼 이름 — 기획 답 773 나(휴먼 이름은 이름 규칙 + 목록 콘텐츠, D-5045·D-398), docs/adr/2026-11-07-play-flow.md "WP-NPC4".
// - 목록: 그 휴먼이 사는 나라의 팩 국가 프리셋 humanNames(이름·성 조각, 번역 안 함 D-476 — 도시 이름과 같은 방식). 나라는 휴먼 주인 세력이
//   따르는 프리셋(반란 부모 → 종주 → 태어날 때 부모, nations.ts nationPresetOf — 도시 이름과 같은 길).
// - 이름 규칙 [임시]: "이름 성"(성 목록이 비면 이름만). 유닛 ID 해시로 이름·성을 하나씩 고른다 — 같은 휴먼·같은 나라 목록이면 늘 같은 이름이고
//   저장하지 않는다(목록을 개발자 페이지에서 바꾸면 다음 조회부터 새 목록). 같은 도시에 같은 이름이 둘 있을 수 있다(목록 크기 [임시]).
// - 판정에 쓰지 않는다(보이기만 — 정부 판 시장 줄·지도의 한눈 정보).
import { mix32 } from "@terra/sim";

/** 이름 조각 목록(nations.ts NationPreset.humanNames) */
export interface HumanNameLists {
  readonly given: readonly string[];
  readonly family: readonly string[];
}

/** 이름 고르기 해시의 소금(다른 해시와 겹치지 않게) */
const NAME_SALT = 0x6e61_6d65;

/** 휴먼 하나의 이름 조각(순수 함수): 이름과 성(성 목록이 비면 null). 이름 목록이 비었으면 undefined */
function namePartsOf(
  lists: HumanNameLists | undefined,
  unitId: number,
): { readonly given: string; readonly family: string | null } | undefined {
  if (!lists || lists.given.length === 0) return undefined;
  const hash = mix32(Math.imul(unitId, 0x9e37_79b1) ^ NAME_SALT) >>> 0;
  const given = lists.given[hash % lists.given.length];
  if (given === undefined) return undefined;
  if (lists.family.length === 0) return { given, family: null };
  // 성은 해시의 다른 자리로(이름과 함께 돌지 않게)
  const family = lists.family[Math.floor(hash / lists.given.length) % lists.family.length];
  return { given, family: family ?? null };
}

/** 휴먼 하나의 이름(순수 함수). 이름 목록이 비었으면 undefined(화면이 "휴먼 #ID") */
export function humanNameOf(lists: HumanNameLists | undefined, unitId: number): string | undefined {
  const parts = namePartsOf(lists, unitId);
  if (!parts) return undefined;
  return parts.family === null ? parts.given : `${parts.given} ${parts.family}`;
}

/** 휴먼 하나의 성(NPC 도시 가문 이름 — npc/cityHouses.ts). 성 목록이 비면 이름, 이름 목록도 비면 undefined */
export function humanFamilyOf(lists: HumanNameLists | undefined, unitId: number): string | undefined {
  const parts = namePartsOf(lists, unitId);
  return parts ? (parts.family ?? parts.given) : undefined;
}
