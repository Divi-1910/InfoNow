import { motion } from "framer-motion";
import { ArrowLeft, Camera, Edit3 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAtom } from "jotai";
import { userAtom } from "../store/userAtom";
import {
  selectedTopicIdsAtom,
  selectedSubTopicIdsAtom,
} from "../store/topicAtom";
import { useState, useEffect } from "react";
import { getUserPreferences } from "../api/topics";
import { updateUserProfile } from "../api/user";
import PreferencesModal from "../components/PreferencesModal";

const ProfilePage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useAtom(userAtom);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [selectedTopicIds, setSelectedTopicIds] = useAtom(selectedTopicIdsAtom);
  const [selectedSubTopicIds, setSelectedSubTopicIds] = useAtom(
    selectedSubTopicIdsAtom
  );
  const [userTopics, setUserTopics] = useState<any[]>([]);
  const [userSubTopics, setUserSubTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const isPreferencesOpen = searchParams.get("modal") === "preferences";

  useEffect(() => {
    getUserPreferences().then((data) => {
      setUserTopics(data.topics);
      setUserSubTopics(data.subtopics);
      setSelectedTopicIds(data.topics.map((t: any) => t.id));
      setSelectedSubTopicIds(data.subtopics.map((st: any) => st.id));
    });
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    
    setLoading(true);
    try {
      const { user: updatedUser } = await updateUserProfile(name);
      setUser(updatedUser);
    } catch (error) {
      console.error("Failed to update profile:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-zinc-900"
      >
        <div className="max-w-5xl mx-auto px-8 py-6 flex items-center gap-4">
          <motion.button
            onClick={() => navigate("/home")}
            whileHover={{ x: -2 }}
            className="p-2 hover:bg-zinc-900 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>
          <h1 className="text-xl font-light tracking-tight">Profile</h1>
        </div>
      </motion.header>

      <div className="max-w-7xl mx-auto px-8 py-16">
        {/* Bento Grid Layout */}
        <div className="grid grid-cols-12 gap-6">
          {/* Profile Card - Spans 2 rows */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="col-span-4 row-span-2 border border-zinc-900 rounded-xl overflow-hidden flex flex-col"
          >
            <div className="bg-gradient-to-b from-zinc-900/50 to-transparent p-8 flex-1 flex flex-col items-center justify-center">
              <div className="relative group mb-6">
                <img
                  src={user?.pictureUrl || "https://via.placeholder.com/120"}
                  alt={user?.name}
                  className="w-28 h-28 rounded-full ring-1 ring-zinc-800"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  className="absolute -bottom-2 -right-2 p-2 bg-white text-black rounded-full shadow-lg"
                >
                  <Camera className="w-4 h-4" />
                </motion.button>
              </div>
              <h3 className="text-lg font-light mb-1">{user?.name}</h3>
              <p className="text-xs text-zinc-600">{user?.email}</p>
            </div>
          </motion.div>

          {/* Name Input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="col-span-4 border border-zinc-900 rounded-xl overflow-hidden"
          >
            <div className="p-6">
              <label className="block text-xs font-light text-zinc-500 mb-3 uppercase tracking-wider">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black border border-zinc-900 rounded-lg px-4 py-2.5 text-sm font-light focus:outline-none focus:border-zinc-700 transition-colors"
              />
            </div>
            <div className="px-6 pb-6">
              <motion.button
                onClick={handleSave}
                disabled={loading || !name.trim()}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="w-full py-2.5 bg-white text-black rounded-lg text-sm font-light hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Saving..." : "Save Changes"}
              </motion.button>
            </div>
          </motion.div>

          {/* Email Input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="col-span-4 border border-zinc-900 rounded-xl p-6"
          >
            <label className="block text-xs font-light text-zinc-500 mb-3 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full bg-zinc-900 border border-zinc-900 rounded-lg px-4 py-2.5 text-sm font-light text-zinc-500 cursor-not-allowed"
            />
          </motion.div>

          {/* Topics Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="col-span-12 border border-zinc-900 rounded-xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-900 flex items-center justify-between">
              <div>
                <h2 className="text-base font-light mb-1">Topics</h2>
                <p className="text-xs text-zinc-600">
                  {userTopics.length} selected
                </p>
              </div>
              <motion.button
                onClick={() => setSearchParams({ modal: "preferences" })}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-xs transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit
              </motion.button>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {userTopics.map((topic) => (
                  <motion.span
                    key={topic.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-light"
                  >
                    {topic.name}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Subtopics Card - Full Width */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="col-span-12 border border-zinc-900 rounded-xl overflow-hidden"
          >
            <div className="p-6 border-b border-zinc-900">
              <h2 className="text-base font-light mb-1">Subtopics</h2>
              <p className="text-xs text-zinc-600">
                {userSubTopics.length} selected
              </p>
            </div>
            <div className="p-6">
              <div className="flex flex-wrap gap-2">
                {userSubTopics.slice(0, 20).map((subtopic) => (
                  <motion.span
                    key={subtopic.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-3 py-1.5 bg-black border border-zinc-900 rounded-lg text-xs font-light text-zinc-400"
                  >
                    {subtopic.name}
                  </motion.span>
                ))}
                {userSubTopics.length > 20 && (
                  <span className="px-3 py-1.5 text-zinc-600 text-xs font-light">
                    +{userSubTopics.length - 20} more
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => {
          setSearchParams({});
          getUserPreferences().then((data) => {
            setUserTopics(data.topics);
            setUserSubTopics(data.subtopics);
          });
        }}
      />
    </div>
  );
};

export default ProfilePage;
