// 감사 기록 한 줄 → 사람이 읽는 말(운영자 콘솔 감사 기록 탭). 순수 함수라 시험한다(auditText.test.ts).
// 동작 이름(account.set_roles 등)은 표의 문구로, 내용(before·after·meta JSON)은 동작마다 짧은 문장으로 바꾼다.
// 모르는 동작은 원래 이름과 "칸=값" 몇 개를 보인다(원본 JSON은 화면에서 펼쳐 본다).
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_IDS,
  type AuditCategory,
  type OpsAuditRow,
  isOpsPermission,
} from "@terra/shared/ops";
import { isRole } from "@terra/shared";
import { m } from "../paraglide/messages.js";

/** 동작 이름 → 문구 */
const ACTION_LABELS: { readonly [action: string]: () => string } = {
  "account.create": m.audit_act_account_create,
  "account.password_reset": m.audit_act_password_reset,
  "account.set_roles": m.audit_act_set_roles,
  "cli.create_user": m.audit_act_account_create,
  "cli.set_password": m.audit_act_password_reset,
  "cli.set_roles": m.audit_act_set_roles,
  "second_map.observe": m.audit_act_observe,
  "second_map.operator_command": m.audit_act_operator_command,
  "planet_editor.read_definitions": m.audit_act_read_definitions,
  "ops.kick": m.audit_act_kick,
  "ops.ban": m.audit_act_ban,
  "ops.unban": m.audit_act_unban,
  "ops.unit.stop": m.audit_act_unit_stop,
  "ops.unit.rescue": m.audit_act_unit_rescue,
  "ops.unit.heal": m.audit_act_unit_heal,
  "ops.unit.teleport": m.audit_act_unit_teleport,
  "ops.grant": m.audit_act_grant,
  "ops.revoke": m.audit_act_revoke,
  "ops.set_grants": m.audit_act_set_grants,
  "ops.switch": m.audit_act_switch,
  "ops.faction_profile": m.audit_act_faction_profile,
  "ops.currency_profile": m.audit_act_currency_profile,
  "tuning.apply": m.audit_act_tuning_apply,
  "tuning.revert_all": m.audit_act_tuning_revert,
  "content.apply": m.audit_act_content_apply,
  "world.reset": m.audit_act_world_reset,
  "world.relayout_city": m.audit_act_world_relayout,
};

const CATEGORY_LABELS: { readonly [C in AuditCategory]: () => string } = {
  account: m.audit_cat_account,
  ops: m.audit_cat_ops,
  map: m.audit_cat_map,
  tuning: m.audit_cat_tuning,
  content: m.audit_cat_content,
  planet: m.audit_cat_planet,
  world: m.audit_cat_world,
};

const ROLE_TEXT: { readonly [role: string]: () => string } = {
  player: m.role_player,
  gm: m.role_gm,
  dev: m.role_dev,
  admin: m.role_admin,
};

const PERMISSION_TEXT: { readonly [permission: string]: () => string } = {
  view_players: m.ops_perm_view_players,
  view_npcs: m.ops_perm_view_npcs,
  view_economy: m.ops_perm_view_economy,
  view_audit: m.ops_perm_view_audit,
  view_server: m.ops_perm_view_server,
  account_kick: m.ops_perm_account_kick,
  account_ban: m.ops_perm_account_ban,
  unit_stop: m.ops_perm_unit_stop,
  unit_rescue: m.ops_perm_unit_rescue,
  unit_heal: m.ops_perm_unit_heal,
  unit_teleport: m.ops_perm_unit_teleport,
  ledger_grant: m.ops_perm_ledger_grant,
  manage_grants: m.ops_perm_manage_grants,
  log_switch: m.ops_perm_log_switch,
  faction_edit: m.ops_perm_faction_edit,
  emblem_moderate: m.ops_perm_emblem_moderate,
};

