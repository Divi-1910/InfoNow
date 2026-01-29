import { atom } from "jotai";

export type ActiveTab = "feed" | "trending" | "saved";

// Active tab state for HomePage navigation
export const activeTabAtom = atom<ActiveTab>("feed");

// Action atom to switch tabs
export const setActiveTabAtom = atom(null, (_get, set, tab: ActiveTab) => {
  set(activeTabAtom, tab);
});
