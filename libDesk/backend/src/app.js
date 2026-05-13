const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");

const { getMongoStatus } = require("./config/db");
const { errorHandler } = require("./middleware/error.middleware");

const app = express();

// Security
app.use(helmet());

// Compression
app.use(compression());

// Logging
app.use(morgan("dev"));

// CORS
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    credentials: true,
  })
);

// Parsers
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/students", require("./routes/student.routes"));
app.use("/api/attendance", require("./routes/attendance.routes"));
app.use("/api/qr", require("./routes/qr.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));
app.use("/api/seats", require("./routes/seat.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/student", require("./routes/student-me.routes"));
// Hidden admin authentication (keeps /api/auth/login non-admin only)
app.use("/api/admin", require("./routes/adminAuth.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use("/api/subscription", require("./routes/subscription.routes"));
app.use("/api/library", require("./routes/library.routes"));
app.use("/api/user", require("./routes/user.routes"));
app.use("/api/templates", require("./routes/template.routes"));
app.use("/api/spaces", require("./routes/space.routes"));
app.use("/api/shifts", require("./routes/shift.routes"));
app.use("/api/allocations", require("./routes/allocation.routes"));
app.use("/api/payment", require("./routes/payment.routes"));
app.use("/api/plans", require("./routes/plans.routes"));
app.use("/api/settings", require("./routes/settings.routes"));

// Health
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "backend",
    env: process.env.NODE_ENV || "development",
    db:
      process.env.NODE_ENV === "production"
        ? undefined
        : getMongoStatus(),
    timestamp: new Date().toISOString(),
  });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handler
app.use(errorHandler);

module.exports = app;