const own = <T>(table: { readonly [key: string]: T }, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

export function categoryLabel(category: AuditCategory): string {
  return CATEGORY_LABELS[category]();
}

/** 동작이 속한 분류(없으면 null) */
export function auditCategoryOf(action: string): AuditCategory | null {
  for (const category of AUDIT_CATEGORY_IDS) {
    const prefixes: readonly string[] = AUDIT_CATEGORIES[category];
    if (prefixes.some((prefix) => action.startsWith(prefix))) return category;
  }
  return null;
}

export function actionLabel(action: string): string {
  return own(ACTION_LABELS, action)?.() ?? action;
}

export function actorText(row: Pick<OpsAuditRow, "actorLoginId" | "actorKind">): string {
  if (row.actorLoginId) return row.actorLoginId;
  if (row.actorKind === "system") return m.audit_actor_system();
  if (row.actorKind === "cli") return m.audit_actor_cli();
  return m.ops_none();
}

// ── JSON 칸 읽기(모양을 믿지 않는다) ──
type Json = { readonly [key: string]: unknown };
const isJson = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const asObject = (value: unknown): Json | undefined => (isJson(value) ? value : undefined);
const field = (value: unknown, key: string): unknown => asObject(value)?.[key];
const text = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : undefined;
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : [];

const rolesText = (value: unknown): string => {
  const roles = list(field(value, "roles"));
  if (roles.length === 0) return m.ops_none();
  return roles.map((role) => (isRole(role) ? (own(ROLE_TEXT, role)?.() ?? role) : role)).join(", ");
};
const permissionsText = (value: unknown): string => {
  const permissions = list(field(value, "granted"));
  if (permissions.length === 0) return m.ops_none();
  return permissions.map((p) => (isOpsPermission(p) ? (own(PERMISSION_TEXT, p)?.() ?? p) : p)).join(", ");
};
const onOff = (value: unknown): string => (value === true ? m.admin_log_on() : m.admin_log_off());

/** 짧게 "칸=값" 몇 개(모르는 동작) */
function genericText(row: OpsAuditRow): string {
  const source = asObject(row.after) ?? asObject(row.meta) ?? asObject(row.before);
  if (!source) return "";
  return Object.entries(source)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${text(value) ?? (Array.isArray(value) ? `[${value.length}]` : "…")}`)
    .join(" · ");
}

/** 내용 한 줄(사유가 있으면 끝에 붙는다) */
export function auditSummary(row: OpsAuditRow): string {
  const unitId = text(field(row.meta, "unitId"));
  let body: string;
  switch (row.action) {
    case "account.set_roles":
    case "cli.set_roles":
      body = m.audit_sum_roles({ before: rolesText(row.before), after: rolesText(row.after) });
      break;
    case "account.create":
    case "cli.create_user":
      body = m.audit_sum_created({ roles: rolesText(row.after) });
      break;
    case "second_map.observe":
      body = m.audit_sum_map({ map: text(field(row.after, "mapKey")) ?? m.ops_none() });
      break;
    case "second_map.operator_command":
      body = m.audit_sum_unit({ unit: text(field(row.after, "unitId")) ?? m.ops_none() });
      break;
    case "planet_editor.read_definitions":
      body = list(field(row.after, "planetIds")).join(", ");
      break;
    case "ops.kick":
      body = m.audit_sum_kick({ count: text(field(row.after, "revoked")) ?? "0" });
      break;
    case "ops.ban": {
      const expires = text(field(row.after, "expires"));
      body = expires ? m.audit_sum_ban_until({ until: formatAuditTime(expires) }) : m.audit_sum_ban_forever();
      break;
    }
    case "ops.unit.teleport":
      body = m.audit_sum_teleport({
        unit: unitId ?? m.ops_none(),
        x: text(field(row.after, "cellX")) ?? "?",
        y: text(field(row.after, "cellY")) ?? "?",
      });
      break;
    case "ops.unit.stop":
    case "ops.unit.rescue":
    case "ops.unit.heal":
      body = m.audit_sum_unit({ unit: unitId ?? m.ops_none() });
      break;
    case "ops.grant":
    case "ops.revoke":
      body = m.audit_sum_grant({
        asset: text(field(row.after, "asset")) ?? "?",
        amount: text(field(row.after, "amount")) ?? "?",
        balance: text(field(row.after, "balance")) ?? "?",
      });
      break;
    case "ops.set_grants":
      body = m.audit_sum_grants({ before: permissionsText(row.before), after: permissionsText(row.after) });
      break;
    case "ops.faction_profile": {
      const side = (value: unknown): string =>
        [text(field(value, "shortName")), text(field(value, "name")), text(field(value, "color"))]
          .filter((part) => part !== undefined)
          .join(" ");
      body = m.audit_sum_roles({ before: side(row.before), after: side(row.after) });
      break;
    }
    case "ops.currency_profile": {
      const side = (value: unknown): string =>
        [text(field(value, "symbol")), text(field(value, "ticker")), text(field(value, "name"))]
          .filter((part) => part !== undefined)
          .join(" ");
      body = m.audit_sum_roles({ before: side(row.before), after: side(row.after) });
      break;
    }
    case "ops.switch":
      body = m.audit_sum_switch({
        before: onOff(field(row.before, "view_audit")),
        after: onOff(field(row.after, "view_audit")),
      });
      break;
    default:
      body = genericText(row);
  }
  const reason = text(field(row.meta, "reason"));
  return reason ? m.audit_sum_reason({ text: body, reason }) : body;
}

/** 대상: 계정 아이디 → 유닛 → 세력 소유 주체 → ID 앞 8자 */
/** 감사 기록 대상으로 건너뛸 곳(계정 → 유저 상세, 유닛 → 유닛 상세, 세력 → 세력 상세). 없으면 null */
export function auditTargetLink(
  row: OpsAuditRow,
): { kind: "user"; id: string } | { kind: "unit"; id: number } | { kind: "faction"; id: number } | null {
  if (row.targetLoginId && row.targetId) return { kind: "user", id: row.targetId };
  const unitId = Number(text(field(row.meta, "unitId")));
  if (Number.isSafeInteger(unitId) && unitId > 0) return { kind: "unit", id: unitId };
  const factionId = Number(text(field(row.meta, "factionId")));
  if (Number.isSafeInteger(factionId) && factionId > 0) return { kind: "faction", id: factionId };
  return null;
}

export function targetText(row: OpsAuditRow): string {
  if (row.targetLoginId) return row.targetLoginId;
  const unitId = text(field(row.meta, "unitId"));
  if (unitId) return m.audit_target_unit({ unit: unitId });
  const factionId = text(field(row.meta, "factionId"));
  if (factionId) return m.audit_target_faction({ faction: factionId });
  return row.targetId ? row.targetId.slice(0, 8) : m.ops_none();
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });
function formatAuditTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : timeFormat.format(time);
}
