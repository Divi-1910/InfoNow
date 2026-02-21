import { useCallback, useMemo } from "react";
import { useAtom } from "jotai";
import { addToastAtom } from "@/store/toastAtom";

export const useToast = () => {
  const [, addToast] = useAtom(addToastAtom);

  const success = useCallback(
    (message: string) => {
      addToast({ type: "success", message });
    },
    [addToast]
  );

  const error = useCallback(
    (message: string) => {
      addToast({ type: "error", message });
    },
    [addToast]
  );

  const info = useCallback(
    (message: string) => {
      addToast({ type: "info", message });
    },
    [addToast]
  );

  return useMemo(
    () => ({ success, error, info }),
    [success, error, info]
  );
};
