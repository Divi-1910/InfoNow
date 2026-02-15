import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";
import { useAtom } from "jotai";
import { toastsAtom, removeToastAtom } from "@/store/toastAtom";
import type { Toast } from "@/store/toastAtom";

const iconMap: Record<Toast["type"], React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-400" />,
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
  info: <Info className="w-4 h-4 text-blue-400" />,
};

const borderMap: Record<Toast["type"], string> = {
  success: "border-green-500/20",
  error: "border-red-500/20",
  info: "border-blue-500/20",
};

export const ToastContainer = () => {
  const [toasts] = useAtom(toastsAtom);
  const [, removeToast] = useAtom(removeToastAtom);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 bg-zinc-900/95 backdrop-blur-sm border ${borderMap[toast.type]} rounded-xl shadow-2xl min-w-[280px] max-w-[400px]`}
          >
            {iconMap[toast.type]}
            <span className="text-sm font-light text-gray-200 flex-1">
              {toast.message}
            </span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;
