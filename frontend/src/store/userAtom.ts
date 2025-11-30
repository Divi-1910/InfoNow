import { atom } from "jotai";

export interface User {
  id: number;
  email: string;
  name: string;
  pictureUrl: string;
}

export const userAtom = atom<User | null>(null);
