import axios from "axios";

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string => {
  if (!axios.isAxiosError(error)) {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }

  if (!error.response) {
    return "Network error. Check your connection and try again.";
  }

  const status = error.response.status;
  const data = error.response.data as { message?: string } | undefined;
  const apiMessage = data?.message?.trim();
  if (apiMessage) return apiMessage;

  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 403) return "You do not have permission for this action.";
  if (status === 404) return "Requested resource was not found.";
  if (status === 429) return "Too many requests. Please wait and retry.";
  if (status >= 500) return "Server error. Please try again shortly.";

  return fallback;
};
