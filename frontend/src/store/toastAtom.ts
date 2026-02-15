import { atom } from "jotai";

export interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  duration?: number;
}

export const toastsAtom = atom<Toast[]>([]);

export const addToastAtom = atom(
  null,
  (get, set, toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    const newToast = { ...toast, id };
    set(toastsAtom, [...get(toastsAtom), newToast]);
    setTimeout(() => {
      set(toastsAtom, (prev) => prev.filter((t) => t.id !== id));
    }, toast.duration ?? 3000);
  }
);

export const removeToastAtom = atom(null, (get, set, id: string) => {
  set(toastsAtom, (prev) => prev.filter((t) => t.id !== id));
});
