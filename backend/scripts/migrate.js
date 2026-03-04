require("dotenv").config();
const { dbFactory } = require("../db");

async function main() {
  const db = dbFactory();
  await db.init();
  console.log(`Migrations applied successfully (${db.type}).`);
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
