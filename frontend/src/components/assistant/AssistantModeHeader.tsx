import { motion } from "framer-motion";
import { ArrowLeft, Sparkles } from "lucide-react";

interface AssistantModeHeaderProps {
  onBack: () => void;
}

export const AssistantModeHeader = ({ onBack }: AssistantModeHeaderProps) => {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="shrink-0 border-b border-zinc-800/50 bg-zinc-950/95 backdrop-blur-xl"
    >
      <div className="w-full px-4 py-3 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-sky-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600 leading-none">
                AI Workspace
              </p>
              <h1 className="text-[15px] font-semibold text-zinc-100 leading-tight mt-0.5 truncate">
                Infiya
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700/60 bg-zinc-900/70 px-3 py-2 text-[13px] font-medium text-zinc-300 hover:bg-zinc-800/70 hover:text-white hover:border-zinc-600/60 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Feed</span>
            <span className="sm:hidden">Back</span>
          </button>
        </div>
      </div>
    </motion.header>
  );
};

export default AssistantModeHeader;
