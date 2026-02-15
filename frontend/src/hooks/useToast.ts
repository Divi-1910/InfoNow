import { useAtom } from "jotai";
import { addToastAtom } from "@/store/toastAtom";

export const useToast = () => {
  const [, addToast] = useAtom(addToastAtom);

  return {
    success: (message: string) => {
      addToast({ type: "success", message });
    },
    error: (message: string) => {
      addToast({ type: "error", message });
    },
    info: (message: string) => {
      addToast({ type: "info", message });
    },
  };
};
