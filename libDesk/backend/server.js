require("dotenv").config();

const mongoose = require("mongoose");

const { connectToMongo } = require("./src/config/db");
const logger = require("./src/utils/logger");
const { startSubscriptionExpiryJob } = require("./src/jobs/subscriptionExpiry.job");
const app = require("./src/app");

const PORT = Number(process.env.PORT);
const HOST = process.env.HOST;

async function start() {
  const dbConnected = await connectToMongo();

  if (!dbConnected) {
    logger.error("MongoDB connection failed");

    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }

  if (
    dbConnected &&
    process.env.SUBSCRIPTION_CRON_ENABLED === "true"
  ) {
    startSubscriptionExpiryJob();
  }

  const server = app.listen(PORT, HOST, () => {
    logger.info("Backend server started", {
      env: process.env.NODE_ENV || "development",
      host: HOST,
      port: PORT,
      db: dbConnected ? "connected" : "not_connected",
    });
  });

  server.on("error", (err) => {
    logger.error("HTTP server error", {
      message: err?.message,
      code: err?.code,
    });

    process.exit(1);
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    logger.info("Shutting down server");

    await mongoose.connection.close();

    process.exit(0);
  });

  process.on("unhandledRejection", (err) => {
    logger.error("Unhandled Rejection", {
      message: err?.message,
    });
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception", {
      message: err?.message,
    });

    process.exit(1);
  });
}

start();