import axiosInstance from "../lib/axios";

export const getAllTopics = async () => {
  const response = await axiosInstance.get("/api/topics/all-topics");
  return response.data.topics;
};
