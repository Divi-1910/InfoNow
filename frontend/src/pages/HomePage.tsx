import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { userAtom } from "../store/userAtom";
import { activeTabAtom } from "../store/tabAtom";
import { setSavedIdsAtom } from "../store/savedAtom";
import { feedModeStorageAtom, updateFiltersAtom } from "../store/feedAtom";
import { getSavedIds } from "../api/saved";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import FeedContent from "@/components/FeedContent";
import TrendingContent from "@/components/TrendingContent";
import SavedContent from "@/components/SavedContent";
import PreferencesModal from "@/components/PreferencesModal";
import ArticleReader from "@/components/ArticleReader";
import SearchModal from "@/components/SearchModal";
import AssistantWorkspace from "@/components/AssistantWorkspace";
import AssistantModeHeader from "@/components/assistant/AssistantModeHeader";

const HomePage = () => {
  const [activeTab] = useAtom(activeTabAtom);
  const [user] = useAtom(userAtom);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [, setSavedIds] = useAtom(setSavedIdsAtom);
  const [persistedMode] = useAtom(feedModeStorageAtom);
  const [, updateFilters] = useAtom(updateFiltersAtom);
  const isPreferencesOpen = searchParams.get("modal") === "preferences";

  // Initialize filters with persisted mode on mount
  useEffect(() => {
    updateFilters({ mode: persistedMode });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved IDs on mount (for authenticated users)
  useEffect(() => {
    if (user) {
      getSavedIds()
        .then((ids) => setSavedIds(ids))
        .catch(() => {});
    }
  }, [user, setSavedIds]);

  // Ctrl+K to open search
  useEffect(() => {
    if (isAssistantOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isAssistantOpen]);

  const handleClosePreferences = () => {
    searchParams.delete("modal");
    setSearchParams(searchParams);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "trending":
        return <TrendingContent />;
      case "saved":
        return <SavedContent />;
      case "feed":
      default:
        return <FeedContent />;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {!isAssistantOpen && <Header onOpenSearch={() => setIsSearchOpen(true)} />}

      {/* Main Content */}
      <AnimatePresence mode="wait" initial={false}>
        {!isAssistantOpen ? (
          <motion.div
            key="feed-layout"
            initial={{ opacity: 1, x: 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="max-w-7xl mx-auto px-6 py-8"
          >
            <div className="grid lg:grid-cols-[1fr_320px] gap-8">
              <div>{renderTabContent()}</div>
              <Sidebar onOpenAssistant={() => setIsAssistantOpen(true)} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="assistant-layout"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="h-[100dvh] overflow-hidden flex flex-col"
          >
            <AssistantModeHeader onBack={() => setIsAssistantOpen(false)} />
            <div className="flex-1 min-h-0 px-2 py-2 md:px-4 md:py-3">
              <AssistantWorkspace />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={handleClosePreferences}
      />
      <ArticleReader />
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
};

export default HomePage;
