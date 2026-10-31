// 유닛 화면의 칸 다섯 — 파티(D-179 진형), 직무 프리셋(D-6016), 관리인(D-246), 경매소(D-242·D-271), 포로(D-244·D-269).
// 파티·프리셋·관리인·경매소는 아직 서버 시스템이 없어 시안 자료로만 채워진다(실제 계정은 빈 안내). 포로는 실제 세계 자료다.
// 바꾸는 동작은 모두 "곧 열림"이다(명령은 WebSocket으로 만들 때 켠다).
import type { RosterUnit, UnitsListResponse } from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
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

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel roster-empty-panel">
      <p className="roster-empty-title">{title}</p>
      <p className="lead">{body}</p>
    </div>
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
          {data.parties.map((party) => {
            const spots = Array.from({ length: PARTY_MAX }, (_, spot) =>
              party.members.find((member) => member.spot === spot),
            );
            return (
              <li key={party.id} className="panel units-card">
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
                <div className="units-formation" aria-label={m.units_formation_label()}>
                  <span className="units-formation-row-label">{m.units_formation_front()}</span>
                  <span className="units-formation-row-label units-formation-back">
                    {m.units_formation_back()}
                  </span>
                  {spots.map((member, spot) => {
                    const unit = member ? byId.get(member.unit) : undefined;
                    return (
                      <div
                        // 진형 자리는 0~5로 정해져 있다
                        key={`spot-${String(spot)}`}
                        className="units-spot"
                        data-empty={unit ? undefined : "true"}
                        data-row={spot < 3 ? "front" : "back"}
                      >
                        {unit && member ? (
                          <>
                            <UnitAvatar unit={unit} />
                            <span className="units-spot-name">{unitLabel(unit)}</span>
                            <span className="units-spot-role">{roleLabel(member.role)}</span>
                          </>
                        ) : (
                          <span className="units-spot-empty">{m.units_spot_empty()}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="units-card-actions">
                  <SoonButton label={m.units_action_edit_party()} />
                </div>
              </li>
            );
          })}
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
