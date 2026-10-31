// 관리 명령 — 계정 만들기, 역할 바꾸기, 비밀번호 바꾸기 (ADR 2026-10-28-auth-and-accounts)
// 운영 컨테이너 안에서 돈다: docker exec -e TIC_PASSWORD -e TIC_ACTOR tic-app node dist/cli.js <명령> …
// (GitHub Actions 수동 작업 .github/workflows/account-admin.yml이 부른다)
// - 비밀번호는 환경 변수 TIC_PASSWORD로만 받는다. 명령줄 인자는 프로세스 목록·셸 기록에 남는다.
// - 실행자는 TIC_ACTOR(예: "github:<계정>:run <번호>")로 감사 기록에 남긴다(actor_kind: cli).
// - 출력에 비밀번호·이메일·토큰을 쓰지 않는다.
import { parseArgs } from "node:util";
import { DEFAULT_ROLE, type Role, isRole, parseLoginId } from "@terra/shared";
import { type TerraAuth, createAuth, placeholderEmail, verifyAuth } from "../auth/auth.ts";
import { PASSWORD_MAX_LENGTH, checkNewPassword } from "../auth/passwordPolicy.ts";
import { sortRoles } from "../auth/permissions.ts";
import {
  AccountError,
  type AuditActor,
  findAccountByKey,
  setAccountPassword,
  setAccountRoles,
  writeAudit,
} from "../auth/store.ts";
import { readAuthConfig } from "../auth/config.ts";
import { type Database, closeDatabase, createDatabase } from "../db/client.ts";
import { checkSqlInvariants } from "../world/invariants.ts";

export const USAGE = [
  "사용: node dist/cli.js <명령> [옵션]",
  "  create-user  --id <아이디> [--roles <역할,역할>] [--allow-weak]   계정 만들기 (기본 역할 player)",
  "  set-roles    --id <아이디> --roles <역할,역할>                    역할 바꾸기 (예: player,admin)",
  "  set-password --id <아이디> [--allow-weak]                        비밀번호 바꾸기 (그 계정의 세션을 모두 끊는다)",
  "  check-world                                                      월드 불변 조건(원장·정산) 검사. 위반이 있으면 종료 코드 3",
  "환경 변수: DATABASE_URL(필수), BETTER_AUTH_SECRET·BETTER_AUTH_URL(운영 필수),",
  "           TIC_PASSWORD(create-user·set-password의 비밀번호), TIC_ACTOR(감사 기록에 남길 실행자)",
  "역할: player, gm, dev, admin. --allow-weak는 비밀번호 규칙(8자 이상 등)을 건너뛴다(경고를 남긴다).",
].join("\n");

/** 종료 코드: 0 성공, 1 예상하지 못한 오류, 2 사용법·입력 오류, 3 상태 충돌(있는 아이디, 없는 아이디, 마지막 admin) */
export type ExitCode = 0 | 1 | 2 | 3;

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

class CliError extends Error {
  constructor(
    readonly exitCode: ExitCode,
    message: string,
  ) {
    super(message);
  }
}

const COMMANDS = ["create-user", "set-roles", "set-password"] as const;
type Command = (typeof COMMANDS)[number];

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && (COMMANDS as readonly string[]).includes(value);
}

interface ParsedArgs {
  command: Command;
  id: string;
  roles: Role[] | undefined;
  allowWeak: boolean;
}

