import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Bell, User, Menu, X } from "lucide-react";
import { useAtom } from "jotai";
import { activeTabAtom } from "@/store/tabAtom";
import { userAtom } from "@/store/userAtom";
import UserProfileDropdown from "@/components/UserProfileDropdown";

interface HeaderProps {
  onOpenSearch: () => void;
}

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
        className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-light tracking-tight">InfoNow</h1>
            <nav className="hidden md:flex gap-6">
              {(["feed", "trending", "saved"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`text-sm font-light transition-colors ${
                    activeTab === tab
                      ? "text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onOpenSearch}
              className="hidden lg:flex items-center gap-2 bg-zinc-900/50 rounded-full px-4 py-2 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-light text-gray-600 w-64 text-left">
                Search articles...
              </span>
              <kbd className="text-[10px] text-gray-600 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 font-mono ml-auto">
                Ctrl K
              </kbd>
            </button>
            <button
              type="button"
              title="bell"
              className="p-2 hover:bg-zinc-900/50 rounded-full transition-colors"
            >
              <Bell className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                type="button"
                title="user"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="p-2 hover:bg-zinc-900/50 rounded-full transition-colors"
              >
                {user?.pictureUrl ? (
                  <img
                    src={user.pictureUrl}
                    alt={user.name}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </button>
              <UserProfileDropdown
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
              />
            </div>
            <button
              type="button"
              title="menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 hover:bg-zinc-900/50 rounded-full transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
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
            transition={{ duration: 0.2 }}
            className="md:hidden sticky top-[73px] z-40 bg-zinc-950/95 backdrop-blur-xl border-b border-zinc-800/50 overflow-hidden"
          >
            <nav className="flex flex-col gap-1 px-6 py-3">
              {(["feed", "trending", "saved"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setMobileMenuOpen(false);
                  }}
                  className={`text-sm font-light text-left py-2.5 px-3 rounded-lg transition-colors ${
                    activeTab === tab
                      ? "text-white bg-zinc-900/50"
                      : "text-gray-500 hover:text-gray-300 hover:bg-zinc-900/30"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
