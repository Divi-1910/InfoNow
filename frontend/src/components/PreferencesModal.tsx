import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useAtom } from "jotai";
import { allTopicsAtom, selectedTopicIdsAtom, selectedSubTopicIdsAtom } from "../store/topicAtom";
import { useState, useEffect } from "react";
import { getAllTopics, saveUserTopics, saveUserSubTopics } from "../api/topics";

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PreferencesModal = ({ isOpen, onClose }: PreferencesModalProps) => {
  const [allTopics, setAllTopics] = useAtom(allTopicsAtom);
  const [selectedTopicIds, setSelectedTopicIds] = useAtom(selectedTopicIdsAtom);
  const [selectedSubTopicIds, setSelectedSubTopicIds] = useAtom(selectedSubTopicIdsAtom);
  const [activeTopic, setActiveTopic] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && allTopics.length === 0) {
      getAllTopics().then((topics) => {
        setAllTopics(topics);
        if (topics.length > 0) setActiveTopic(topics[0].id);
      });
    } else if (isOpen && allTopics.length > 0 && !activeTopic) {
      setActiveTopic(allTopics[0].id);
    }
  }, [isOpen, allTopics]);

  const toggleSubTopic = (subTopicId: number, topicId: number) => {
    setSelectedSubTopicIds((prev) =>
      prev.includes(subTopicId) ? prev.filter((id) => id !== subTopicId) : [...prev, subTopicId]
    );
    if (!selectedTopicIds.includes(topicId)) {
      setSelectedTopicIds((prev) => [...prev, topicId]);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await saveUserTopics(selectedTopicIds);
      await saveUserSubTopics(selectedSubTopicIds);
      onClose();
    } catch (error) {
      console.error("Failed to save preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentTopic = allTopics.find((t) => t.id === activeTopic);
  const currentSubTopics = currentTopic?.subTopics || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md"
        >
          <div className="h-full flex items-center justify-center p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-black border border-zinc-900 rounded-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="px-10 py-8 border-b border-zinc-900">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-light tracking-tight mb-1">Customize Your Feed</h2>
                    <p className="text-sm text-zinc-600 font-light">
                      Select topics and subtopics to personalize your experience
                    </p>
                  </div>
                  <motion.button
                    onClick={onClose}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2 hover:bg-zinc-900 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 grid grid-cols-[350px_1fr] divide-x divide-zinc-900 overflow-hidden">
                {/* Topics Column */}
                <div className="flex flex-col bg-zinc-950/50">
                  <div className="px-8 py-5 border-b border-zinc-900">
                    <h3 className="text-xs font-light text-zinc-600 uppercase tracking-wider">
                      Topics ({selectedTopicIds.length})
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-1.5">
                    {allTopics.map((topic) => {
                      const hasSelectedSubtopics = topic.subTopics.some((st) =>
                        selectedSubTopicIds.includes(st.id)
                      );
                      return (
                        <motion.button
                          key={topic.id}
                          onClick={() => setActiveTopic(topic.id)}
                          whileHover={{ x: 2 }}
                          whileTap={{ scale: 0.98 }}
                          className={`w-full text-left px-4 py-3 rounded-lg transition-all relative ${
                            activeTopic === topic.id
                              ? "bg-white text-black shadow-lg"
                              : "hover:bg-zinc-900"
                          }`}
                        >
                          <span className="text-sm font-light">{topic.name}</span>
                          {hasSelectedSubtopics && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-green-500 rounded-full"
                            />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Subtopics Column */}
                <div className="flex flex-col">
                  <div className="px-8 py-5 border-b border-zinc-900">
                    <h3 className="text-xs font-light text-zinc-600 uppercase tracking-wider">
                      Subtopics ({selectedSubTopicIds.length})
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    {!currentTopic ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-zinc-700 font-light">Select a topic to see subtopics</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {currentSubTopics.map((subtopic) => (
                          <motion.button
                            key={subtopic.id}
                            onClick={() => toggleSubTopic(subtopic.id, currentTopic.id)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`px-3 py-2.5 rounded-lg text-xs font-light transition-all ${
                              selectedSubTopicIds.includes(subtopic.id)
                                ? "bg-white text-black shadow-md"
                                : "bg-zinc-950 hover:bg-zinc-900 border border-zinc-900"
                            }`}
                          >
                            {subtopic.name}
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-10 py-6 border-t border-zinc-900 flex items-center justify-between bg-zinc-950/50">
                <div className="text-sm text-zinc-600 font-light">
                  {selectedTopicIds.length} topics, {selectedSubTopicIds.length} subtopics selected
                </div>
                <motion.button
                  onClick={handleSave}
                  disabled={loading || selectedTopicIds.length === 0}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-3 bg-white text-black rounded-lg font-light hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {loading ? "Saving..." : "Save Preferences"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PreferencesModal;
