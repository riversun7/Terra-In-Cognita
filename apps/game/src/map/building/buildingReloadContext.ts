// 건물 판 안의 추가 조각(GovernmentSheet 등)이 가입·변경 직후 건물 소유자·접근 권한을 다시 읽게 하는 컨텍스트
import { createContext } from "react";

export const BuildingReloadContext = createContext<(() => void) | undefined>(undefined);
