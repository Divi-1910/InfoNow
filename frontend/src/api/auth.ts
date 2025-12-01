import type { CredentialResponse } from "@react-oauth/google";
import axiosInstance from "../lib/axios";

interface AuthResponse {
  message: string;
  user: {
    id: number;
    email: string;
    name: string;
    pictureUrl: string;
  };
  redirect: string;
}

export const handleGoogleLoginSuccess = async (
  credentialResponse: CredentialResponse
): Promise<AuthResponse> => {
  try {
    const response = await axiosInstance.post("/api/auth/google-login", {
      data: {
        token: credentialResponse.credential,
      },
    });
    return response.data;
  } catch (error: unknown) {
    console.error("Google login failed:", error);
    throw error;
  }
};
