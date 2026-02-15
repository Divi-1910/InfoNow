import { useState } from "react";
import { Calendar, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DateRangePickerProps {
  onApply: (dateFrom?: string, dateTo?: string) => void;
}

export const DateRangePicker = ({ onApply }: DateRangePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const hasFilter = dateFrom || dateTo;

  const handleApply = () => {
    onApply(dateFrom || undefined, dateTo || undefined);
    setIsOpen(false);
  };

  const handleClear = () => {
    setDateFrom("");
    setDateTo("");
    onApply(undefined, undefined);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-light whitespace-nowrap transition-all ${
          hasFilter
            ? "bg-white text-black"
            : "bg-zinc-900/50 text-gray-500 hover:text-white border border-zinc-800/50"
        }`}
      >
        <Calendar className="w-3.5 h-3.5" />
        {hasFilter ? "Date filtered" : "Date range"}
        {hasFilter && (
          <X
            className="w-3 h-3 ml-0.5"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 p-4 bg-black border border-zinc-800 rounded-xl shadow-2xl z-20 min-w-[240px]"
          >
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 font-light mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                  className="w-full px-3 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm font-light text-gray-300 outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-light mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  className="w-full px-3 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm font-light text-gray-300 outline-none focus:border-zinc-600 transition-colors [color-scheme:dark]"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex-1 px-3 py-1.5 text-xs font-light text-gray-400 hover:text-white bg-zinc-900/50 border border-zinc-800 rounded-lg transition-colors"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 px-3 py-1.5 text-xs font-light text-black bg-white rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DateRangePicker;