/** 인자 해석. 오류 문구에 입력값을 다시 찍지 않는다(실수로 비밀번호를 넣었을 수 있다) */
export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  if (argv.some((arg) => /^--?pass/i.test(arg))) {
    throw new CliError(2, "비밀번호는 명령줄로 받지 않습니다. 환경 변수 TIC_PASSWORD를 쓰세요.");
  }
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        id: { type: "string" },
        roles: { type: "string" },
        "allow-weak": { type: "boolean", default: false },
      },
    });
  } catch {
    throw new CliError(2, "알 수 없는 옵션이 있습니다.");
  }
  const [command, ...rest] = parsed.positionals;
  if (!isCommand(command) || rest.length > 0) {
    throw new CliError(2, "명령은 create-user, set-roles, set-password 중 하나입니다.");
  }
  const id = parsed.values.id;
  if (typeof id !== "string" || id === "") throw new CliError(2, "--id가 필요합니다.");
  const rolesText = parsed.values.roles;
  const roles = typeof rolesText === "string" ? parseRolesOption(rolesText) : undefined;
  if (command === "set-roles" && !roles) throw new CliError(2, "set-roles에는 --roles가 필요합니다.");
  if (command === "set-password" && roles) throw new CliError(2, "set-password에는 --roles를 쓰지 않습니다.");
  return { command, id, roles, allowWeak: parsed.values["allow-weak"] === true };
}

function parseRolesOption(text: string): Role[] {
  const names = text
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  const unknown = names.filter((name) => !isRole(name));
  if (names.length === 0 || unknown.length > 0) {
    throw new CliError(
      2,
      `역할은 player, gm, dev, admin 중에서 쉼표로 고릅니다(모르는 이름 ${unknown.length}개).`,
    );
  }
  return sortRoles(names.filter(isRole));
}

/** 감사 기록용 실행자 이름. 제어 문자를 지우고 200자로 자른다 */
function actorName(env: NodeJS.ProcessEnv): string {
  const raw = env.TIC_ACTOR?.replace(/\p{Cc}/gu, "").trim() ?? "";
  return raw === "" ? "unknown" : raw.slice(0, 200);
}

function readPassword(env: NodeJS.ProcessEnv): string {
  const password = env.TIC_PASSWORD ?? "";
  if (password === "") throw new CliError(2, "환경 변수 TIC_PASSWORD가 비어 있습니다.");
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new CliError(2, `비밀번호가 ${PASSWORD_MAX_LENGTH}자보다 깁니다.`);
  }
  return password;
}

/** 비밀번호 규칙 확인. --allow-weak면 경고만 남기고 진행한다. 규칙을 어겼는지 돌려준다 */
function checkPolicy(password: string, key: string, allowWeak: boolean, io: CliIo): boolean {
  const problem = checkNewPassword(password, key);
  if (!problem) return false;
  if (!allowWeak) {
    throw new CliError(
      2,
      `비밀번호가 규칙에 맞지 않습니다(${problem}). 그래도 쓰려면 --allow-weak를 붙입니다.`,
    );
  }
  io.err(`경고: 비밀번호가 규칙에 맞지 않습니다(${problem}). --allow-weak로 그대로 진행합니다.`);
  return true;
}

export interface CliDeps {
  db: Database;
  auth: TerraAuth;
}

