import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

export const getAllTopics = async () => {
  const response = await axios.get(`${BACKEND_URL}/api/topics/all-topics`, {
    withCredentials: true,
  });
  return response.data.topics;
};

export const saveUserTopics = async (topicIds: number[]) => {
  const response = await axios.post(
    `${BACKEND_URL}/api/topics/user-topics`,
    { topicIds },
    { withCredentials: true }
  );
  return response.data;
};

export const saveUserSubTopics = async (subTopicIds: number[]) => {
  const response = await axios.post(
    `${BACKEND_URL}/api/topics/user-subtopics`,
    { subTopicIds },
    { withCredentials: true }
  );
  return response.data;
};

export const getUserPreferences = async () => {
  const response = await axios.get(`${BACKEND_URL}/api/topics/user-preferences`, {
    withCredentials: true,
  });
  return response.data;
};
