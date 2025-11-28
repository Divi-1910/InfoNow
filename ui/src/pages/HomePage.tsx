import { motion, useScroll, useTransform } from "framer-motion";
import { Search, Sparkles, TrendingUp, Bookmark, Bell, User, Menu } from "lucide-react";
import { useState, useRef } from "react";

const HomePage = () => {
  const [activeTab, setActiveTab] = useState("feed");

  const topics = ["All", "AI", "Stock Market", "Gaming", "Space", "Cybersecurity", "Politics", "Crypto"];
  
  const feedItems = [
    {
      id: 1,
      type: "news",
      title: "OpenAI Announces GPT-5 with Revolutionary Reasoning Capabilities",
      source: "TechCrunch",
      time: "2 min ago",
      image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&q=80",
      topic: "AI"
    },
    {
      id: 2,
      type: "reddit",
      title: "Discussion: The Future of AI Regulation in Europe",
      source: "r/technology",
      time: "15 min ago",
      image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80",
      topic: "AI"
    },
    {
      id: 3,
      type: "youtube",
      title: "NASA's Artemis Mission: What You Need to Know",
      source: "NASA Official",
      time: "1h ago",
      image: "https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?w=800&q=80",
      topic: "Space"
    },
    {
      id: 4,
      type: "news",
      title: "Bitcoin Surges Past $100K Amid Institutional Adoption",
      source: "Bloomberg",
      time: "2h ago",
      image: "https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&q=80",
      topic: "Crypto"
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-light tracking-tight">InfoNow</h1>
            <nav className="hidden md:flex gap-6">
              <button
                onClick={() => setActiveTab("feed")}
                className={`text-sm font-light transition-colors ${activeTab === "feed" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                Feed
              </button>
              <button
                onClick={() => setActiveTab("trending")}
                className={`text-sm font-light transition-colors ${activeTab === "trending" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                Trending
              </button>
              <button
                onClick={() => setActiveTab("saved")}
                className={`text-sm font-light transition-colors ${activeTab === "saved" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                Saved
              </button>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900/50 rounded-full px-4 py-2 border border-zinc-800/50">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search or ask AI..."
                className="bg-transparent border-none outline-none text-sm font-light w-64 placeholder:text-gray-600"
              />
            </div>
            <button className="p-2 hover:bg-zinc-900/50 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-zinc-900/50 rounded-full transition-colors">
              <User className="w-5 h-5" />
            </button>
            <button className="md:hidden p-2 hover:bg-zinc-900/50 rounded-full transition-colors">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Feed Section */}
          <div>
            {/* Topics Filter */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide"
            >
              {topics.map((topic, idx) => (
                <button
                  key={topic}
                  className={`px-4 py-2 rounded-full text-sm font-light whitespace-nowrap transition-all ${
                    idx === 0
                      ? "bg-white text-black hover:bg-gray-100"
                      : "bg-zinc-900/50 text-gray-400 hover:bg-zinc-800/50 hover:text-white border border-zinc-800/50"
                  }`}
                >
                  {topic}
                </button>
              ))}
            </motion.div>

            {/* Feed Items */}
            <div className="space-y-6">
              {feedItems.map((item, idx) => (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + idx * 0.1 }}
                  whileHover={{ y: -4 }}
                  className="group bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/50 rounded-2xl overflow-hidden hover:border-zinc-700/50 hover:bg-zinc-900/40 transition-all cursor-pointer"
                >
                  <div className="flex flex-col md:flex-row">
                    <div className="md:w-72 h-48 md:h-auto overflow-hidden bg-zinc-900/50">
                      <motion.img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        whileHover={{ scale: 1.05 }}
                        transition={{ duration: 0.6 }}
                      />
                    </div>
                    <div className="flex-1 p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs px-2 py-1 bg-zinc-800/50 rounded-full text-gray-400 font-light">
                          {item.topic}
                        </span>
                        <span className="text-xs text-gray-600 font-light">{item.source}</span>
                        <span className="text-xs text-gray-700">•</span>
                        <span className="text-xs text-gray-600 font-light">{item.time}</span>
                      </div>
                      <h3 className="text-xl font-light mb-4 group-hover:text-gray-300 transition-colors">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-4">
                        <button className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1 font-light">
                          <Sparkles className="w-4 h-4" />
                          Ask AI
                        </button>
                        <button className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1 font-light">
                          <Bookmark className="w-4 h-4" />
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="hidden lg:block space-y-6"
          >
            {/* AI Assistant Card */}
            <div className="bg-gradient-to-br from-zinc-900/50 to-zinc-950/50 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-light">AI Assistant</h3>
              </div>
              <p className="text-sm text-gray-400 font-light mb-4">
                Ask anything about today's news and trends
              </p>
              <button className="w-full bg-white text-black py-2 rounded-full text-sm font-light hover:bg-gray-100 transition-colors">
                Start Conversation
              </button>
            </div>

            {/* Trending Topics */}
            <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5" />
                <h3 className="font-light">Trending Now</h3>
              </div>
              <div className="space-y-3">
                {["OpenAI GPT-5 Launch", "Bitcoin $100K", "NASA Artemis Update", "AI Regulation EU"].map((trend, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600 text-xs font-light">{idx + 1}</span>
                    <span className="text-gray-300 hover:text-white cursor-pointer transition-colors font-light">{trend}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/50 rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-light mb-1">247</div>
                  <div className="text-xs text-gray-600 font-light">Stories Today</div>
                </div>
                <div>
                  <div className="text-2xl font-light mb-1">12</div>
                  <div className="text-xs text-gray-600 font-light">Saved Items</div>
                </div>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
