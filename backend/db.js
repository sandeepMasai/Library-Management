const mongoose = require("mongoose");
const dns = require("node:dns");
const Attendance = require("./models/Attendance");

async function ensureAttendanceIndexes() {
  try {
    const indexes = await Attendance.collection.indexes();

    for (const idx of indexes) {
      if (!idx.unique || !idx.name || idx.name === "_id_") continue;
      const keys = Object.keys(idx.key || {});
      const isExpectedUnique =
        keys.length === 2 &&
        keys.includes("studentId") &&
        keys.includes("attendanceDate") &&
        Number(idx.key.studentId) === 1 &&
        Number(idx.key.attendanceDate) === 1;

      const badUnique = !isExpectedUnique;

      if (badUnique) {
        await Attendance.collection.dropIndex(idx.name);
      }
    }

    await Attendance.collection.createIndex(
      { studentId: 1, attendanceDate: 1 },
      { unique: true, name: "studentId_1_attendanceDate_1" }
    );
  } catch (error) {
    console.warn("Attendance index check skipped:", error.message);
  }
}

async function connectToMongo() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const directUri = process.env.MONGODB_URI_DIRECT;
  const fallbackUri = process.env.MONGODB_URI_FALLBACK;

  if (!uri) {
    console.warn("MONGODB_URI (or MONGO_URI) is not set. Starting backend without database connection.");
    return false;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    await ensureAttendanceIndexes();
    console.log("MongoDB connected");
    return true;
  } catch (error) {
    const message = String(error?.message || "");
    const isSrvDnsIssue =
      uri.startsWith("mongodb+srv://") &&
      (message.includes("querySrv") || message.includes("EREFUSED") || message.includes("ENOTFOUND"));

    if (isSrvDnsIssue) {
      console.warn("MongoDB SRV DNS lookup failed. Retrying with public DNS...");
      try {
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
        await ensureAttendanceIndexes();
        console.log("MongoDB connected after DNS retry");
        return true;
      } catch (dnsRetryError) {
        console.warn("MongoDB DNS retry failed:", dnsRetryError.message);
      }
    }

    if (directUri) {
      console.warn("Trying direct Mongo URI (non-SRV)...");
      try {
        await mongoose.connect(directUri, { serverSelectionTimeoutMS: 8000 });
        await ensureAttendanceIndexes();
        console.log("MongoDB connected via direct URI");
        return true;
      } catch (directError) {
        console.warn("Direct Mongo URI failed:", directError.message);
      }
    }

    if (fallbackUri) {
      console.warn("Trying fallback URI...");
      try {
        await mongoose.connect(fallbackUri, { serverSelectionTimeoutMS: 8000 });
        await ensureAttendanceIndexes();
        console.log(`MongoDB connected via fallback URI (${fallbackUri})`);
        return true;
      } catch (fallbackError) {
        console.error("MongoDB fallback connection failed:", fallbackError.message);
        return false;
      }
    }

    console.error("MongoDB connection failed:", error.message);
    return false;
  }
}

function getMongoStatus() {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}

module.exports = {
  connectToMongo,
  getMongoStatus,
};
