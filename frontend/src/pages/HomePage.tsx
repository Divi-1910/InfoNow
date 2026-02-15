import { useState, useEffect } from "react";
import { useAtom } from "jotai";
import { useSearchParams } from "react-router-dom";
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

const HomePage = () => {
  const [activeTab] = useAtom(activeTabAtom);
  const [user] = useAtom(userAtom);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [, setSavedIds] = useAtom(setSavedIdsAtom);
  const [persistedMode] = useAtom(feedModeStorageAtom);
  const [, updateFilters] = useAtom(updateFiltersAtom);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Open preferences modal from URL
  useEffect(() => {
    if (searchParams.get("modal") === "preferences") {
      setIsPreferencesOpen(true);
    }
  }, [searchParams]);

  const handleClosePreferences = () => {
    setIsPreferencesOpen(false);
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
      <Header onOpenSearch={() => setIsSearchOpen(true)} />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          <div>{renderTabContent()}</div>
          <Sidebar />
        </div>
      </div>

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