/** 명령 하나를 실행한다(DB·인증은 부르는 쪽이 준비). 시험은 이 함수를 바로 부른다 */
export async function executeCommand(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  deps: CliDeps,
  io: CliIo,
): Promise<void> {
  const id = parseLoginId(args.id);
  if (!id.ok) throw new CliError(2, `아이디 규칙(영문·숫자·_ 3~20자)에 맞지 않습니다(${id.problem}).`);
  const actor: AuditActor = {
    kind: "cli",
    id: null,
    ip: null,
    meta: { actor: actorName(env), command: args.command },
  };
  const existing = await findAccountByKey(deps.db, id.key);

  switch (args.command) {
    case "create-user": {
      if (existing) throw new CliError(3, `이미 있는 아이디입니다: ${existing.loginId}`);
      const password = readPassword(env);
      const weak = checkPolicy(password, id.key, args.allowWeak, io);
      const roles = args.roles ?? [DEFAULT_ROLE];
      // 헤더 없이 서버에서 부르면 Better Auth가 권한 검사를 건너뛴다(관리 명령은 컨테이너 안에서만 돈다)
      const { user } = await deps.auth.api.createUser({
        body: {
          email: placeholderEmail(),
          password,
          name: id.display,
          role: roles,
          data: { username: id.display },
        },
      });
      await writeAudit(deps.db, {
        actor,
        action: "cli.create_user",
        targetId: user.id,
        after: { loginId: id.display, roles, weakPassword: weak },
      });
      io.out(`계정을 만들었습니다: ${id.display} (id ${user.id}, 역할 ${roles.join(",")})`);
      return;
    }
    case "set-roles": {
      if (!existing) throw new CliError(3, "없는 아이디입니다.");
      const roles = args.roles ?? [];
      const { before, account } = await setAccountRoles(deps.db, {
        userId: existing.id,
        roles,
        actor,
        action: "cli.set_roles",
      });
      io.out(
        `역할을 바꿨습니다: ${account.loginId} ${before.join(",") || "(없음)"} → ${account.roles.join(",")}`,
      );
      return;
    }
    case "set-password": {
      if (!existing) throw new CliError(3, "없는 아이디입니다.");
      const password = readPassword(env);
      const weak = checkPolicy(password, id.key, args.allowWeak, io);
      const { revokedSessions } = await setAccountPassword(deps.db, deps.auth, {
        userId: existing.id,
        password,
        actor,
        action: "cli.set_password",
        after: { weakPassword: weak },
      });
      io.out(`비밀번호를 바꿨습니다: ${existing.loginId} (끊은 세션 ${revokedSessions}개)`);
      return;
    }
  }
}

/** 명령줄 진입점: 인자·설정을 읽고, DB·인증을 준비하고, 실행하고, 정리한다 */
export async function runCli(argv: readonly string[], env: NodeJS.ProcessEnv, io: CliIo): Promise<ExitCode> {
  let db: Database | undefined;
  try {
    if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
      io.out(USAGE);
      return argv.length === 0 ? 2 : 0;
    }
    if (argv[0] === "check-world") {
      // S3 ADR 2절: DB 몫 불변 조건만 본다(메모리 몫은 서버가 부팅 뒤 검사해 /health worldIssues에 낸다)
      if (argv.length > 1) throw new CliError(2, "check-world는 옵션을 받지 않습니다.");
      const worldUrl = env.DATABASE_URL;
      if (!worldUrl) throw new CliError(2, "환경 변수 DATABASE_URL이 없습니다.");
      db = createDatabase(worldUrl, (error) => io.err(`DB 연결 오류: ${error.message}`));
      const problems = await checkSqlInvariants(db.$client, Date.now());
      io.out(JSON.stringify({ ok: problems.length === 0, problems }));
      return problems.length === 0 ? 0 : 3;
    }
    const args = parseCliArgs(argv);
    const url = env.DATABASE_URL;
    if (!url) throw new CliError(2, "환경 변수 DATABASE_URL이 없습니다.");
    const settings = readAuthConfig(env);
    db = createDatabase(url, (error) => io.err(`DB 연결 오류: ${error.message}`));
    const auth = createAuth({ db, settings: { secret: settings.secret, baseUrl: settings.baseUrl } });
    await verifyAuth(auth);
    await executeCommand(args, env, { db, auth }, io);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      io.err(`✗ ${error.message}`);
      if (error.exitCode === 2) io.err(USAGE);
      return error.exitCode;
    }
    if (error instanceof AccountError) {
      io.err(
        error.code === "LAST_ADMIN"
          ? "✗ 마지막 admin의 admin 역할은 뺄 수 없습니다."
          : "✗ 없는 아이디입니다.",
      );
      return 3;
    }
    // 원문에 비밀값이 들어갈 일은 없지만(비밀번호는 해시만 다룬다) 메시지만 찍고 스택은 찍지 않는다
    io.err(`✗ 실패: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (db) await closeDatabase(db);
  }
}
