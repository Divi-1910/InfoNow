import { motion, AnimatePresence } from "framer-motion";
import { User, Settings, LogOut } from "lucide-react";
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
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-12 z-50 w-72 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800/50 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="p-4 border-b border-zinc-800/50">
              <div className="flex items-center gap-3">
                <img
                  src={user?.pictureUrl || "https://via.placeholder.com/40"}
                  alt={user?.name}
                  className="w-12 h-12 rounded-full"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light text-white truncate">
                    {user?.name || "User"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.email || "user@example.com"}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2">
              <button
                onClick={handleProfileClick}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-light text-gray-300 hover:bg-zinc-800/50 rounded-xl transition-colors"
              >
                <Settings className="w-4 h-4" />
                Profile Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-light text-red-400 hover:bg-zinc-800/50 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default UserProfileDropdown;
