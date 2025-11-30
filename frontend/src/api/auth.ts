import type { CredentialResponse } from "@react-oauth/google";
import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
console.log("BACKEND URL : ", BACKEND_URL);

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
    const response = await axios.post(
      `${BACKEND_URL}/api/auth/google-login`,
      {
        data: {
          token: credentialResponse.credential,
        },
      },
      {
        withCredentials: true,
      }
    );
    console.log("USER Authenticated : ", response.data.user);
    return response.data;
  } catch (error: unknown) {
    console.error("Google login failed:", error);
    throw error;
  }
};
