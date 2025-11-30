import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

export const updateUserProfile = async (name: string) => {
  const response = await axios.put(
    `${BACKEND_URL}/api/user/profile`,
    { name },
    { withCredentials: true }
  );
  return response.data;
};
