const Attendance = require("../models/Attendance");

async function getTodayAttendance(attendanceDate) {
  return Attendance.find({ attendanceDate }).sort({ createdAt: -1 });
}

module.exports = {
  getTodayAttendance,
};
