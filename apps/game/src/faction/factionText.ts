// 세력 화면 문구 — 서버가 보낸 값(체제·띠·명분·안건 등)을 지금 언어의 글로. 키로 고르는 문구는 정적 표에 둔다(m[키]는 oxlint가 막는다).
// 목록이 늘면 satisfies가 빠진 값을 알려 준다(@terra/shared/faction의 목록과 같은 키).
// 사람이 지은 이름(세력·도시·사람·세력 화폐)은 번역하지 않고 그대로 보인다(D-6046).
import type {
  AgendaKind,
  AssetBalance,
  CasusBelli,
  CityPolicy,
  DevelopmentFactor,
  FactionKind,
  FactionStage,
  IndependencePath,
  LockableFeature,
  OccupationStep,
  OfferState,
  OfficialState,
  Regime,
  RelationBand,
  SiegeSide,
  StepState,
  TreatyDecision,
  TreatyKind,
  UnrestLevel,
  VotingRule,
  WarStage,
} from "@terra/shared/faction";
import { m } from "../paraglide/messages.js";
import type { FactionTab } from "./factionView.ts";

type Text = () => string;

export const TAB_NAMES = {
  cities: m.faction_tab_cities,
  diplomacy: m.faction_tab_diplomacy,
  wars: m.faction_tab_wars,
  votes: m.faction_tab_votes,
  shares: m.faction_tab_shares,
} satisfies Record<FactionTab, Text>;

export const STAGE_NAMES = {
  individual: m.faction_stage_individual,
  faction: m.faction_stage_faction,
  nation: m.faction_stage_nation,
} satisfies Record<FactionStage, Text>;

export const KIND_NAMES = {
  npc: m.faction_kind_npc,
  player: m.faction_kind_player,
} satisfies Record<FactionKind, Text>;

export const REGIME_NAMES = {
  dictatorship: m.faction_regime_dictatorship,
  democracy: m.faction_regime_democracy,
  capitalism: m.faction_regime_capitalism,
} satisfies Record<Regime, Text>;

export const RULE_TEXT = {
  leader: m.faction_rule_leader,
  per_family: m.faction_rule_per_family,
  by_shares: m.faction_rule_by_shares,
} satisfies Record<VotingRule, Text>;

export const LOCK_NAMES = {
  currency_issue: m.faction_lock_currency_issue,
  tax_rate: m.faction_lock_tax_rate,
  national_bond: m.faction_lock_national_bond,
} satisfies Record<LockableFeature, Text>;

export const UNREST_NAMES = {
  stable: m.faction_unrest_stable,
  sabotage: m.faction_unrest_sabotage,
  warning: m.faction_unrest_warning,
  rebellion: m.faction_unrest_rebellion,
} satisfies Record<UnrestLevel, Text>;

export const DEVELOPMENT_NAMES = {
  population: m.faction_dev_population,
  buildings: m.faction_dev_buildings,
  economy: m.faction_dev_economy,
  culture_faith: m.faction_dev_culture_faith,
  education: m.faction_dev_education,
  health: m.faction_dev_health,
  environment: m.faction_dev_environment,
} satisfies Record<DevelopmentFactor, Text>;

export const SIDE_NAMES = {
  north: m.faction_war_side_north,
  east: m.faction_war_side_east,
  south: m.faction_war_side_south,
  west: m.faction_war_side_west,
} satisfies Record<SiegeSide, Text>;

export const POLICY_NAMES = {
  growth: m.faction_policy_growth,
  defense: m.faction_policy_defense,
  production: m.faction_policy_production,
  balance: m.faction_policy_balance,
} satisfies Record<CityPolicy, Text>;

export const BAND_NAMES = {
  hostile: m.faction_band_hostile,
  wary: m.faction_band_wary,
  neutral: m.faction_band_neutral,
  cordial: m.faction_band_cordial,
  friendly: m.faction_band_friendly,
  trusted: m.faction_band_trusted,
} satisfies Record<RelationBand, Text>;

export const STATE_NAMES = {
  alliance: m.faction_state_alliance,
  neutral: m.faction_state_neutral,
  war: m.faction_state_war,
} satisfies Record<OfficialState, Text>;

