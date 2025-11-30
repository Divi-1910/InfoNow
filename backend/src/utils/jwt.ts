import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET || "divyansh-access-secret-key";
const REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || "divyansh-refresh-secret-key";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export interface TokenPayload {
  userId: number;
  email: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, ACCESS_TOKEN_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, REFRESH_TOKEN_SECRET) as TokenPayload;
};

export const storeRefreshToken = async (userId: number, token: string) => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
};

export const deleteRefreshToken = async (token: string) => {
  await prisma.refreshToken.delete({
    where: { token },
  });
};

export const deleteUserRefreshTokens = async (userId: number) => {
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });
};
