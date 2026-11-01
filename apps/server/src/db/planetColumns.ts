// 행성 ID 열 — 표 정의 여러 파일(schema.ts·gardenerSchema.ts)이 같이 쓴다(서로 가져오면 순환이 생겨 따로 둔다)
import { text } from "drizzle-orm/pg-core";

/** 세계 행성 ID 기본값(S2 시험 행성, 콘텐츠 팩 ID). 지구가 팩에 들어오면 바꾼다(S3 ADR "행성 ID·영역") */
export const DEFAULT_WORLD_PLANET_ID = "s2_test_planet";

export const planetIdColumn = () => text("planet_id").notNull().default(DEFAULT_WORLD_PLANET_ID);
