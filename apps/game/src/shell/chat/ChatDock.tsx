// 반응형 다채널 채팅 도크(시장 · 장소 · 세력 · 파티, D-480 · D-6046).
// - 모바일(< 37.5em): 하단 48px 탭바 바로 위에 붙는 30px 1줄 바, 누르면 채널 시트 펼침.
// - 태블릿(37.5em~63.99em): 본문 아래 도킹된 인라인 빠른 채팅바 + 시트 펼침.
// - PC 데스크톱(≥ 64em): 앱 틀에서는 우측 280px 고정 채팅 열(접기 가능), 2차맵에서는 우하단 컴팩트 도크.
import { type FormEvent, useEffect, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { Icon } from "../../ui/icons.tsx";
import { SignatureIcon } from "../../ui/SignatureIcon.tsx";
import {
  CHAT_CHANNELS,
  CHAT_MAX_LEN,
  type ChatChannel,
  type ChatMessage,
  type ChatSeedKey,
  chatStore,
  useChatSnapshot,
} from "./chatStore.ts";
import "./chatDock.css";

const CHANNEL_NAMES: Readonly<Record<ChatChannel, () => string>> = {
  market: m.shell_chat_ch_market,
  place: m.shell_chat_ch_place,
  faction: m.shell_chat_ch_faction,
  party: m.shell_chat_ch_party,
};

const SEED_TEXT: Readonly<Record<ChatSeedKey, () => string>> = {
  market_1: m.shell_chat_seed_market_1,
  market_2: m.shell_chat_seed_market_2,
  market_3: m.shell_chat_seed_market_3,
  place_1: m.shell_chat_seed_place_1,
  place_2: m.shell_chat_seed_place_2,
  faction_1: m.shell_chat_seed_faction_1,
  faction_2: m.shell_chat_seed_faction_2,
  party_1: m.shell_chat_seed_party_1,
};

function messageBody(msg: ChatMessage, translated: boolean): string {
  if (msg.seedKey === undefined) return msg.text;
  if (translated && msg.seedKey === "market_2") return m.shell_chat_seed_market_2_tr();
  return SEED_TEXT[msg.seedKey]();
}

export interface ChatDockProps {
  readonly variant: "shell" | "map";
  readonly authorName: string;
}

export function ChatDock({ variant, authorName }: ChatDockProps) {
  const snap = useChatSnapshot();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const channelMessages = snap.messages[snap.channel];
  const latest = channelMessages[channelMessages.length - 1] ?? null;
  const channelLabel = CHANNEL_NAMES[snap.channel]();

  // 앱 틀에서 채팅바가 켜진 동안 <html>에 data-chatbar를 달아 본문 아래 여백·배너 위치를 맞춘다
  useEffect(() => {
    if (variant !== "shell") return undefined;
    const root = document.documentElement;
    root.setAttribute("data-chatbar", "");
    return () => {
      root.removeAttribute("data-chatbar");
    };
  }, [variant]);

  // 채널이 바뀌거나 새 메시지가 추가되거나 시트가 열리면 맨 아래로 내린다
  const scrollKey = `${snap.channel}:${snap.expanded}:${snap.desktopOpen}:${latest?.id ?? 0}`;
  useEffect(() => {
    const el = listRef.current;
    if (el !== null && scrollKey.length > 0) el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (chatStore.sendMessage(authorName, draft)) {
      setDraft("");
    }
  }

  return (
    <aside
      className="chat-dock"
      data-variant={variant}
      data-channel={snap.channel}
      data-expanded={snap.expanded ? "true" : "false"}
      data-desktop-open={snap.desktopOpen ? "true" : "false"}
      aria-label={m.shell_chat_label()}
    >
      {/* PC 우측 열을 접었을 때 우하단에 뜨는 열기 알약 단추 */}
      {variant === "shell" && !snap.desktopOpen ? (
        <button
          type="button"
          className="chat-reopen"
          onClick={() => chatStore.setDesktopOpen(true)}
          aria-label={m.shell_chat_open_panel()}
        >
          <SignatureIcon name="chat" className="chat-reopen-ico" />
          <span>{m.shell_chat_short()}</span>
        </button>
      ) : null}

      {/* 접힌 1줄 바(모바일 30px · 태블릿 인라인 · 2차맵 하단 도크) */}
      <div className="chat-bar">
        <div className="chat-bar-channels" role="tablist" aria-label={m.shell_chat_channels_label()}>
          {CHAT_CHANNELS.map((ch) => (
            <button
              key={ch}
              type="button"
              role="tab"
              aria-selected={snap.channel === ch}
              className="chat-pill"
              data-ch={ch}
              onClick={() => chatStore.setChannel(ch)}
            >
              {CHANNEL_NAMES[ch]()}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="chat-bar-line"
          onClick={() => chatStore.toggleExpanded()}
          aria-expanded={snap.expanded}
          aria-label={snap.expanded ? m.shell_chat_collapse() : m.shell_chat_expand()}
        >
          <SignatureIcon name="chat" className="chat-bar-ico" />
          <span className="chat-bar-tag" data-ch={snap.channel}>
            {channelLabel}
          </span>
          {latest === null ? (
            <span className="chat-bar-empty">{m.shell_chat_empty()}</span>
          ) : (
            <span className="chat-bar-preview">
              <strong className="chat-bar-author" translate="no">
                {latest.author}:
              </strong>{" "}
              <span>{messageBody(latest, snap.translatedIds.has(latest.id))}</span>
            </span>
          )}
          <span className="chat-bar-caret" aria-hidden="true">
            <Icon name={snap.expanded ? "down" : "up"} />
          </span>
        </button>

        {/* 태블릿 가로 인라인 빠른 전송 폼(37.5em~63.99em 앱 틀에서만 노출) */}
        {variant === "shell" ? (
          <form className="chat-inline-form" onSubmit={handleSubmit}>
            <input
              type="text"
              className="chat-inline-input"
              value={draft}
              maxLength={CHAT_MAX_LEN}
              placeholder={m.shell_chat_placeholder({ channel: channelLabel })}
              aria-label={m.shell_chat_placeholder({ channel: channelLabel })}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="button-primary button-small chat-inline-send">
              {m.shell_chat_send()}
            </button>
            <button
              type="button"
              className="button-small chat-inline-toggle"
              onClick={() => chatStore.toggleExpanded()}
              aria-expanded={snap.expanded}
              aria-label={snap.expanded ? m.shell_chat_collapse() : m.shell_chat_expand()}
            >
              <Icon name={snap.expanded ? "down" : "up"} />
            </button>
          </form>
        ) : null}
      </div>

      {/* 펼친 다채널 채팅 시트 / PC 우측 고정 채팅 열 */}
      <div className="chat-panel">
        <div className="chat-head">
          <div className="chat-tabs" role="tablist" aria-label={m.shell_chat_channels_label()}>
            {CHAT_CHANNELS.map((ch) => (
              <button
                key={ch}
                type="button"
                role="tab"
                aria-selected={snap.channel === ch}
                className="chat-tab"
                data-ch={ch}
                onClick={() => chatStore.setChannel(ch)}
              >
                {CHANNEL_NAMES[ch]()}
              </button>
            ))}
          </div>
          <span className="chat-preview-badge">{m.shell_chat_preview_tag()}</span>
          {variant === "shell" ? (
            <button
              type="button"
              className="chat-head-btn chat-desktop-close"
              onClick={() => chatStore.setDesktopOpen(false)}
              aria-label={m.shell_chat_collapse_panel()}
            >
              <Icon name="close" />
            </button>
          ) : null}
          <button
            type="button"
            className="chat-head-btn chat-sheet-close"
            onClick={() => chatStore.setExpanded(false)}
            aria-label={m.shell_chat_collapse()}
          >
            <Icon name="down" />
          </button>
        </div>

        <ol className="chat-list" ref={listRef}>
          {channelMessages.map((msg) => {
            const translated = snap.translatedIds.has(msg.id);
            return (
              <li key={msg.id} className="chat-row" data-mine={msg.mine ? "true" : undefined}>
                <span className="chat-time">{msg.time}</span>
                <strong className="chat-author" translate="no">
                  {msg.author}
                </strong>
                <span className="chat-text">{messageBody(msg, translated)}</span>
                {msg.translatable ? (
                  <button
                    type="button"
                    className="chat-translate"
                    aria-pressed={translated}
                    onClick={() => chatStore.toggleTranslation(msg.id)}
                  >
                    {translated ? m.shell_chat_original() : m.shell_chat_translate()}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>

        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="chat-input"
            value={draft}
            maxLength={CHAT_MAX_LEN}
            placeholder={m.shell_chat_placeholder({ channel: channelLabel })}
            aria-label={m.shell_chat_placeholder({ channel: channelLabel })}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="button-primary chat-send">
            {m.shell_chat_send()}
          </button>
        </form>
      </div>
    </aside>
  );
}
