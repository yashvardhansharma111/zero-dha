import nodemailer from "nodemailer";

type SendClientCredentialsEmailParams = {
  to: string;
  fullName?: string | null;
  clientId: string;
  password: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");

  if (!user || !pass) {
    throw new Error("SMTP credentials are not configured");
  }

  transporter = nodemailer.createTransport(
    host
      ? { host, port, secure: port === 465, auth: { user, pass } }
      : { service: "gmail", auth: { user, pass } },
  );

  return transporter;
}

export async function sendClientCredentialsEmail({
  to,
  fullName,
  clientId,
  password,
}: SendClientCredentialsEmailParams) {
  const fromEmail = process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || "Zero-dha";
  if (!fromEmail) {
    throw new Error("SMTP sender is not configured");
  }
  const from = `${fromName} <${fromEmail}>`;

  const name = fullName?.trim() || "Investor";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f4f6f8;color:#1a1a2e">
      <div style="background:#ffffff;border:1px solid #dde3ea;border-radius:12px;padding:32px">

        <p>Dear ${name},</p>

        <p>
          Welcome to Zero-dha. Your registration has been completed successfully.
          Below are your login details for accessing your account.
        </p>

        <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin:16px 0">
          <tr style="background:#f9fafb">
            <td style="font-size:14px;color:#6b7280;border-bottom:1px solid #e5e7eb">User ID</td>
            <td style="font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb">${clientId}</td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#6b7280">Temporary Login Code</td>
            <td style="font-size:14px;font-weight:700;color:#111827">${password}</td>
          </tr>
        </table>

        <p>Please sign in and update your login code after your first login.</p>

        <p>If you did not request this account, please contact support immediately.</p>

        <p style="margin:0;font-size:13px;color:#6b7280">Support: support@zero-dha.in</p>

      </div>
    </div>
  `;

  const text = [
    `Dear ${name},`,
    "",
    "Welcome to Zero-dha. Your registration has been completed successfully.",
    "Below are your login details for accessing your account.",
    "",
    `User ID             : ${clientId}`,
    `Temporary Login Code: ${password}`,
    "",
    "Please sign in and update your login code after your first login.",
    "",
    "If you did not request this account, please contact support immediately.",
    "",
    "Support: support@zero-dha.in",
  ].join("\n");

  await getTransporter().sendMail({
    from,
    to,
    subject: "Your Zero-dha account is ready",
    html,
    text,
  });
}
