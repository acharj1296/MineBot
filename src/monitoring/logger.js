import pino from "pino";
export const createLogger = (name) =>
  pino({
    name,
    redact: {
      paths: [
        "AI_API_KEY",
        "DB_PASSWORD",
        "*.AI_API_KEY",
        "*.DB_PASSWORD",
        "password",
        "token",
        "authorization",
        "headers.Authorization",
        "req.headers.authorization",
        "*.password",
        "*.token",
        "*.authorization",
      ],
      remove: true,
    },
  });
