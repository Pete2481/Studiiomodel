import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export interface SendEmailOptions {
  tenantId: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: any[];
  headers?: Record<string, string>;
}

class EmailService {
  private static instance: EmailService;

  private constructor() {}

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  async sendEmail(options: SendEmailOptions) {
    const { tenantId, to, subject, text, html, fromName, replyTo, attachments, headers } = options;
    console.log(`[EMAIL_SERVICE] Attempting to send email to ${to} for tenant ${tenantId}...`);

    // Fetch tenant SMTP settings
    let tenant = null;
    if (tenantId !== "MASTER") {
      tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          contactEmail: true,
          smtpHost: true,
          smtpPort: true,
          smtpUser: true,
          smtpPass: true,
          smtpSecure: true,
        }
      });
    }

    // Determine SMTP configuration
    // Fallback order: Tenant Settings -> AUTH_EMAIL_SERVER -> SMTP_ Env Vars -> Hardcoded Defaults
    let host = tenant?.smtpHost || process.env.SMTP_HOST;
    let port = Number(tenant?.smtpPort || process.env.SMTP_PORT);
    let user = tenant?.smtpUser || process.env.SMTP_USER;
    let pass = tenant?.smtpPass || process.env.SMTP_PASS;
    let secure = tenant?.smtpSecure !== null && tenant?.smtpSecure !== undefined 
      ? tenant.smtpSecure 
      : (process.env.SMTP_SECURE === "true");

    // NEW: If we still don't have settings, try to parse the AUTH_EMAIL_SERVER JSON
    if (!host && process.env.AUTH_EMAIL_SERVER) {
      try {
        const authConfig = JSON.parse(process.env.AUTH_EMAIL_SERVER);
        host = authConfig.host;
        port = Number(authConfig.port);
        user = authConfig.auth?.user;
        pass = authConfig.auth?.pass;
        secure = authConfig.secure;
        console.log(`[EMAIL_SERVICE] Using configuration from AUTH_EMAIL_SERVER`);
      } catch (e) {
        console.error("[EMAIL_SERVICE] Failed to parse AUTH_EMAIL_SERVER JSON", e);
      }
    }

    // Final hardcoded fallbacks if absolutely nothing is set
    host = host || "mail.studiio.au";
    port = port || 465;
    user = user || "team@studiio.au";
    pass = pass || "Media@2026!";
    if (secure === undefined) secure = true;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    const mailOptions = {
      from: `"${fromName || tenant?.name || "Studiio"}" <${user}>`,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      text,
      html,
      replyTo: replyTo || tenant?.contactEmail || user,
      attachments,
      headers: {
        "X-Entity-Ref-ID": `${tenantId}-${Date.now()}`,
        "X-Priority": "1 (Highest)",
        "Precedence": "transactional",
        ...headers,
      },
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error("Error sending email:", error);
      throw error;
    }
  }
}

export const emailService = EmailService.getInstance();

