import winston from "winston";
import "winston-daily-rotate-file";

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const logFormat = printf(({ timestamp, level, message }) => {
  return `${timestamp} [${level}]: ${message}`;
});

const dailyRotate = new winston.transports.DailyRotateFile({
  filename: "logs/backend-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "14d",
  maxSize: "20m",
  zippedArchive: true,
});

const errorRotate = new winston.transports.DailyRotateFile({
  filename: "logs/backend-error-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "14d",
  maxSize: "20m",
  zippedArchive: true,
  level: "error",
});

export const logger = winston.createLogger({
  level: "info",
  defaultMeta: { service: "backend" },
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    json()
  ),
  transports: [
    dailyRotate,
    errorRotate,
    new winston.transports.Console({
      format: combine(colorize(), timestamp(), logFormat),
    }),
  ],
});
