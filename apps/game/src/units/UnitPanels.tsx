// 유닛 화면의 칸 다섯 — 파티(D-179 진형), 직무 프리셋(D-6016), 관리인(D-246), 경매소(D-242·D-271), 포로(D-244·D-269).
// 파티·프리셋·관리인·경매소는 아직 서버 시스템이 없어 시안 자료로만 채워진다(실제 계정은 빈 안내). 포로는 실제 세계 자료다.
// 바꾸는 동작은 모두 "곧 열림"이다(명령은 WebSocket으로 만들 때 켠다).
import {
  FORMATION_DEPTH,
  FORMATION_PRESETS,
  FORMATION_WIDTH,
  FORMATION_X_MIN,
  FORMATION_Y_MIN,
  type FormationPoint,
  type FormationPresetId,
  type RosterParty,
  type RosterUnit,
  type UnitsListResponse,
  isValidFormationPoint,
  presetFormationPoint,
  rowFromFormationY,
} from "@terra/shared/roster";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { PreviewTag, SoonButton } from "../roster/parts.tsx";
import {
  formatAmount,
  formatNumber,
  houseLabel,
  injuryLabel,
  remaining,
  roleLabel,
  typeLabel,
  unitLabel,
} from "../roster/rosterText.ts";
import { UnitAvatar } from "./UnitDetail.tsx";

/** 파티 최대 인원(D-179: 6) */
const PARTY_MAX = 6;

const X_COLS = Array.from({ length: FORMATION_WIDTH }, (_, i) => FORMATION_X_MIN + i);
const Y_ROWS = Array.from({ length: FORMATION_DEPTH }, (_, i) => FORMATION_Y_MIN + i);

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel roster-empty-panel">
      <p className="roster-empty-title">{title}</p>
      <p className="lead">{body}</p>
    </div>
  );
}

function initialPartyPositions(party: RosterParty): FormationPoint[] {
  const presetId = party.preset ?? "two_row";
  const taken = new Set<string>();
  return party.members.map((member, index) => {
    const candidate =
      member.x !== undefined && member.y !== undefined
        ? { x: member.x, y: member.y }
        : presetFormationPoint(index, presetId);
    const pt = isValidFormationPoint(candidate) ? candidate : presetFormationPoint(index, presetId);
    const key = `${pt.x},${pt.y}`;
    if (!taken.has(key)) {
      taken.add(key);
      return pt;
    }
    for (const y of Y_ROWS) {
      for (const x of X_COLS) {
        const fallbackKey = `${x},${y}`;
        if (!taken.has(fallbackKey)) {
          taken.add(fallbackKey);
          return { x, y };
        }
      }
    }
    return pt;
  });
}

