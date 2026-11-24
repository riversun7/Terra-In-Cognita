// 다채널 채팅 프론트 상태 저장소(시장 · 장소 · 세력 · 파티, 기획 D-480 · D-6046 번역 토글 미리 보기).
// 백엔드 실시간 채팅 프로토콜 연결 전까지 기기 메모리 안에서 채널 전환·전송·번역 토글·접기/펼치기를 제공한다.
import { hasUnstorableText } from "@terra/shared";
import { useSyncExternalStore } from "react";

export const CHAT_CHANNELS = ["market", "place", "faction", "party"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

/** 다국어 샘플 메시지 식별자(화면에서 현재 언어로 풀어 그린다) */
export type ChatSeedKey =
  | "market_1"
  | "market_2"
  | "market_3"
  | "place_1"
  | "place_2"
  | "faction_1"
  | "faction_2"
  | "party_1";

export interface ChatMessage {
  readonly id: number;
  readonly channel: ChatChannel;
  readonly author: string;
  readonly time: string;
  /** 유저가 직접 보낸 글. 샘플 메시지면 빈 문자열이고 seedKey로 그린다 */
  readonly text: string;
  readonly seedKey?: ChatSeedKey;
  /** 외국어 원문 샘플 여부([번역] 단추 표시, D-6046) */
  readonly translatable?: boolean;
  readonly mine?: boolean;
}

export interface ChatSnapshot {
  readonly channel: ChatChannel;
  /** 모바일·태블릿·2차맵 하단 채팅 시트 펼침 여부 */
  readonly expanded: boolean;
  /** PC(≥ 64em) 우측 고정 채팅 열 열림 여부 */
  readonly desktopOpen: boolean;
  readonly translatedIds: ReadonlySet<number>;
  readonly messages: Readonly<Record<ChatChannel, readonly ChatMessage[]>>;
}

export const CHAT_MAX_LEN = 200;
const CHANNEL_HISTORY_LIMIT = 50;

const INITIAL_MESSAGES: Readonly<Record<ChatChannel, readonly ChatMessage[]>> = {
  market: [
    { id: 1, channel: "market", author: "AsaDamur", time: "11:42", text: "", seedKey: "market_1" },
    {
      id: 2,
      channel: "market",
      author: "Valkyrie",
      time: "11:45",
      text: "",
      seedKey: "market_2",
      translatable: true,
    },
    { id: 3, channel: "market", author: "Reinhardt", time: "11:48", text: "", seedKey: "market_3" },
  ],
  place: [
    { id: 4, channel: "place", author: "AEIOU", time: "11:40", text: "", seedKey: "place_1" },
    { id: 5, channel: "place", author: "FrostWolf", time: "11:46", text: "", seedKey: "place_2" },
  ],
  faction: [
    { id: 6, channel: "faction", author: "Taebaek", time: "11:30", text: "", seedKey: "faction_1" },
    { id: 7, channel: "faction", author: "Falcon", time: "11:44", text: "", seedKey: "faction_2" },
  ],
  party: [{ id: 8, channel: "party", author: "Vanguard", time: "11:47", text: "", seedKey: "party_1" }],
};

function nowHm(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export interface ChatStore {
  readonly snapshot: () => ChatSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setChannel: (channel: ChatChannel) => void;
  readonly setExpanded: (expanded: boolean) => void;
  readonly toggleExpanded: () => void;
  readonly setDesktopOpen: (open: boolean) => void;
  readonly toggleTranslation: (id: number) => void;
  readonly sendMessage: (author: string, rawText: string) => boolean;
}

export function createChatStore(): ChatStore {
  let nextId = 100;
  let state: ChatSnapshot = {
    channel: "market",
    expanded: false,
    desktopOpen: true,
    translatedIds: new Set<number>(),
    messages: INITIAL_MESSAGES,
  };
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setChannel: (channel) => {
      if (state.channel === channel) return;
      state = { ...state, channel };
      emit();
    },
    setExpanded: (expanded) => {
      if (state.expanded === expanded) return;
      state = { ...state, expanded };
      emit();
    },
    toggleExpanded: () => {
      state = { ...state, expanded: !state.expanded };
      emit();
    },
    setDesktopOpen: (desktopOpen) => {
      if (state.desktopOpen === desktopOpen) return;
      state = { ...state, desktopOpen };
      emit();
    },
    toggleTranslation: (id) => {
      const next = new Set(state.translatedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      state = { ...state, translatedIds: next };
      emit();
    },
    sendMessage: (author, rawText) => {
      const trimmed = rawText.trim().slice(0, CHAT_MAX_LEN);
      if (trimmed.length === 0 || hasUnstorableText({ text: trimmed })) return false;
      const entry: ChatMessage = {
        id: nextId++,
        channel: state.channel,
        author: author.trim() || "Commander",
        time: nowHm(),
        text: trimmed,
        mine: true,
      };
      const prev = state.messages[state.channel];
      const updated = [...prev, entry].slice(-CHANNEL_HISTORY_LIMIT);
      state = {
        ...state,
        messages: {
          ...state.messages,
          [state.channel]: updated,
        },
      };
      emit();
      return true;
    },
  };
}

export const chatStore: ChatStore = createChatStore();

export function useChatSnapshot(store: ChatStore = chatStore): ChatSnapshot {
  return useSyncExternalStore(store.subscribe, store.snapshot);
}