export const TREATY_NAMES = {
  trade: m.faction_treaty_trade,
  non_aggression: m.faction_treaty_non_aggression,
  alliance: m.faction_treaty_alliance,
  protection: m.faction_treaty_protection,
  territory_transfer: m.faction_treaty_territory_transfer,
  ceasefire: m.faction_treaty_ceasefire,
  vision_share: m.faction_treaty_vision_share,
  military_access: m.faction_treaty_military_access,
  joint_purification: m.faction_treaty_joint_purification,
  exchange: m.faction_treaty_exchange,
} satisfies Record<TreatyKind, Text>;

/** 조약을 맺는 길(D-444 167): 줄 아래 작은 글 */
export const TREATY_DECISION_NOTES = {
  vote: m.faction_treaty_offer_note_vote,
  short_vote: m.faction_treaty_offer_note_short,
  leader: m.faction_treaty_offer_note_leader,
} satisfies Record<TreatyDecision, Text>;

export const CASUS_NAMES = {
  territory_dispute: m.faction_casus_territory_dispute,
  raid_retaliation: m.faction_casus_raid_retaliation,
  liberation: m.faction_casus_liberation,
  suzerainty: m.faction_casus_suzerainty,
  sanction: m.faction_casus_sanction,
  none: m.faction_casus_none,
} satisfies Record<CasusBelli, Text>;

export const WAR_STAGE_NAMES = {
  declared: m.faction_war_stage_declared,
  defense_time_pending: m.faction_war_stage_defense_time_pending,
  siege_scheduled: m.faction_war_stage_siege_scheduled,
  peace_talks: m.faction_war_stage_peace_talks,
} satisfies Record<WarStage, Text>;

export const AGENDA_NAMES = {
  leader_election: m.faction_agenda_leader_election,
  leader_removal: m.faction_agenda_leader_removal,
  regime_change: m.faction_agenda_regime_change,
  declare_war: m.faction_agenda_declare_war,
  accept_peace: m.faction_agenda_accept_peace,
  alliance_treaty: m.faction_agenda_alliance_treaty,
  protection_treaty: m.faction_agenda_protection_treaty,
  currency_stage: m.faction_agenda_currency_stage,
  tax_change: m.faction_agenda_tax_change,
  bond_issue: m.faction_agenda_bond_issue,
  city_sale: m.faction_agenda_city_sale,
  independence: m.faction_agenda_independence,
  accept_vassal: m.faction_agenda_accept_vassal,
  mayor_appointment: m.faction_agenda_mayor_appointment,
} satisfies Record<AgendaKind, Text>;

export const PATH_TEXT = {
  share_vote: m.faction_path_share_vote,
  family_vote: m.faction_path_family_vote,
  rebellion_only: m.faction_path_rebellion_only,
  none_start_city: m.faction_path_none_start_city,
} satisfies Record<IndependencePath, Text>;

export const STEP_NAMES = {
  loot_or_integrate: m.faction_step_loot_or_integrate,
  regime: m.faction_step_regime,
  shares: m.faction_step_shares,
  incorporation: m.faction_step_incorporation,
  restoration: m.faction_step_restoration,
} satisfies Record<OccupationStep, Text>;

export const STEP_STATE_NAMES = {
  done: m.faction_step_done,
  pending: m.faction_step_pending,
  skipped: m.faction_step_skipped,
} satisfies Record<StepState, Text>;

export const OFFER_NAMES = {
  pending: m.faction_offer_pending,
  accepted: m.faction_offer_accepted,
  refused: m.faction_offer_refused,
  expired: m.faction_offer_expired,
} satisfies Record<OfferState, Text>;

/** 기기가 아는 원장 자산 이름(사람이 지은 이름이 없을 때). 모르는 코드는 코드 그대로 */
const ASSET_NAMES: Readonly<Record<string, Text>> = {
  s3_test_credit: m.screen_asset_s3_test_credit,
  s3_test_ore: m.screen_asset_s3_test_ore,
};

export function assetName(balance: Pick<AssetBalance, "asset" | "name">): string {
  if (balance.name !== null) return balance.name;
  const known = Object.hasOwn(ASSET_NAMES, balance.asset) ? ASSET_NAMES[balance.asset] : undefined;
  return known === undefined ? balance.asset : known();
}