function PartyCard({
  party,
  byId,
}: {
  readonly party: RosterParty;
  readonly byId: ReadonlyMap<string, RosterUnit>;
}) {
  const ko = getLocale() !== "en";
  const locale = ko ? "ko" : "en";
  const baseId = useId();
  const [presetId, setPresetId] = useState<FormationPresetId | "custom">(party.preset ?? "two_row");
  const [positions, setPositions] = useState<readonly FormationPoint[]>(() => initialPartyPositions(party));
  const [selectedIdx, setSelectedIdx] = useState(0);

  const applyPreset = (id: FormationPresetId): void => {
    setPresetId(id);
    setPositions(party.members.map((_, index) => presetFormationPoint(index, id)));
  };

  const moveMemberTo = (memberIndex: number, target: FormationPoint): void => {
    if (!isValidFormationPoint(target)) return;
    setPresetId("custom");
    setPositions((prev) => {
      const current = prev[memberIndex] ?? { x: 0, y: 0 };
      const otherIndex = prev.findIndex(
        (pt, idx) => idx !== memberIndex && pt.x === target.x && pt.y === target.y,
      );
      return prev.map((pt, idx) => {
        if (idx === memberIndex) return target;
        if (idx === otherIndex) return current;
        return pt;
      });
    });
  };

  const onBoardCellClick = (x: number, y: number): void => {
    const occupantIdx = positions.findIndex((pt) => pt.x === x && pt.y === y);
    if (occupantIdx >= 0 && occupantIdx !== selectedIdx) {
      // 이미 다른 유닛이 있는 칸을 누르면 그 유닛을 선택한다
      setSelectedIdx(occupantIdx);
      return;
    }
    if (occupantIdx === -1 && party.members[selectedIdx]) {
      moveMemberTo(selectedIdx, { x, y });
    }
  };

  const activePresetSpec =
    presetId === "custom" ? null : (FORMATION_PRESETS.find((entry) => entry.id === presetId) ?? null);
  const selectedMember = party.members[selectedIdx];
  const selectedUnit = selectedMember ? byId.get(selectedMember.unit) : undefined;
  const selectedPos = positions[selectedIdx] ?? { x: 0, y: 0 };

  return (
    <li className="panel units-card">
      <div className="units-card-head">
        <h2 className="units-card-title">{party.name}</h2>
        <span className="roster-meta">
          {m.units_party_size({
            count: formatNumber(party.members.length),
            max: formatNumber(PARTY_MAX),
          })}
        </span>
        {party.preview ? <PreviewTag /> : null}
      </div>

      {/* 기본 진형 프리셋 선택 바 (2열, 3열, V자 학익진, 역V 쐐기진, 방진·호위, 횡대 산개) */}
      <div className="units-formation-presets" role="group" aria-label={m.units_formation_label()}>
        {FORMATION_PRESETS.map((preset) => {
          const active = presetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={active ? "button-small button-primary" : "button-small"}
              aria-pressed={active}
              onClick={() => applyPreset(preset.id)}
            >
              {preset.name[locale]}
            </button>
          );
        })}
      </div>
      <p className="units-formation-desc">
        {activePresetSpec
          ? activePresetSpec.desc[locale]
          : ko
            ? "자유 배치 — 아래 9×6 배치 구역에서 빈 칸을 누르거나 좌표를 골라 6명의 시작 위치를 자유롭게 지정합니다."
            : "Custom layout — click any cell in the 9×6 deployment box or pick X/Y coordinates to place units freely."}
      </p>

      {/* 자유 배치 진형 사각형 격자 (가로 9칸 x: -4..+4 × 세로 6칸 y: 0..5, 전투맵·2차맵 배치 칸 기준) */}
      <div className="units-formation" aria-label={m.units_formation_label()}>
        <div className="units-formation-edge" data-edge="front">
          <span>
            {ko
              ? "▲ 전방 교전선 (전투맵 중앙 -4칸 · 깊이 y=0)"
              : "▲ Front Line (Battle map center -4 cells · y=0)"}
          </span>
          <span>{ko ? "좌익(-4) ↔ 중앙(0) ↔ 우익(+4)" : "Left(-4) ↔ Center(0) ↔ Right(+4)"}</span>
        </div>

        <div className="units-formation-board" data-cols={FORMATION_WIDTH} data-rows={FORMATION_DEPTH}>
          {Y_ROWS.map((y) =>
            X_COLS.map((x) => {
              const memberIdx = positions.findIndex((pt) => pt.x === x && pt.y === y);
              const member = memberIdx >= 0 ? party.members[memberIdx] : undefined;
              const unit = member ? byId.get(member.unit) : undefined;
              const isSelected = memberIdx >= 0 && memberIdx === selectedIdx;
              const zone = rowFromFormationY(y);
              return (
                <div
                  key={`${x},${y}`}
                  className="units-formation-cell"
                  data-x={x}
                  data-y={y}
                  data-zone={zone}
                  data-occupied={member ? "true" : undefined}
                  data-selected={isSelected ? "true" : undefined}
                  onClick={() => onBoardCellClick(x, y)}
                >
                  {member && unit ? (
                    <span className="units-cell-token" data-role={member.role}>
                      <span className="units-cell-num">#{memberIdx + 1}</span>
                      <span className="units-cell-name">{unitLabel(unit)}</span>
                    </span>
                  ) : (
                    <span className="units-cell-coord">
                      {x === 0 && (y === 0 || y === 5) ? `(0,${y})` : "·"}
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>

        <div className="units-formation-edge" data-edge="back">
          <span>
            {ko
              ? "▼ 후방 (-9칸 · 깊이 y=5) · 배치 범위: 9×6칸 사각형 (2차맵·전투맵 배치 칸)"
              : "▼ Rear (-9 cells · y=5) · Box: 9×6 placement cells"}
          </span>
        </div>
      </div>

      {/* 파티 편성 6슬롯 & 선택 유닛 좌표 제어 */}
      <div className="units-spots-grid">
        {Array.from({ length: PARTY_MAX }, (_, idx) => {
          const member = party.members[idx];
          const unit = member ? byId.get(member.unit) : undefined;
          const pos = positions[idx];
          const active = idx === selectedIdx && Boolean(member);
          return member && unit && pos ? (
            <button
              key={`spot-${String(idx)}`}
              type="button"
              className="units-spot"
              data-selected={active ? "true" : undefined}
              data-row={rowFromFormationY(pos.y)}
              aria-pressed={active}
              onClick={() => setSelectedIdx(idx)}
            >
              <span className="units-spot-badge">#{idx + 1}</span>
              <UnitAvatar unit={unit} />
              <span className="units-spot-name">{unitLabel(unit)}</span>
              <span className="units-spot-role">
                {roleLabel(member.role)} · ({pos.x >= 0 ? `+${pos.x}` : pos.x}, {pos.y})
              </span>
            </button>
          ) : (
            <div key={`spot-${String(idx)}`} className="units-spot" data-empty="true">
              <span className="units-spot-empty">
                #{idx + 1} {m.units_spot_empty()}
              </span>
            </div>
          );
        })}
      </div>

      {selectedMember && selectedUnit ? (
        <div className="units-coord-bar">
          <span className="units-coord-target">
            #{selectedIdx + 1} <strong>{unitLabel(selectedUnit)}</strong>{" "}
            {ko ? "시작 위치:" : "Start position:"}
          </span>
          <label className="units-coord-field" htmlFor={`${baseId}-x`}>
            <span>{ko ? "좌우(X)" : "Lateral(X)"}</span>
            <select
              id={`${baseId}-x`}
              value={selectedPos.x}
              onChange={(event) =>
                moveMemberTo(selectedIdx, { x: Number(event.target.value), y: selectedPos.y })
              }
            >
              {X_COLS.map((x) => (
                <option key={x} value={x}>
                  {x === 0
                    ? ko
                      ? "0 (중앙)"
                      : "0 (Center)"
                    : x < 0
                      ? ko
                        ? `${x} (좌익)`
                        : `${x} (Left)`
                      : ko
                        ? `+${x} (우익)`
                        : `+${x} (Right)`}
                </option>
              ))}
            </select>
          </label>
          <label className="units-coord-field" htmlFor={`${baseId}-y`}>
            <span>{ko ? "전후 깊이(Y)" : "Depth(Y)"}</span>
            <select
              id={`${baseId}-y`}
              value={selectedPos.y}
              onChange={(event) =>
                moveMemberTo(selectedIdx, { x: selectedPos.x, y: Number(event.target.value) })
              }
            >
              {Y_ROWS.map((y) => (
                <option key={y} value={y}>
                  {y === 0
                    ? ko
                      ? "0 (최전방)"
                      : "0 (Front)"
                    : y === 5
                      ? ko
                        ? "5 (최후방)"
                        : "5 (Rear)"
                      : `${y} (${rowFromFormationY(y) === "front" ? (ko ? "전방" : "Front") : rowFromFormationY(y) === "middle" ? (ko ? "중위" : "Mid") : ko ? "후위" : "Rear"})`}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="units-card-actions">
        <SoonButton label={m.units_action_edit_party()} />
      </div>
    </li>
  );
}

export function PartiesPanel({ data }: { data: UnitsListResponse }) {
  const byId = new Map(data.units.map((unit) => [unit.id, unit]));
  return (
    <div className="units-panel-body">
      <p className="roster-note">{m.units_parties_note()}</p>
      {data.parties.length === 0 ? (
        <Empty title={m.units_parties_empty_title()} body={m.units_parties_empty_body()} />
      ) : (
        <ul className="units-cards">
          {data.parties.map((party) => (
            <PartyCard key={party.id} party={party} byId={byId} />
          ))}
        </ul>
      )}
      <div className="units-panel-actions">
        <SoonButton label={m.units_action_new_party()} />
        <SoonButton label={m.units_action_legion()} />
      </div>
    </div>
  );
}

export function PresetsPanel({ data }: { data: UnitsListResponse }) {
  return (
    <div className="units-panel-body">
      <p className="roster-note">{m.units_presets_note()}</p>
      {data.presets.length === 0 ? (
        <Empty title={m.units_presets_empty_title()} body={m.units_presets_empty_body()} />
      ) : (
        <ul className="roster-list roster-list-panel">
          {data.presets.map((preset) => (
            <li key={preset.id} className="roster-list-row">
              <span className="roster-list-main">
                <span className="roster-list-title">
                  {preset.name}
                  {preset.preview ? <PreviewTag /> : null}
                </span>
                <span className="roster-meta">
                  {m.units_preset_assignments({ count: formatNumber(preset.assignments) })}
                </span>
              </span>
              <SoonButton label={m.units_action_apply()} />
            </li>
          ))}
        </ul>
      )}
      <div className="units-panel-actions">
        <SoonButton label={m.units_action_save_preset()} />
      </div>
    </div>
  );
}

export function ManagersPanel({ data }: { data: UnitsListResponse }) {
  const byId = new Map(data.units.map((unit) => [unit.id, unit]));
  return (
    <div className="units-panel-body">
      <p className="roster-note">{m.units_managers_note()}</p>
      {data.bases.length === 0 ? (
        <Empty title={m.units_managers_empty_title()} body={m.units_managers_empty_body()} />
      ) : (
        <ul className="roster-list roster-list-panel">
          {data.bases.map((base) => {
            const manager = base.manager === null ? undefined : byId.get(base.manager);
            return (
              <li key={base.id} className="roster-list-row">
                <span className="roster-list-main">
                  <span className="roster-list-title">
                    {base.name}
                    {base.preview ? <PreviewTag /> : null}
                  </span>
                  <span className="roster-meta">
                    {manager ? m.units_manager_auto({ name: unitLabel(manager) }) : m.units_manager_none()}
                  </span>
                </span>
                <SoonButton
                  label={manager ? m.units_action_change_manager() : m.units_action_pick_manager()}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AuctionPanel({ data }: { data: UnitsListResponse }) {
  return (
    <div className="units-panel-body">
      <p className="roster-note">{m.units_auction_note()}</p>
      {data.auction.length === 0 ? (
        <Empty title={m.units_auction_empty_title()} body={m.units_auction_empty_body()} />
      ) : (
        <ul className="roster-list roster-list-panel">
          {data.auction.map((lot) => {
            const left = remaining(lot.endsAtMs, data.generatedAt);
            return (
              <li key={lot.id} className="roster-list-row units-lot">
                <span className="roster-list-main">
                  <span className="roster-list-title">
                    {lot.name}
                    {lot.preview ? <PreviewTag /> : null}
                  </span>
                  <span className="roster-meta">
                    {[
                      houseLabel(lot.house),
                      lot.level === null ? null : m.roster_level({ level: formatNumber(lot.level) }),
                      left ? m.units_lot_ends({ time: left }) : m.units_lot_ended(),
                    ]
                      .filter((part) => part !== null)
                      .join(" · ")}
                  </span>
                  <span className="units-lot-prices">
                    <span>{m.units_lot_bid({ amount: formatAmount(lot.bid) })}</span>
                    {lot.buyout ? (
                      <span>{m.units_lot_buyout({ amount: formatAmount(lot.buyout) })}</span>
                    ) : null}
                  </span>
                </span>
                <span className="units-lot-actions">
                  <SoonButton label={m.units_action_bid()} />
                  {lot.buyout ? <SoonButton label={m.units_action_buyout()} /> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CaptiveRow({ unit, now }: { unit: RosterUnit; now: number }) {
  const injury = injuryLabel(unit.injury.stage);
  const heal = unit.injury.untilMs === null ? null : remaining(unit.injury.untilMs, now);
  return (
    <li className="roster-list-row">
      <span className="roster-list-main">
        <span className="roster-list-title">
          {unitLabel(unit)}
          {unit.preview ? <PreviewTag /> : null}
        </span>
        <span className="roster-meta">
          {[
            typeLabel(unit.type),
            injury ? (heal ? m.roster_injury_heal({ stage: injury, time: heal }) : injury) : null,
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </span>
      </span>
      <SoonButton label={m.units_action_ransom_pay()} />
    </li>
  );
}

export function PrisonersPanel({ data }: { data: UnitsListResponse }) {
  const captives = data.units.filter((unit) => unit.captive);
  return (
    <div className="units-panel-body">
      <p className="roster-note">{m.units_prisoners_note()}</p>
      <h2 className="roster-subtitle">{m.units_prisoners_held()}</h2>
      {data.prisoners.length === 0 ? (
        <p className="roster-empty">{m.units_prisoners_held_empty()}</p>
      ) : (
        <ul className="roster-list roster-list-panel">
          {data.prisoners.map((prisoner) => {
            const injury = injuryLabel(prisoner.injury.stage);
            const label = unitLabel(prisoner);
            return (
              <li key={prisoner.id} className="roster-list-row units-prisoner">
                <span className="roster-list-main">
                  <span className="roster-list-title">
                    {label}
                    {prisoner.preview ? <PreviewTag /> : null}
                  </span>
                  <span className="roster-meta">
                    {[
                      typeLabel(prisoner.type),
                      prisoner.owner ? m.units_prisoner_owner({ name: prisoner.owner }) : null,
                      injury,
                      prisoner.marketValue
                        ? m.units_prisoner_value({ amount: formatAmount(prisoner.marketValue) })
                        : null,
                    ]
                      .filter((part) => part !== null)
                      .join(" · ")}
                  </span>
                </span>
                <span className="units-lot-actions">
                  <SoonButton label={m.units_action_ransom()} />
                  <SoonButton label={m.units_action_persuade()} />
                  <SoonButton label={m.units_action_execute()} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <h2 className="roster-subtitle">{m.units_prisoners_mine()}</h2>
      {captives.length === 0 ? (
        <p className="roster-empty">{m.units_prisoners_mine_empty()}</p>
      ) : (
        <ul className="roster-list roster-list-panel">
          {captives.map((unit) => (
            <CaptiveRow key={unit.id} unit={unit} now={data.generatedAt} />
          ))}
        </ul>
      )}
    </div>
  );
}
