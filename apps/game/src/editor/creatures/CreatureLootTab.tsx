// 크리처 전리품 드롭 테이블 & 몬테카를로 사냥 보상 시뮬레이터 탭(CreatureLootTab) — 기획 D-494·41_Time_Units §4.3.
import {
  CREATURE_LIMITS,
  type CreatureEditorItemOption,
  type CreatureJson,
  simulateCreatureLoot,
} from "@terra/shared/creatureEditor";
import { useState } from "react";
import { NumberField, RemoveButton } from "../content/contentEditorFields.tsx";

export function CreatureLootTab({
  draft,
  items,
  locale,
  onEdit,
}: {
  readonly draft: CreatureJson;
  readonly items: readonly CreatureEditorItemOption[];
  readonly locale: "ko" | "en";
  readonly onEdit: (next: CreatureJson) => void;
}) {
  const ko = locale !== "en";
  const [kills, setKills] = useState<100 | 1000 | 10000>(1000);
  const [simSeed, setSimSeed] = useState(42);
  const drops = draft.drops ?? [];
  const itemById = new Map(items.map((it) => [it.id, it]));

  // 1회 처치당 기대 가치(아이템 startPrice 기준)
  const expectedValuePerKill = drops.reduce((acc, drop) => {
    const item = itemById.get(drop.item);
    const price = item?.startPrice ?? 0;
    const avgQty = (drop.min + drop.max) / 2;
    return acc + (drop.chancePm / 1000) * avgQty * price;
  }, 0);

  const simRows = simulateCreatureLoot(drops, kills, simSeed);

  return (
    <div className="ce-tab-stack">
      {/* 1. 전리품 드롭 테이블 */}
      <section className="be-card">
        <div className="ce-card-head">
          <div>
            <h3 className="ce-section-title">
              {ko
                ? `전리품 드롭 테이블 (${drops.length}/${CREATURE_LIMITS.dropsMax})`
                : `Loot Drop Table (${drops.length}/${CREATURE_LIMITS.dropsMax})`}
            </h3>
            <p className="field-hint">
              {ko
                ? "크리처 처치 시 확률(‰, 1000‰ = 100%)에 따라 min~max개를 드롭합니다. 크리처 착용 장비는 스틸 스킬 대상이 됩니다(D-494)."
                : "Items dropped on kill by probability (‰, 1000‰ = 100%) and quantity range (min~max)."}
            </p>
          </div>
          <div className="ce-inline-controls">
            <span className="dev-badge">
              {ko
                ? `1회 처치 기대 가치: ${expectedValuePerKill.toFixed(1)}`
                : `Expected Value / Kill: ${expectedValuePerKill.toFixed(1)}`}
            </span>
            <button
              type="button"
              className="button-small ce-btn-accent"
              disabled={drops.length >= CREATURE_LIMITS.dropsMax || items.length === 0}
              onClick={() => {
                const used = new Set(drops.map((d) => d.item));
                const pick = items.find((it) => !used.has(it.id)) ?? items[0];
                if (!pick) return;
                onEdit({
                  ...draft,
                  drops: [...drops, { item: pick.id, chancePm: 250, min: 1, max: 2 }],
                });
              }}
            >
              {ko ? "+ 드롭 아이템 추가" : "+ Add Drop Item"}
            </button>
          </div>
        </div>

        {drops.length > 0 ? (
          <div className="ce-list-rows">
            {drops.map((drop, idx) => {
              const itemInfo = itemById.get(drop.item);
              return (
                <div key={`${drop.item}-${idx}`} className="ce-drop-row">
                  <div className="field ce-field">
                    <label className="field-label" htmlFor={`ce-drop-item-${idx}`}>
                      {ko ? "드롭 아이템" : "Drop Item"}
                    </label>
                    <select
                      id={`ce-drop-item-${idx}`}
                      value={drop.item}
                      onChange={(e) => {
                        const next = [...drops];
                        next[idx] = { ...drop, item: e.target.value };
                        onEdit({ ...draft, drops: next });
                      }}
                    >
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {ko ? it.name.ko : it.name.en} ({it.id} · T{it.tier})
                        </option>
                      ))}
                    </select>
                  </div>
                  <NumberField
                    label={
                      ko
                        ? `확률 ‰ (${(drop.chancePm / 10).toFixed(1)}%)`
                        : `Chance ‰ (${(drop.chancePm / 10).toFixed(1)}%)`
                    }
                    value={drop.chancePm}
                    min={1}
                    max={1000}
                    onChange={(v) => {
                      if (v === undefined) return;
                      const next = [...drops];
                      next[idx] = { ...drop, chancePm: v };
                      onEdit({ ...draft, drops: next });
                    }}
                  />
                  <NumberField
                    label={ko ? "최소 수량 (min)" : "Min Qty"}
                    value={drop.min}
                    min={1}
                    max={CREATURE_LIMITS.dropQtyMax}
                    onChange={(v) => {
                      if (v === undefined) return;
                      const next = [...drops];
                      next[idx] = { ...drop, min: v, max: Math.max(v, drop.max) };
                      onEdit({ ...draft, drops: next });
                    }}
                  />
                  <NumberField
                    label={ko ? "최대 수량 (max)" : "Max Qty"}
                    value={drop.max}
                    min={drop.min}
                    max={CREATURE_LIMITS.dropQtyMax}
                    onChange={(v) => {
                      if (v === undefined) return;
                      const next = [...drops];
                      next[idx] = { ...drop, min: Math.min(drop.min, v), max: v };
                      onEdit({ ...draft, drops: next });
                    }}
                  />
                  <div className="ce-drop-meta">
                    <span className="field-hint">
                      {itemInfo?.startPrice
                        ? `${ko ? "단가" : "Price"} ${itemInfo.startPrice}`
                        : ko
                          ? "단가 없음"
                          : "No price"}
                    </span>
                    <RemoveButton
                      name={drop.item}
                      onClick={() => {
                        const next = drops.filter((_, i) => i !== idx);
                        onEdit({ ...draft, drops: next });
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="field-hint">
            {ko
              ? "등록된 전리품이 없습니다. [+ 드롭 아이템 추가]를 눌러 전리품을 설정하세요."
              : "No drop items configured."}
          </p>
        )}
      </section>

      {/* 2. 몬테카를로 전리품 사냥 시뮬레이터 (100 / 1,000 / 10,000회) */}
      <section className="be-card">
        <div className="ce-card-head">
          <div>
            <h3 className="ce-section-title">
              {ko
                ? "사냥 보상 몬테카를로 시뮬레이터 (100 · 1,000 · 10,000회 처치)"
                : "Monte Carlo Loot Simulator (100 / 1,000 / 10,000 Kills)"}
            </h3>
            <p className="field-hint">
              {ko
                ? "결정적 시드 난수로 반복 처치 시 총 획득 수량과 기대 가치 편차를 검증합니다."
                : "Simulates repeated kills using seeded RNG to verify drop quantities and expected value."}
            </p>
          </div>
          <div className="ce-inline-controls">
            {([100, 1000, 10000] as const).map((n) => (
              <button
                key={n}
                type="button"
                className="button-small"
                aria-pressed={kills === n}
                onClick={() => setKills(n)}
              >
                {ko ? `${n.toLocaleString()}회 처치` : `${n.toLocaleString()} Kills`}
              </button>
            ))}
            <button type="button" className="button-small" onClick={() => setSimSeed((s) => s + 1)}>
              {ko ? `시드 재추첨 (#${simSeed})` : `Reroll Seed (#${simSeed})`}
            </button>
          </div>
        </div>

        {simRows.length > 0 ? (
          <div className="dev-table-wrap">
            <table className="dev-table">
              <thead>
                <tr>
                  <th>{ko ? "아이템" : "Item"}</th>
                  <th>{ko ? "설정 확률 · 수량" : "Configured Chance & Qty"}</th>
                  <th>
                    {ko ? `${kills.toLocaleString()}회 총 획득` : `Total Dropped (${kills.toLocaleString()})`}
                  </th>
                  <th>{ko ? "1회당 평균" : "Avg / Kill"}</th>
                  <th>{ko ? "총 추정 가치" : "Est. Total Value"}</th>
                </tr>
              </thead>
              <tbody>
                {simRows.map((row, idx) => {
                  const info = itemById.get(row.item);
                  const cfg = drops[idx];
                  const totalValue = (info?.startPrice ?? 0) * row.totalQty;
                  return (
                    <tr key={`${row.item}-${idx}`}>
                      <td>
                        <strong>{info ? (ko ? info.name.ko : info.name.en) : row.item}</strong>{" "}
                        <span className="dev-muted">({row.item})</span>
                      </td>
                      <td>{cfg ? `${(cfg.chancePm / 10).toFixed(1)}% · ${cfg.min}~${cfg.max}` : "-"}</td>
                      <td>
                        <strong>{row.totalQty.toLocaleString()}</strong>
                      </td>
                      <td>{row.avgPerKill}</td>
                      <td>{totalValue > 0 ? totalValue.toLocaleString() : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="field-hint">
            {ko
              ? "드롭 테이블에 아이템을 추가하면 시뮬레이션 결과가 표시됩니다."
              : "Add drop items to simulate."}
          </p>
        )}
      </section>
    </div>
  );
}
