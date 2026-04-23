// override: true so PORT in backend/.env wins over a stale `export PORT=5002` in your shell
require("dotenv").config({ override: true });

const { connectToMongo } = require("./src/config/db");
const app = require("./src/app");

const PORT = Number(process.env.PORT) || 5001;

async function start() {
  await connectToMongo();

  const server = app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Stop the other process or change PORT in backend/.env`);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
