import axiosInstance from "../lib/axios";

export const getAllTopics = async () => {
  const response = await axiosInstance.get("/api/topics/all-topics");
  return response.data.topics;
};

export const saveUserTopics = async (topicIds: number[]) => {
  const response = await axiosInstance.post("/api/topics/user-topics", { topicIds });
  return response.data;
};

export const saveUserSubTopics = async (subTopicIds: number[]) => {
  const response = await axiosInstance.post("/api/topics/user-subtopics", { subTopicIds });
  return response.data;
};

export const getUserPreferences = async () => {
  const response = await axiosInstance.get("/api/topics/user-preferences");
  return response.data;
};
