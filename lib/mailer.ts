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

  if (!user || !pass) {
    throw new Error("SMTP credentials are not configured");
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

export async function sendClientCredentialsEmail({
  to,
  fullName,
  clientId,
  password,
}: SendClientCredentialsEmailParams) {
  const from = process.env.SMTP_USER;
  if (!from) {
    throw new Error("SMTP sender is not configured");
  }

  const name = fullName?.trim() || "Investor";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f4f6f8;color:#1a1a2e">
      <div style="background:#ffffff;border:1px solid #dde3ea;border-radius:12px;padding:32px">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:1px;color:#6b7280;text-transform:uppercase">Zero-dha</p>
        <h2 style="margin:0 0 20px;font-size:22px;color:#111827;font-weight:700">Your account is ready</h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151">Dear ${name},</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#374151">
          Welcome to Zero-dha. Your trading account has been set up and is now active.
          Below are the details you need to sign in to the app.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 20px">
          <tr>
            <td style="font-size:13px;color:#6b7280;padding-bottom:8px">Client ID</td>
            <td style="font-size:15px;font-weight:700;color:#111827;text-align:right;padding-bottom:8px">${clientId}</td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#6b7280">Access key</td>
            <td style="font-size:15px;font-weight:700;color:#111827;text-align:right">${password}</td>
          </tr>
        </table>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#6b7280">
          Once signed in, you can view your portfolio, open positions, fund details, and transaction history inside the app.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
          This message was sent to you because an account was created in your name on Zero-dha. If you have any questions, reach out to your relationship manager.
        </p>
      </div>
    </div>
  `;

  const text = [
    `Dear ${name},`,
    "",
    "Welcome to Zero-dha. Your trading account is now active.",
    "",
    `Client ID : ${clientId}`,
    `Access key: ${password}`,
    "",
    "Sign in to the app to view your portfolio, positions, and funds.",
    "",
    "If you have questions, contact your relationship manager.",
  ].join("\n");

  await getTransporter().sendMail({
    from: `Zero-dha <${from}>`,
    to,
    subject: `Welcome to Zero-dha — account activated`,
    html,
    text,
  });
}
