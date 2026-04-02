import nodemailer from "nodemailer";

const MAIL_DEBUG =
  String(process.env.MAIL_DEBUG || "").toLowerCase() === "true" ||
  String(process.env.MAIL_DEBUG || "") === "1";

function mask(value) {
  const str = String(value || "");
  if (!str) return "";
  if (str.length <= 4) return "***";
  return `${str.slice(0, 2)}***${str.slice(-2)}`;
}

function formatMailError(error) {
  const err = error || {};
  return {
    name: err.name,
    message: err.message,
    code: err.code,
    command: err.command,
    responseCode: err.responseCode,
    response: err.response,
    stack: err.stack
  };
}

function getSmtpConfigOrReason() {
  const host = process.env.SMTP_HOST || "";
  const portRaw = process.env.SMTP_PORT;
  const port = Number.parseInt(String(portRaw || ""), 10);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || "";
  const secureRaw = process.env.SMTP_SECURE;
  const secure =
    String(secureRaw || "").toLowerCase() === "true" || String(secureRaw || "") === "1";

  const missing = [];
  if (!host) missing.push("SMTP_HOST");
  if (!Number.isFinite(port)) missing.push("SMTP_PORT");
  if (!from) missing.push("SMTP_FROM");

  if (missing.length > 0) {
    return {
      config: null,
      reason: "smtp_not_configured",
      missing,
      observed: { host, portRaw: String(portRaw || ""), from, secureRaw: String(secureRaw || "") }
    };
  }

  return {
    config: { host, port, user, pass, from, secure },
    reason: null,
    missing: [],
    observed: null
  };
}

let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    const { config, reason, missing, observed } = getSmtpConfigOrReason();
    if (!config) {
      console.warn(`[mail] SMTP not configured (${reason}). Missing: ${missing.join(", ")}`);
      if (MAIL_DEBUG) console.warn("[mail] SMTP observed values:", observed);
      return null;
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000
    });

    try {
      await transporter.verify();
      if (MAIL_DEBUG) {
        console.log("[mail] SMTP transporter verified:", {
          host: config.host,
          port: config.port,
          secure: config.secure,
          authUser: config.user ? mask(config.user) : ""
        });
      }
    } catch (error) {
      console.error("[mail] SMTP verify failed:", formatMailError(error));
    }

    return transporter;
  })();

  return transporterPromise;
}

export async function sendMail({ to, subject, text, html }) {
  const { config, reason, missing, observed } = getSmtpConfigOrReason();
  if (!config) {
    console.warn(`[mail] Not sending (SMTP not configured). Missing: ${missing.join(", ")}`);
    if (MAIL_DEBUG) console.warn("[mail] SMTP observed values:", observed);
    return { sent: false, reason: reason || "smtp_not_configured" };
  }

  const transporter = await getTransporter();
  if (!transporter) {
    console.warn("[mail] Not sending (transporter unavailable).");
    return { sent: false, reason: "smtp_not_configured" };
  }

  if (MAIL_DEBUG) {
    console.log("[mail] Sending email:", {
      from: config.from,
      to,
      subject,
      hasText: Boolean(text),
      hasHtml: Boolean(html),
      smtp: { host: config.host, port: config.port, secure: config.secure, authUser: mask(config.user) }
    });
  }

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text,
      ...(html ? { html } : {})
    });

    if (MAIL_DEBUG) {
      console.log("[mail] Email sent:", {
        messageId: info?.messageId,
        accepted: info?.accepted,
        rejected: info?.rejected,
        response: info?.response
      });
    }

    return { sent: true, messageId: info?.messageId };
  } catch (error) {
    console.error("[mail] sendMail failed:", formatMailError(error));
    return { sent: false, reason: "send_failed" };
  }
}

