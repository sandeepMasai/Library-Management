const mongoose = require("mongoose");
const dns = require("node:dns");
const Attendance = require("../models/Attendance");
const logger = require("../utils/logger");

const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 2000;
const READY_STATE_LABELS = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

let listenersRegistered = false;

mongoose.set("autoIndex", false);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeMongoError(error) {
  return {
    name: error?.name,
    code: error?.code,
    message: error?.message,
  };
}

function registerConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connection established");
  });

  mongoose.connection.on("error", (error) => {
    logger.error("MongoDB connection error", sanitizeMongoError(error));
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
}

function getMongoConnectOptions() {
  return {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 10),
    autoIndex: false,
  };
}

async function ensureAttendanceIndexes() {
  try {
    const indexes = await Attendance.collection.indexes();

    for (const idx of indexes) {
      if (!idx.unique || !idx.name || idx.name === "_id_") continue;
      const keys = Object.keys(idx.key || {});
      const isExpectedUnique =
        keys.length === 3 &&
        keys.includes("libraryId") &&
        keys.includes("studentId") &&
        keys.includes("attendanceDate") &&
        Number(idx.key.libraryId) === 1 &&
        Number(idx.key.studentId) === 1 &&
        Number(idx.key.attendanceDate) === 1;

      const badUnique = !isExpectedUnique;

      if (badUnique) {
        try {
          await Attendance.collection.dropIndex(idx.name);
          logger.warn("Dropped unexpected unique Attendance index", { index: idx.name });
        } catch (dropError) {
          logger.warn("Could not drop unexpected Attendance index", {
            index: idx.name,
            error: sanitizeMongoError(dropError),
          });
        }
      }
    }

    try {
      await Attendance.collection.createIndex(
        { libraryId: 1, studentId: 1, attendanceDate: 1 },
        { unique: true, name: "libraryId_1_studentId_1_attendanceDate_1" }
      );
      logger.info("Attendance index check completed");
    } catch (indexError) {
      logger.warn("Attendance index creation skipped", sanitizeMongoError(indexError));
    }
  } catch (error) {
    logger.warn("Attendance index check skipped", sanitizeMongoError(error));
  }
}

function buildConnectionTargets() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const directUri = process.env.MONGODB_URI_DIRECT;
  const fallbackUri = process.env.MONGODB_URI_FALLBACK;
  const targets = [];

  if (!uri) {
    return targets;
  }

  targets.push({ label: "primary", uri });
  if (directUri) targets.push({ label: "direct", uri: directUri });
  if (fallbackUri) targets.push({ label: "fallback", uri: fallbackUri });
  return targets;
}

function shouldRetryWithPublicDns(uri, error) {
  const message = String(error?.message || "");
  return (
    uri.startsWith("mongodb+srv://") &&
    (message.includes("querySrv") || message.includes("EREFUSED") || message.includes("ENOTFOUND"))
  );
}

async function connectWithRetry(target, maxRetries, retryDelayMs) {
  const options = getMongoConnectOptions();
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info("Connecting to MongoDB", { target: target.label, attempt, maxRetries });
      await mongoose.connect(target.uri, options);
      await ensureAttendanceIndexes();
      try {
        const { migrateLegacyLibraryPlans } = require("../migrations/libraryPlanNoneMigrate");
        await migrateLegacyLibraryPlans();
      } catch (e) {
        logger.warn("Post-connect migration skipped", { message: e?.message });
      }
      logger.info("MongoDB connected", { target: target.label });
      return true;
    } catch (error) {
      logger.warn("MongoDB connection attempt failed", {
        target: target.label,
        attempt,
        maxRetries,
        error: sanitizeMongoError(error),
      });

      if (attempt === 1 && shouldRetryWithPublicDns(target.uri, error)) {
        logger.warn("MongoDB SRV DNS lookup failed. Retrying with public DNS resolvers.");
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
      }

      if (attempt < maxRetries) {
        await sleep(retryDelayMs);
      }
    }
  }
  return false;
}

async function connectToMongo() {
  registerConnectionListeners();

  const targets = buildConnectionTargets();
  if (!targets.length) {
    const message = "MONGODB_URI (or MONGO_URI) is not set.";
    if (isProduction) {
      logger.error(`${message} Production startup requires a database connection.`);
    } else {
      logger.warn(`${message} Starting backend without database connection in development.`);
    }
    return false;
  }

  const maxRetries = Number(process.env.MONGODB_CONNECT_RETRIES || DEFAULT_MAX_RETRIES);
  const retryDelayMs = Number(process.env.MONGODB_CONNECT_RETRY_DELAY_MS || DEFAULT_RETRY_DELAY_MS);

  for (const target of targets) {
    const connected = await connectWithRetry(target, maxRetries, retryDelayMs);
    if (connected) return true;
  }

  logger.error("MongoDB connection failed for all configured targets");
  return false;
}

function getMongoStatus() {
  return READY_STATE_LABELS[mongoose.connection.readyState] || "unknown";
}

function getMongoHealth() {
  return {
    status: getMongoStatus(),
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
}

async function disconnectFromMongo() {
  try {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected cleanly");
  } catch (error) {
    logger.error("MongoDB disconnect failed", sanitizeMongoError(error));
  }
}

module.exports = {
  connectToMongo,
  disconnectFromMongo,
  getMongoHealth,
  getMongoStatus,
};
