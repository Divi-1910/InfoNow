import morgan from "morgan";
import { logger } from "../utils/logger";

const stream = {
  write: (message: string) => {
    logger.info(message.trim(), {
      http: true,
    });
  },
};

export const httpLogger = morgan("combined", { stream });
