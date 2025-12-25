import axiosInstance from "../lib/axios";

export const updateUserProfile = async (name: string) => {
  const response = await axiosInstance.put("/api/user/profile", { name });
  return response.data;
};

export const saveUserTopics = async (topicIds: number[]) => {
  const response = await axiosInstance.post("/api/user/user-topics", {
    topicIds,
  });
  return response.data;
};

export const saveUserSubTopics = async (subTopicIds: number[]) => {
  const response = await axiosInstance.post("/api/user/user-subtopics", {
    subTopicIds,
  });
  return response.data;
};

export const getUserPreferences = async () => {
  const response = await axiosInstance.get("/api/user/user-preferences");
  return response.data;
};
