// 탭 3: 국가·가문·도시 전략 판단(기존 npc_*·s19_*·d323_* 튜닝 키 묶음) — docs/adr/2026-11-20-npc-autonomous-ai.md
import type { TuningEntryView } from "@terra/shared/tuning";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { NpcAiNumberField } from "./NpcAiField.tsx";
import { type NpcAiPending, STRATEGY_CARD_GROUPS } from "./npcAiModel.ts";

export function NpcAiStrategyTab({
  byId,
  pending,
  ko,
  onStage,
}: {
  readonly byId: ReadonlyMap<string, TuningEntryView>;
  readonly pending: NpcAiPending;
  readonly ko: boolean;
  readonly onStage: (patch: Readonly<Record<string, number | null>>, editKey?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();

  return (
    <div className="na-tab-body">
      <div className="na-strategy-bar">
        <input
          type="search"
          className="input na-search-input"
          value={search}
          placeholder={m.dev_npc_ai_search_placeholder()}
          aria-label={m.dev_npc_ai_search_placeholder()}
          onChange={(e) => setSearch(e.target.value)}
        />
        <AppLink to={{ route: "dev_nations" }} className="button-small">
          {m.dev_npc_ai_open_nations()}
        </AppLink>
      </div>

      {STRATEGY_CARD_GROUPS.map((group) => {
        const matchedKeys = group.keys.filter((id) => {
          const entry = byId.get(id);
          if (!entry) return false;
          if (needle === "") return true;
          return (
            id.toLowerCase().includes(needle) ||
            entry.name.ko.toLowerCase().includes(needle) ||
            entry.name.en.toLowerCase().includes(needle)
          );
        });
        if (matchedKeys.length === 0) return null;
        return (
          <section key={group.id} className="panel na-card">
            <div className="na-card-head">
              <h2>{ko ? group.titleKo : group.titleEn}</h2>
            </div>
            <div className="na-grid-2">
              {matchedKeys.map((id) => (
                <NpcAiNumberField key={id} id={id} byId={byId} pending={pending} ko={ko} onStage={onStage} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
