const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const studentRoutes = require("./routes/student.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const qrRoutes = require("./routes/qr.routes");
const notificationRoutes = require("./routes/notification.routes");
const seatRoutes = require("../routes/seats");
const dashboardRoutes = require("../routes/dashboard");
const studentMeRoutes = require("../routes/student");
const adminRoutes = require("../routes/admin");
const subscriptionRoutes = require("../routes/subscription");
const libraryRoutes = require("../routes/library");
const userRoutes = require("../routes/user");
const templateRoutes = require("../routes/templates");
const spaceRoutes = require("../routes/spaces");
const shiftRoutes = require("../routes/shifts");
const allocationRoutes = require("../routes/allocations");
const paymentRoutes = require("../routes/payment");
const planRoutes = require("../routes/plans");
const settingsRoutes = require("../routes/settings");
const { getMongoStatus } = require("./config/db");
const { errorHandler } = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/seats", seatRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/student", studentMeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/user", userRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/spaces", spaceRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/allocations", allocationRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "backend",
    db: getMongoStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

module.exports = app;
