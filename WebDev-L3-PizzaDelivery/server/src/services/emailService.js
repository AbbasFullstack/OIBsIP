import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../utils/logger.js';

let transporterPromise = null;

// Builds (once) a transporter. With no SMTP_HOST configured we fall back to
// Nodemailer's Ethereal test account, which requires no signup and logs a
// preview URL per message so local development can still verify email flows.
const getTransporter = async () => {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (env.smtp.host) {
      const transport = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
      });
      await transport.verify();
      logger.info(`SMTP transport ready (${env.smtp.host}:${env.smtp.port})`);
      return transport;
    }

    const testAccount = await nodemailer.createTestAccount();
    const transport = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    logger.warn(
      'SMTP_HOST not set — using Nodemailer Ethereal test account. ' +
        'Emails are captured, not delivered; a preview URL is logged per message.',
    );
    return transport;
  })();

  return transporterPromise;
};

const layout = ({ title, body, cta, ctaUrl, footnote }) => `
  <div style="font-family:Segoe UI,Arial,sans-serif;background:#f5f2ee;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eadfd5">
      <div style="background:#e4572e;padding:20px 24px;color:#fff">
        <h1 style="margin:0;font-size:20px">🍕 Slice Pizza Delivery</h1>
      </div>
      <div style="padding:24px;color:#2b2118;line-height:1.6">
        <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
        <div>${body}</div>
        ${
          cta
            ? `<p style="margin:24px 0">
                 <a href="${ctaUrl}" style="background:#e4572e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block">${cta}</a>
               </p>
               <p style="font-size:12px;color:#8a7a6d;word-break:break-all">${ctaUrl}</p>`
            : ''
        }
        ${footnote ? `<p style="font-size:12px;color:#8a7a6d">${footnote}</p>` : ''}
      </div>
    </div>
  </div>
`;

const send = async ({ to, subject, html }) => {
  const transport = await getTransporter();
  const info = await transport.sendMail({ from: env.mailFrom, to, subject, html });
  const preview = nodemailer.getTestMessageUrl(info);
  if (preview) logger.info(`Email preview (${subject} → ${to}): ${preview}`);
  return { messageId: info.messageId, previewUrl: preview || null };
};

const money = (n) => `₹${Number(n).toFixed(2)}`;

export const sendVerification = ({ to, name, token }) => {
  const url = `${env.clientUrl}/verify-email?token=${token}`;
  return send({
    to,
    subject: 'Verify your email address',
    html: layout({
      title: `Welcome, ${name}!`,
      body: 'Please confirm your email address to activate your account. This link expires soon.',
      cta: 'Verify email',
      ctaUrl: url,
      footnote: 'If you did not create this account, you can safely ignore this email.',
    }),
  });
};

export const sendPasswordReset = ({ to, name, token }) => {
  const url = `${env.clientUrl}/reset-password?token=${token}`;
  return send({
    to,
    subject: 'Reset your password',
    html: layout({
      title: 'Password reset requested',
      body: `Hi ${name}, we received a request to reset your password. Click below to choose a new one.`,
      cta: 'Reset password',
      ctaUrl: url,
      footnote: 'If you did not request this, ignore this email — your password will not change.',
    }),
  });
};

export const sendOrderConfirmation = ({ to, name, orderId, totalAmount, items }) => {
  const rows = (items || [])
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${i.name} × ${i.quantity}</td>
         <td style="padding:6px 0;text-align:right">${money(i.unitPrice * i.quantity)}</td></tr>`,
    )
    .join('');
  return send({
    to,
    subject: 'Order confirmed — thank you!',
    html: layout({
      title: 'Your order is confirmed',
      body: `
        <p>Hi ${name}, we've received your payment and your order is now <strong>Received</strong>.</p>
        <p style="font-size:13px;color:#8a7a6d">Order #${String(orderId).slice(-8).toUpperCase()}</p>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <hr style="border:none;border-top:1px solid #eadfd5;margin:12px 0" />
        <p style="text-align:right;font-weight:700">Total: ${money(totalAmount)}</p>
      `,
      cta: 'Track your order',
      ctaUrl: `${env.clientUrl}/orders/${orderId}`,
    }),
  });
};

export const sendLowStockAlert = ({ to, ingredients }) => {
  const rows = (ingredients || [])
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${i.name} <em style="color:#8a7a6d">(${i.category})</em></td>
         <td style="padding:6px 0;text-align:right">${i.stock} left / threshold ${i.lowStockThreshold}</td></tr>`,
    )
    .join('');
  return send({
    to,
    subject: `Low stock alert — ${ingredients.length} ingredient(s) need restocking`,
    html: layout({
      title: 'Inventory running low',
      body: `<table style="width:100%;border-collapse:collapse">${rows}</table>`,
      cta: 'Open inventory',
      ctaUrl: `${env.clientUrl}/admin/inventory`,
    }),
  });
};

export const verifyEmailTransport = async () => {
  await getTransporter();
};

export default {
  sendVerification,
  sendPasswordReset,
  sendOrderConfirmation,
  sendLowStockAlert,
  verifyEmailTransport,
};