// 세력 정체성 정하기 모델 — 초안(이름·약어·색·마크), 처음 값, 이름·약어 후보, 칸마다 문제, 서버에 보낼 모양, 거절 까닭 → 칸.
// 계산만 하는 순수 함수(시험: identityModel.test.ts). docs/adr/2026-11-11-faction-identity.md 2절.
import {
  FACTION_IDENTITY_COLORS,
  FACTION_SHORT_DEFAULT_RANGE,
  type FactionIdentityInput,
  type FactionShortRange,
  type FactionIdentityMine,
  type FactionIdentityReason,
  type FactionNameProblem,
  type FactionShortProblem,
  parseFactionName,
  parseFactionShort,
} from "@terra/shared/factionIdentity";
import { NAME_STYLE_IDS, generateNames, tickerCandidates } from "@terra/shared/nameGen";
import { type NationEmblemSpec, emblemFromSeed } from "@terra/shared/nationEmblem";

/** 마크 그림: 없음(만든 마크) / 이미 올린 그림 그대로 / 방금 자른 새 그림(아직 올리지 않음 — [정하기]를 누를 때 함께 보낸다) */
export type DraftUpload =
  | { readonly kind: "none" }
  | { readonly kind: "keep"; readonly hash: string }
  | { readonly kind: "new"; readonly pngBase64: string };

export interface IdentityDraft {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly emblem: NationEmblemSpec;
  readonly upload: DraftUpload;
}

/** 조회 결과 → 초안. 처음이면 이름·약어는 비우고, 색·만든 마크는 계정 씨앗으로 고른 출발값(사람이 바꾼다) */
export function draftOf(mine: FactionIdentityMine): IdentityDraft {
  const identity = mine.identity;
  if (identity)
    return {
      name: identity.name,
      shortName: identity.shortName,
      color: identity.color,
      emblem: identity.emblem,
      upload: identity.uploaded === null ? { kind: "none" } : { kind: "keep", hash: identity.uploaded },
    };
  const seed = mine.seed >>> 0;
  return {
    name: "",
    shortName: "",
    color: FACTION_IDENTITY_COLORS[seed % FACTION_IDENTITY_COLORS.length] ?? FACTION_IDENTITY_COLORS[0],
    emblem: emblemFromSeed(seed),
    upload: { kind: "none" },
  };
}

/** [다시 만들기]: 씨앗 + 차례로 정해지는 만든 마크(같은 계정·같은 차례면 같은 마크) */
export const rerollEmblem = (seed: number, round: number): NationEmblemSpec =>
  emblemFromSeed((seed >>> 0) + round);

export interface NameSuggestion {
  /** 넣을 이름(화면 언어에 맞는 쪽) */
  readonly text: string;
  /** 로마자 이름(약어 후보를 만들 때 쓴다) */
  readonly en: string;
}

/**
 * [이름 만들기] 후보: NPC 국가와 같은 이름 만들기(@terra/shared/nameGen, 종류 = 국가). 차례마다 말씨를 바꿔 여러 느낌의 후보를 보인다.
 * 한국어 화면은 한글 이름, 그 밖은 로마자 이름(유저가 지은 이름은 한 언어로 넣는다, D-328). 세력 이름 규칙에 안 맞는 후보는 뺀다
 */
export function nameSuggestions(seed: number, round: number, locale: string, count = 5): NameSuggestion[] {
  const base = (seed >>> 0) + round;
  const style = NAME_STYLE_IDS[base % NAME_STYLE_IDS.length] ?? NAME_STYLE_IDS[0];
  return generateNames(style, "nation", base, count + 3)
    .map((name) => ({ text: locale === "ko" ? name.ko : name.en, en: name.en }))
    .filter((name) => parseFactionName(name.text).ok)
    .slice(0, count);
}

/**
 * 약어 후보(이름에서): 로마자가 있으면 3글자 대문자 후보(@terra/shared/nameGen tickerCandidates), 한글 이름이면 앞 두 글자·세 글자.
 * 겹치는지는 서버가 본다(후보는 출발점이다)
 */
export function shortSuggestions(name: string, english?: string): string[] {
  const out: string[] = [];
  const push = (value: string): void => {
    // 후보는 새 약어 폭(출발값 2~4자) 안에서만
    if (parseFactionShort(value, FACTION_SHORT_DEFAULT_RANGE).ok && !out.includes(value)) out.push(value);
  };
  const latin = (english ?? name).replaceAll(/[^A-Za-z]/g, "");
  if (latin.length >= 3) for (const candidate of tickerCandidates(latin, new Set(), 3)) push(candidate);
  const hangul = name.trim().match(/[가-힣]/gu) ?? [];
  if (hangul.length >= 2) {
    push(hangul.slice(0, 2).join(""));
    if (hangul.length >= 3) push(hangul.slice(0, 3).join(""));
  }
  return out.slice(0, 4);
}

