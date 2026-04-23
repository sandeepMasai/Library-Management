const Notification = require("../models/Notification");

async function listNotifications() {
  return Notification.find().sort({ createdAt: -1 });
}

module.exports = {
  listNotifications,
};
