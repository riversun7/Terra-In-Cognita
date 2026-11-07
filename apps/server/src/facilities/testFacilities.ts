// 건물 시험 자료 — 실제 팩 시설(건설 재료·칸 크기·내구도·공방 수리 줄) + 보유 물건 시험 아이템(내구도 있는 조끼). 시험 파일끼리 import하지 않게
// 여기에 둔다. 값은 형식 확인용이다(게임 수치 아님).
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import type { CatalogSource } from "./catalog.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();

/** 팩 시설 + 팩·시험 아이템 */
export const TEST_FACILITY_SOURCE: CatalogSource = {
  facilities: pack.facilities,
  items: TEST_HOLDING_CONTENT.items,
};
