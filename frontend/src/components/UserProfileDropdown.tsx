import { motion, AnimatePresence } from "framer-motion";
import { Settings, LogOut, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAtom } from "jotai";
import { userAtom } from "../store/userAtom";

interface UserProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserProfileDropdown = ({ isOpen, onClose }: UserProfileDropdownProps) => {
  const navigate = useNavigate();
  const [user] = useAtom(userAtom);

  const handleProfileClick = () => {
    navigate("/profile");
    onClose();
  };

  const handleLogout = () => {
    // TODO: Implement logout
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-14 z-50 w-64 bg-black border border-zinc-900 rounded-xl overflow-hidden shadow-2xl"
          >
            <div className="p-4 bg-gradient-to-b from-zinc-950 to-black">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={user?.pictureUrl || "https://via.placeholder.com/40"}
                    alt={user?.name}
                    className="w-10 h-10 rounded-full ring-1 ring-zinc-800"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full ring-2 ring-black" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light text-white truncate">
                    {user?.name || "User"}
                  </p>
                  <p className="text-xs text-zinc-600 truncate">
                    {user?.email || "user@example.com"}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2 bg-zinc-950/50">
              <motion.button
                onClick={handleProfileClick}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-light text-white hover:bg-zinc-900 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-4 h-4" />
                  Profile Settings
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </motion.button>
              <div className="h-px bg-zinc-900 my-1" />
              <motion.button
                onClick={handleLogout}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-light text-red-400 hover:bg-zinc-900 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="w-4 h-4" />
                  Logout
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-red-400/50 transition-colors" />
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default UserProfileDropdown;
