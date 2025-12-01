import axiosInstance from "../lib/axios";

export const updateUserProfile = async (name: string) => {
  const response = await axiosInstance.put("/api/user/profile", { name });
  return response.data;
};
