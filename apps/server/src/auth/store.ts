// 계정 DB 작업 — 들어가기·비밀번호 찾기(HTTP), 관리자 기능(tRPC), 관리 명령(CLI)이 같이 쓴다.
// 바꾸는 일과 감사 기록은 한 트랜잭션에 넣는다(감사 기록 없이 바뀌는 일이 없게).
// 비밀번호 해시는 Better Auth의 것(scrypt)을 그대로 쓴다. 비밀번호·이메일·토큰은 감사 기록에 넣지 않는다.
import { createHash, timingSafeEqual } from "node:crypto";
import { type Role, isLoginIdKey } from "@terra/shared";
import { and, count, eq, ne, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { type AuditActorKind, accountRecovery, accounts, auditLog, sessions, users } from "../db/schema.ts";
import type { TerraAuth } from "./auth.ts";
import { parseRoleString, sortRoles } from "./permissions.ts";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

/** 바깥에 알려도 되는 계정 정보(이메일·해시 없음) */
export interface AccountRow {
  id: string;
  /** 입력한 모양의 로그인 아이디 */
  loginId: string;
  /** 소문자 키 */
  key: string;
  roles: Role[];
  banned: boolean;
  createdAt: Date;
}

/** 누가 했는지 — 감사 기록용 */
export interface AuditActor {
  kind: AuditActorKind;
  /** 계정 UUID. 관리 명령(cli)·시스템이면 null */
  id: string | null;
  /** 접속 주소(request.ip). 관리 명령이면 null */
  ip: string | null;
  /** 덧붙일 정보(예: 관리 명령의 실행자 TIC_ACTOR) */
  meta?: Record<string, unknown> | undefined;
}

export type AccountErrorCode = "USER_NOT_FOUND" | "LAST_ADMIN";

/** 호출한 쪽이 사용자·관리자에게 알릴 수 있는 실패 */
export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(code);
    this.name = "AccountError";
  }
}

/** 역할 바꾸기를 한 줄로 세우는 DB 잠금 키(트랜잭션 잠금). 마지막 admin 확인이 동시에 통과하지 않게 */
const ROLE_CHANGE_LOCK = 7_301_001;
/** 역할 문자열에 admin이 들어 있는지(쉼표 구분) */
const HAS_ADMIN = sql`${users.role} ~ '(^|,)admin(,|$)'`;

const accountColumns = {
  id: users.id,
  loginId: users.name,
  key: users.username,
  role: users.role,
  banned: users.banned,
  createdAt: users.createdAt,
};

type AccountSelect = {
  id: string;
  loginId: string;
  key: string;
  role: string;
  banned: boolean;
  createdAt: Date;
};

function toAccountRow(row: AccountSelect): AccountRow {
  return {
    id: row.id,
    loginId: row.loginId,
    key: row.key,
    roles: parseRoleString(row.role),
    banned: row.banned,
    createdAt: row.createdAt,
  };
}

export async function findAccountByKey(db: Executor, key: string): Promise<AccountRow | null> {
  if (!isLoginIdKey(key)) return null;
  const [row] = await db.select(accountColumns).from(users).where(eq(users.username, key)).limit(1);
  return row ? toAccountRow(row) : null;
}

export async function findAccountById(db: Executor, id: string): Promise<AccountRow | null> {
  const [row] = await db.select(accountColumns).from(users).where(eq(users.id, id)).limit(1);
  return row ? toAccountRow(row) : null;
}

export interface AuditEntry {
  actor: AuditActor;
  action: string;
  targetId: string | null;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(db: Executor, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorKind: entry.actor.kind,
    actorId: entry.actor.id,
    action: entry.action,
    targetId: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.actor.ip,
    meta: entry.actor.meta ?? null,
  });
}

/** 복구 이메일 저장(소문자). 이미 있으면 바꾼다 */
export async function saveRecoveryEmail(db: Executor, userId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await db
    .insert(accountRecovery)
    .values({ userId, email: normalized })
    .onConflictDoUpdate({
      target: accountRecovery.userId,
      set: { email: normalized, updatedAt: new Date() },
    });
}