export interface DraftProblems {
  readonly name: FactionNameProblem | null;
  readonly shortName: FactionShortProblem | null;
}

/** 약어 폭 맥락: 새로 정하는 약어 폭(설정 칸 S20)과 지금 저장된 약어(그대로 두면 옛 5자 약어도 받는다 — 질문 928 나) */
export interface ShortRule {
  readonly range: FactionShortRange;
  readonly saved: string | null;
}

export const shortRuleOf = (mine: FactionIdentityMine): ShortRule => ({
  range: mine.shortRange,
  saved: mine.identity?.shortName ?? null,
});

/** 기기에서 바로 보는 글자 규칙(겹침은 서버가 본다). 약어는 서버와 같이: 저장된 약어 그대로면 저장 폭, 아니면 설정 칸 폭 */
export function draftProblems(draft: IdentityDraft, rule?: ShortRule): DraftProblems {
  const name = parseFactionName(draft.name);
  const loose = parseFactionShort(draft.shortName);
  const keep = loose.ok && rule?.saved != null && rule.saved.toLowerCase() === loose.key;
  const short = keep ? loose : parseFactionShort(draft.shortName, rule?.range ?? FACTION_SHORT_DEFAULT_RANGE);
  return { name: name.ok ? null : name.problem, shortName: short.ok ? null : short.problem };
}

/** 치는 동안 보일 문제: 빈 칸·아직 짧은 것은 치는 중이라 알리지 않는다([정하기]를 누르면 모두 알린다) */
export function liveProblems(draft: IdentityDraft, rule?: ShortRule): DraftProblems {
  const all = draftProblems(draft, rule);
  return {
    name: all.name === "empty" || all.name === "too_short" ? null : all.name,
    shortName: all.shortName === "empty" || all.shortName === "too_short" ? null : all.shortName,
  };
}

/** 초안 → 서버 요청 */
export function inputOf(draft: IdentityDraft): FactionIdentityInput {
  const upload = draft.upload;
  return {
    name: draft.name.trim(),
    shortName: draft.shortName.trim(),
    color: draft.color,
    emblem: draft.emblem,
    upload:
      upload.kind === "new"
        ? { mode: "new", pngBase64: upload.pngBase64 }
        : upload.kind === "keep"
          ? { mode: "keep" }
          : { mode: "none" },
  };
}

/** 저장된 값과 다른가(고치기에서 [저장]을 켤지) */
export function isChanged(draft: IdentityDraft, mine: FactionIdentityMine): boolean {
  const saved = draftOf(mine);
  if (mine.identity === null) return true;
  return (
    draft.name.trim() !== saved.name ||
    draft.shortName.trim() !== saved.shortName ||
    draft.color !== saved.color ||
    draft.emblem.shape !== saved.emblem.shape ||
    draft.emblem.division !== saved.emblem.division ||
    draft.emblem.charge !== saved.emblem.charge ||
    draft.emblem.scheme !== saved.emblem.scheme ||
    draft.upload.kind !== saved.upload.kind
  );
}

export type IdentityField = "name" | "shortName" | "color" | "emblem" | "upload" | "form";

/** 서버가 받지 않은 까닭 → 알릴 칸 */
export function fieldOfReason(reason: FactionIdentityReason): IdentityField {
  switch (reason) {
    case "name_invalid":
    case "name_taken":
      return "name";
    case "short_invalid":
    case "short_taken":
      return "shortName";
    case "color_invalid":
      return "color";
    case "emblem_invalid":
      return "emblem";
    case "upload_off":
    case "upload_blocked":
    case "emblem_not_png":
    case "emblem_wrong_size":
    case "emblem_too_large":
    case "emblem_bad_chunk":
    case "emblem_bad_data":
    case "no_upload":
      return "upload";
    case "rename_wait":
    case "rename_blocked":
    case "rate_limited":
      return "form";
    default: {
      const unhandled: never = reason;
      return unhandled;
    }
  }
}

/** base64 PNG → 미리 보기 주소(data:) */
export const pngDataUrl = (pngBase64: string): string => `data:image/png;base64,${pngBase64}`;
