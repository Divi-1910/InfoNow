import { motion } from "framer-motion";
import { useAtom } from "jotai";
import {
  allTopicsAtom,
  selectedTopicIdsAtom,
  selectedSubTopicIdsAtom,
} from "../store/topicAtom";
import { useState, useEffect } from "react";
import { saveUserTopics, saveUserSubTopics } from "../api/user";
import { getAllTopics } from "../api/topics";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/hooks/useToast";

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PreferencesModal = ({ isOpen, onClose }: PreferencesModalProps) => {
  const [allTopics, setAllTopics] = useAtom(allTopicsAtom);
  const [selectedTopicIds, setSelectedTopicIds] = useAtom(selectedTopicIdsAtom);
  const [selectedSubTopicIds, setSelectedSubTopicIds] = useAtom(
    selectedSubTopicIdsAtom
  );
  const [activeTopic, setActiveTopic] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

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
      prev.includes(subTopicId)
        ? prev.filter((id) => id !== subTopicId)
        : [...prev, subTopicId]
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
      toast.success("Preferences saved");
      onClose();
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setLoading(false);
    }
  };

  const currentTopic = allTopics.find((t) => t.id === activeTopic);
  const currentSubTopics = currentTopic?.subTopics || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customize Your Feed"
      subtitle="Select topics and subtopics to personalize your experience"
      size="full"
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-600 font-light">
            {selectedTopicIds.length} topics, {selectedSubTopicIds.length}{" "}
            subtopics selected
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
      }
    >
      <div className="grid grid-cols-[350px_1fr] divide-x divide-zinc-900 h-full min-h-[60vh]">
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
                <p className="text-sm text-zinc-700 font-light">
                  Select a topic to see subtopics
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {currentSubTopics.map((subtopic) => (
                  <motion.button
                    key={subtopic.id}
                    onClick={() =>
                      toggleSubTopic(subtopic.id, currentTopic.id)
                    }
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
    </Modal>
  );
};

export default PreferencesModal;
