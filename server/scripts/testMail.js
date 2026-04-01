import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { sendMail } from "../utils/mailer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const to = process.argv[2] || process.env.TEST_MAIL_TO || "";
if (!to) {
  console.error('Usage: node scripts/testMail.js "you@example.com"');
  process.exit(1);
}

const subject = `DPDE test mail (${new Date().toISOString()})`;
const text = "If you received this, SMTP settings are working.";

const result = await sendMail({ to, subject, text });
console.log("[testMail] result:", result);
process.exit(result?.sent ? 0 : 2);

