import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, Menu, X } from "lucide-react";
import { useAtom } from "jotai";
import { activeTabAtom } from "@/store/tabAtom";
import { userAtom } from "@/store/userAtom";
import UserProfileDropdown from "@/components/UserProfileDropdown";

interface HeaderProps {
  onOpenSearch: () => void;
}

const tabs = [
  { id: "feed" as const, label: "Feed" },
  { id: "trending" as const, label: "Trending" },
  { id: "saved" as const, label: "Saved" },
];

export const Header = ({ onOpenSearch }: HeaderProps) => {
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [user] = useAtom(userAtom);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="sticky top-0 z-50 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/40"
      >
        <div className="max-w-7xl mx-auto px-5 md:px-6 h-14 flex items-center justify-between gap-4">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-6 min-w-0">
            <a href="/home" className="flex items-center gap-1.5 shrink-0">
              <span className="text-[17px] font-semibold tracking-tight text-white">
                InfoNow
              </span>
            </a>

            <nav className="hidden md:flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? "text-white"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.span
                      layoutId="tab-bg"
                      className="absolute inset-0 bg-zinc-800/70 rounded-lg"
                      transition={{
                        type: "spring",
                        bounce: 0.2,
                        duration: 0.4,
                      }}
                    />
                  )}
                  <span className="relative z-10 font-medium">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Right: Search + Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSearch}
              className="hidden lg:flex items-center gap-2.5 bg-zinc-900/60 hover:bg-zinc-900 rounded-xl px-3.5 py-2 border border-zinc-800/60 hover:border-zinc-700/60 transition-all cursor-pointer group"
            >
              <Search className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-400 transition-colors" />
              <span className="text-[13px] text-zinc-600 w-52 text-left group-hover:text-zinc-500 transition-colors">
                Search articles...
              </span>
              <kbd className="text-[10px] text-zinc-700 bg-zinc-800/80 border border-zinc-700/60 rounded-md px-1.5 py-0.5 font-mono ml-auto">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={onOpenSearch}
              className="lg:hidden p-2 hover:bg-zinc-900/60 rounded-lg transition-colors"
            >
              <Search className="w-4.5 h-4.5 text-zinc-400" />
            </button>

            <button
              type="button"
              title="Notifications"
              className="p-2 hover:bg-zinc-900/60 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300"
            >
              <Bell className="w-[18px] h-[18px]" />
            </button>

            <div className="relative">
              <button
                type="button"
                title="Profile"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="p-1 hover:bg-zinc-900/60 rounded-lg transition-colors"
              >
                {user?.pictureUrl ? (
                  <img
                    src={user.pictureUrl}
                    alt={user.name}
                    className="w-7 h-7 rounded-full ring-1 ring-zinc-700/60"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                    {user?.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </button>
              <UserProfileDropdown
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
              />
            </div>

            <button
              type="button"
              title="Menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 hover:bg-zinc-900/60 rounded-lg transition-colors text-zinc-400"
            >
              {mobileMenuOpen ? (
                <X className="w-[18px] h-[18px]" />
              ) : (
                <Menu className="w-[18px] h-[18px]" />
              )}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="md:hidden sticky top-14 z-40 bg-zinc-950/98 backdrop-blur-xl border-b border-zinc-800/40 overflow-hidden"
          >
            <nav className="flex flex-col gap-0.5 px-4 py-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`text-sm text-left py-2.5 px-3 rounded-lg transition-colors font-medium ${
                    activeTab === tab.id
                      ? "text-white bg-zinc-800/60"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
