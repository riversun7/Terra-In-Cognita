// 운영자 콘솔 · 세력 정체성 고치기(docs/adr/2026-11-09-faction-profiles.md) — 이름·약어·시그니처 컬러, 사유는 감사 기록에 남는다.
// 관리자·개발자(faction_edit)만 보인다. 규칙은 @terra/shared/factionProfile(서버가 다시 본다, 약어가 겹치면 short_taken).
import type { OpsFactionRow } from "@terra/shared/ops";
import {
  FACTION_NAME_MAX,
  isFactionColor,
  isFactionShort,
  isProfileName,
} from "@terra/shared/factionProfile";
import { type FormEvent, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { FactionMark } from "./FactionsTab.tsx";
import { errorText, resultText } from "./opsUi.tsx";

export function FactionProfileEdit({ faction, onDone }: { faction: OpsFactionRow; onDone: () => void }) {
  const nameId = useId();
  const shortId = useId();
  const colorId = useId();
  const reasonId = useId();
  const [name, setName] = useState(faction.name);
  const [shortName, setShortName] = useState(faction.shortName ?? "");
  const [color, setColor] = useState(faction.color ?? "#888888");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const valid = isProfileName(name, FACTION_NAME_MAX) && isFactionShort(shortName) && isFactionColor(color);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    if (!valid) {
      setMessage({ tone: "error", text: m.ops_res_invalid() });
      return;
    }
    setPending(true);
    try {
      const result = await api.ops.npcs.updateProfile.mutate({
        factionId: faction.id,
        name,
        shortName,
        color,
        reason,
      });
      if (result.ok) {
        setMessage({ tone: "success", text: m.ops_done() });
        onDone();
      } else setMessage({ tone: "error", text: resultText(result.code) });
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="ops-form ops-profile-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor={nameId}>{m.ops_col_name()}</label>
      <input
        id={nameId}
        className="input"
        maxLength={FACTION_NAME_MAX}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label htmlFor={shortId}>{m.ops_fac_short()}</label>
      <input
        id={shortId}
        className="input ops-narrow"
        maxLength={5}
        value={shortName}
        aria-describedby={`${shortId}-hint`}
        onChange={(event) => setShortName(event.target.value)}
      />
      <span id={`${shortId}-hint`} className="dev-muted">
        {m.ops_fac_short_hint()}
      </span>
      <label htmlFor={colorId}>{m.ops_fac_color()}</label>
      <span className="ops-inline">
        <input
          id={colorId}
          type="color"
          value={isFactionColor(color) ? color : "#888888"}
          onChange={(event) => setColor(event.target.value.toLowerCase())}
        />
        <input
          className="input ops-narrow"
          aria-label={m.ops_fac_color()}
          maxLength={7}
          value={color}
          onChange={(event) => setColor(event.target.value.toLowerCase())}
        />
        <FactionMark color={isFactionColor(color) ? color : null} shortName={shortName || null} />
      </span>
      <label htmlFor={reasonId}>{m.ops_reason()}</label>
      <input
        id={reasonId}
        className="input"
        maxLength={200}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div>
        <button type="submit" className="button-small button-primary" aria-disabled={pending || !valid}>
          {m.ops_save()}
        </button>
        {message ? (
          <span className={message.tone === "error" ? "ops-msg ops-msg-error" : "ops-msg"} role="status">
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