/** 저장된 복구 이메일과 같은지. 없으면 false. 비교는 해시끼리 고정 시간으로 한다 */
export async function recoveryEmailMatches(db: Executor, userId: string, email: string): Promise<boolean> {
  const [row] = await db
    .select({ email: accountRecovery.email })
    .from(accountRecovery)
    .where(eq(accountRecovery.userId, userId))
    .limit(1);
  if (!row) return false;
  return timingSafeEqual(sha256(row.email), sha256(email.trim().toLowerCase()));
}

function sha256(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

export interface SetRolesInput {
  userId: string;
  roles: readonly Role[];
  actor: AuditActor;
  /** 감사 기록 action (기본 account.set_roles) */
  action?: string;
}

/**
 * 역할을 바꾼다. 마지막 admin(정지되지 않은 계정 기준)의 admin 역할은 뺄 수 없다.
 * 역할 바꾸기는 DB 잠금으로 한 번에 하나씩 → 동시에 두 admin이 서로를 내려도 admin이 0명이 되지 않는다.
 */
export async function setAccountRoles(
  db: Database,
  input: SetRolesInput,
): Promise<{ before: Role[]; account: AccountRow }> {
  const next = sortRoles(input.roles);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ROLE_CHANGE_LOCK})`);
    const [current] = await tx
      .select(accountColumns)
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update")
      .limit(1);
    if (!current) throw new AccountError("USER_NOT_FOUND");
    const before = parseRoleString(current.role);
    if (before.includes("admin") && !next.includes("admin")) {
      const [others] = await tx
        .select({ n: count() })
        .from(users)
        .where(and(HAS_ADMIN, eq(users.banned, false), ne(users.id, input.userId)));
      if ((others?.n ?? 0) === 0) throw new AccountError("LAST_ADMIN");
    }
    const [updated] = await tx
      .update(users)
      .set({ role: next.join(","), updatedAt: new Date() })
      .where(eq(users.id, input.userId))
      .returning(accountColumns);
    if (!updated) throw new AccountError("USER_NOT_FOUND");
    await writeAudit(tx, {
      actor: input.actor,
      action: input.action ?? "account.set_roles",
      targetId: input.userId,
      before: { roles: before },
      after: { roles: next },
    });
    return { before, account: toAccountRow(updated) };
  });
}

export interface SetPasswordInput {
  userId: string;
  password: string;
  actor: AuditActor;
  action: string;
  /** 감사 기록에 덧붙일 것(예: { weakPassword: true }). 비밀번호는 넣지 않는다 */
  after?: Record<string, unknown> | undefined;
}

/**
 * 비밀번호를 바꾸고 그 계정의 세션을 모두 끊는다(쿠키 캐시를 끄고 쓰므로 바로 끊긴다).
 * 길이·흔한 비밀번호 규칙은 부르는 쪽이 본다(관리 명령은 --allow-weak로 건너뛸 수 있다).
 */
export async function setAccountPassword(
  db: Database,
  auth: TerraAuth,
  input: SetPasswordInput,
): Promise<{ revokedSessions: number }> {
  const context = await auth.$context;
  const hash = await context.password.hash(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update");
    if (!user) throw new AccountError("USER_NOT_FOUND");
    const updated = await tx
      .update(accounts)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(accounts.userId, input.userId), eq(accounts.providerId, "credential")))
      .returning({ id: accounts.id });
    if (updated.length === 0) {
      await tx
        .insert(accounts)
        .values({ userId: input.userId, accountId: input.userId, providerId: "credential", password: hash });
    }
    const revoked = await tx
      .delete(sessions)
      .where(eq(sessions.userId, input.userId))
      .returning({ id: sessions.id });
    await writeAudit(tx, {
      actor: input.actor,
      action: input.action,
      targetId: input.userId,
      after: { revokedSessions: revoked.length, ...input.after },
    });
    return { revokedSessions: revoked.length };
  });
}
