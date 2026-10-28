// 관리 명령 진입점 — 빌드하면 dist/cli.js. 사용법은 인자 없이 실행하거나 src/cli/commands.ts의 USAGE
// 예(운영): docker exec -e TIC_PASSWORD -e TIC_ACTOR tic-app node dist/cli.js create-user --id <아이디> --roles player,admin
// 개발: DATABASE_URL=… TIC_PASSWORD=… pnpm --filter @terra/server exec tsx src/cli.ts set-roles --id <아이디> --roles player
import { runCli } from "./cli/commands.ts";

const code = await runCli(process.argv.slice(2), process.env, {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
process.exit(code);
