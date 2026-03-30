import nodemailer from "nodemailer";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || "";
  const port = Number.parseInt(String(process.env.SMTP_PORT || ""), 10);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || "";
  const secure =
    String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
    String(process.env.SMTP_SECURE || "") === "1";

  if (!host || !Number.isFinite(port) || !from) {
    return null;
  }

  return { host, port, user, pass, from, secure };
}

let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    const config = getSmtpConfig();
    if (!config) return null;

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined
    });

    return transporter;
  })();

  return transporterPromise;
}

export async function sendMail({ to, subject, text, html }) {
  const config = getSmtpConfig();
  if (!config) return { sent: false, reason: "smtp_not_configured" };

  const transporter = await getTransporter();
  if (!transporter) return { sent: false, reason: "smtp_not_configured" };

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    ...(html ? { html } : {})
  });

  return { sent: true };
}

