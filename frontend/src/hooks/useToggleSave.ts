import { useAtom } from "jotai";
import { userAtom } from "@/store/userAtom";
import { savedIdsAtom, toggleSavedIdAtom } from "@/store/savedAtom";
import { saveItem, unsaveItem } from "@/api/saved";
import { useToast } from "@/hooks/useToast";

export const useToggleSave = () => {
  const [user] = useAtom(userAtom);
  const [savedIds] = useAtom(savedIdsAtom);
  const [, toggleSavedId] = useAtom(toggleSavedIdAtom);
  const toast = useToast();

  const toggleSave = async (itemId: string) => {
    if (!user) return;

    const isSaved = savedIds.has(itemId);
    try {
      if (isSaved) {
        await unsaveItem(itemId);
        toast.success("Removed from reading list");
      } else {
        await saveItem(itemId);
        toast.success("Saved to reading list");
      }
      toggleSavedId({ id: itemId, saved: !isSaved });
    } catch {
      toast.error("Failed to update saved items");
    }
  };

  return { toggleSave, savedIds };
};
