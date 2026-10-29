// 계정 설정(user_settings) 읽기·쓰기 — tRPC settings.get·settings.set이 로그인한 본인 id로만 부른다.
// 쓰기는 보낸 칸만 바꾼다(다른 기기가 다른 칸을 동시에 바꿔도 서로 덮지 않게). 줄이 없으면 만든다.
// 읽을 때 모르는 값(더 새 버전이 저장한 값)은 null로 본다(@terra/shared parseUserSettings).
// 메뉴(nav)·홈(home)은 jsonb 열에 받은 JSON 객체를 통째로 쓴다(모르는 칸 포함). 비어 있으면(null) 칸을 두지 않고 읽는다.
import { type UserSettings, parseUserSettings } from "@terra/shared";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { userSettings } from "../db/schema.ts";
import type { SettingsServices, UserSettingsPatch } from "../trpc/context.ts";

/** 저장한 설정. 줄이 없으면 null(아무것도 정하지 않음) */
export async function readUserSettings(db: Database, userId: string): Promise<UserSettings | null> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return row ? parseUserSettings(row) : null;
}

/** 보낸 칸만 바꾸고(줄이 없으면 만들고) 저장한 뒤의 설정을 돌려준다 */
export async function writeUserSettings(
  db: Database,
  userId: string,
  patch: UserSettingsPatch,
): Promise<UserSettings> {
  const changes: Partial<typeof userSettings.$inferInsert> = {};
  if (patch.theme !== undefined) changes.theme = patch.theme;
  if (patch.followSystem !== undefined) changes.followSystem = patch.followSystem;
  if (patch.locale !== undefined) changes.locale = patch.locale;
  if (patch.nav !== undefined) changes.nav = patch.nav;
  if (patch.home !== undefined) changes.home = patch.home;
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...changes })
    .onConflictDoUpdate({ target: userSettings.userId, set: { ...changes, updatedAt: sql`now()` } })
    .returning();
  if (!row) throw new Error("user_settings upsert returned no row");
  return parseUserSettings(row);
}

export function createSettingsServices(db: Database): SettingsServices {
  return {
    get: (userId) => readUserSettings(db, userId),
    set: (userId, patch) => writeUserSettings(db, userId, patch),
  };
}
