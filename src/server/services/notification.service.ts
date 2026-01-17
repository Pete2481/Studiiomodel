import "server-only";
import { emailService } from "./email.service";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { formatDropboxUrl } from "@/lib/utils";

export type BookingNotificationType =
  | "NEW_BOOKING"
  | "BOOKING_APPROVED"
  | "BOOKING_UPDATED"
  | "BOOKING_CANCELLED"
  | "BOOKING_CHANGE_REQUESTED";

type BookingEmailPreview = {
  bookingId: string;
  type: BookingNotificationType;
  subject: string;
  html: string;
  to: string[];
};

export class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private getBaseTemplate(content: string, tenant: any, title: string = "Notification") {
    const brandColor = tenant.brandColor || "#10b981";
    const tenantName = tenant.name;
    const logoUrl = tenant.logoUrl;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background-color: #f8fafc; }
            .wrapper { width: 100%; padding: 40px 0; }
            .container { max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
            .flex-container { display: flex; flex-direction: row; }
            @media (max-width: 600px) { .flex-container { flex-direction: column; } .sidebar { width: 100% !important; border-left: none !important; border-top: 1px solid #f1f5f9; } }
            .main-content { flex: 1; padding: 48px; }
            .sidebar { width: 240px; background: #fcfcfd; padding: 48px 32px; border-left: 1px solid #f1f5f9; text-align: center; }
            .header-badge { display: inline-block; padding: 6px 12px; background: ${brandColor}15; color: ${brandColor}; border-radius: 100px; font-size: 10px; font-weight: 800; text-transform: uppercase; tracking-widest; margin-bottom: 16px; }
            h1 { margin: 0; font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; line-height: 1.2; }
            .divider { height: 1px; background: #f1f5f9; margin: 32px 0; }
            .details-grid { margin: 24px 0; }
            .detail-item { margin-bottom: 16px; }
            .detail-label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px; }
            .detail-value { font-size: 14px; font-weight: 600; color: #334155; }
            .detail-value.link { color: ${brandColor}; text-decoration: none; }
            .button { display: inline-block; padding: 14px 28px; background-color: ${brandColor}; color: white !important; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.025em; margin-top: 24px; box-shadow: 0 10px 15px -3px ${brandColor}40; }
            .sidebar-logo { max-width: 120px; height: auto; margin-bottom: 24px; }
            .sidebar-info { font-size: 12px; color: #64748b; font-weight: 500; line-height: 1.5; margin-bottom: 24px; }
            .footer { text-align: center; margin-top: 32px; padding: 0 20px; }
            .footer p { color: #94a3b8; font-size: 12px; margin: 4px 0; }
            .powered-by { margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="container">
              <div class="flex-container">
                <div class="main-content">
                  <div class="header-badge">${title}</div>
                  ${content}
                </div>
                <div class="sidebar">
                  ${logoUrl ? `<img src="${logoUrl}" class="sidebar-logo" alt="${tenantName}">` : `<div style="font-size: 24px; font-weight: 900; color: ${brandColor}; margin-bottom: 24px;">${tenantName[0]}${tenantName[1]}</div>`}
                  <div class="sidebar-info">
                    <strong style="color: #0f172a; display: block; margin-bottom: 4px;">${tenantName}</strong>
                    ${tenant.address ? `<span>${tenant.address}</span><br>` : ""}
                    ${tenant.city ? `<span>${tenant.city} ${tenant.postalCode || ""}</span><br>` : ""}
                    <span>AUSTRALIA</span><br>
                    <a href="tel:${tenant.contactPhone}" style="color: inherit; text-decoration: none; margin-top: 8px; display: block;">${tenant.contactPhone || ""}</a>
                  </div>
                  <a href="${process.env.NEXT_PUBLIC_APP_URL}" class="button" style="padding: 10px 20px; font-size: 11px;">Dashboard</a>
                </div>
              </div>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${tenantName}. All rights reserved.</p>
              <p>You received this message regarding your account with ${tenantName}.</p>
              <a href="https://studiio.au" class="powered-by">
                <span style="color: #94a3b8; font-size: 11px; font-weight: 600;">Powered by</span>
                <img src="https://studiio.au/logo-dark.png" height="16" alt="Studiio">
              </a>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private generateCalendarUrl(booking: any) {
    const start = new Date(booking.startAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const end = new Date(booking.endAt).toISOString().replace(/-|:|\.\d\d\d/g, "");
    
    // Client Name as the Main Header
    const clientName = booking.client?.businessName || booking.client?.name || "Client";
    const title = encodeURIComponent(clientName);
    
    const teamNames = booking.assignments?.map((a: any) => a.teamMember.displayName).join(", ") || "TBC";
    
    const detailsText = [
      `Job: ${booking.title}`,
      `Shoot with ${booking.tenant.name}`,
      `--------------------------`,
      `Client: ${clientName}`,
      `Team: ${teamNames}`,
      `Services: ${booking.services.map((s: any) => s.service.name).join(", ")}`,
      `Access: ${booking.propertyStatus || "TBC"}`,
      `--------------------------`,
      booking.clientNotes ? `Notes: ${booking.clientNotes}` : "",
      booking.internalNotes ? `Instructions: ${booking.internalNotes}` : ""
    ].filter(Boolean).join("\n");

    const details = encodeURIComponent(detailsText);
    const location = encodeURIComponent(booking.property?.name || booking.title);
    
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`;
  }

  private blocksToHtml(blocks: any[], data: Record<string, string> = {}) {
    return (blocks || []).map(block => {
      if (block.type === 'text') {
        let content = block.content || "";
        Object.entries(data).forEach(([tag, val]) => {
          content = content.replaceAll(tag, val);
        });
        return `<div style="margin-bottom: 24px; font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap;">${content}</div>`;
      } else if (block.type === 'image' && block.content) {
        // If it's a data URL, it might be too large for some email clients, but we'll include it for now as per design
        return `
          <div style="margin-bottom: 24px; text-align: center;">
            <img src="${block.content}" style="width: ${block.width || 100}%; height: auto; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" alt="Newsletter Image">
          </div>
        `;
      }
      return "";
    }).join("");
  }

  private applyTags(input: string, data: Record<string, string> = {}) {
    let out = input || "";
    Object.entries(data).forEach(([tag, val]) => {
      out = out.replaceAll(tag, val);
    });
    return out;
  }

  private formatInTenantTz(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-AU", { timeZone, ...opts }).format(d);
  }

  private resolveBookingRecipients(booking: any) {
    const emails: string[] = [];
    const add = (e?: string | null) => {
      const v = String(e || "").trim();
      if (!v) return;
      if (!emails.includes(v)) emails.push(v);
    };

    // Tenant
    add(booking?.tenant?.contactEmail);

    // Client (or OTC)
    add(booking?.client?.email);
    add(booking?.otcEmail);

    // Agent (if different)
    if (booking?.agent?.email && booking.agent.email !== booking?.client?.email) add(booking.agent.email);

    // Team members assigned
    for (const a of booking?.assignments || []) {
      add(a?.teamMember?.email);
    }

    return emails;
  }

  private async getBookingForEmail(bookingId: string) {
    return await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tenant: true,
        client: true,
        property: true,
        agent: true,
        services: { include: { service: true } },
        assignments: { include: { teamMember: true } },
      },
    });
  }

  async buildBookingEmail(params: { bookingId: string; type: BookingNotificationType }): Promise<BookingEmailPreview | null> {
    const { bookingId, type } = params;
    const booking = await this.getBookingForEmail(bookingId);
    if (!booking) return null;

    const tz = String(booking.timezone || booking.tenant?.timezone || "Australia/Sydney");
    const date = this.formatInTenantTz(booking.startAt.toISOString(), tz, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const startTime = this.formatInTenantTz(booking.startAt.toISOString(), tz, { hour: "numeric", minute: "2-digit", hour12: true });
    const endTime = this.formatInTenantTz(booking.endAt.toISOString(), tz, { hour: "numeric", minute: "2-digit", hour12: true });
    const when = `${date} • ${String(startTime).toUpperCase()} — ${String(endTime).toUpperCase()}`;
    const location = booking.property?.name || booking.title;
    const clientName = booking.client?.businessName || booking.client?.name || booking.otcName || "Client";
    const services = (booking.services || []).map((s: any) => s?.service?.name).filter(Boolean).join(", ") || "TBC";
    const team = (booking.assignments || []).map((a: any) => a?.teamMember?.displayName).filter(Boolean).join(", ") || "Unassigned";
    const agentName = booking.agent?.name || "PENDING";
    const status = String(booking.status || "REQUESTED").toUpperCase();

    const titleMap: Record<BookingNotificationType, string> = {
      NEW_BOOKING: "New Booking",
      BOOKING_APPROVED: "Booking Approved",
      BOOKING_UPDATED: "Booking Updated",
      BOOKING_CANCELLED: "Booking Cancelled",
      BOOKING_CHANGE_REQUESTED: "Change Requested",
    };

    const subjectMap: Record<BookingNotificationType, string> = {
      NEW_BOOKING: `New Booking: ${location}`,
      BOOKING_APPROVED: `Approved: ${location}`,
      BOOKING_UPDATED: `Updated: ${location}`,
      BOOKING_CANCELLED: `Cancelled: ${location}`,
      BOOKING_CHANGE_REQUESTED: `Change Requested: ${location}`,
    };

    const messageMap: Record<BookingNotificationType, string> = {
      NEW_BOOKING: `A new appointment has been created for <strong>${location}</strong>.`,
      BOOKING_APPROVED: `This booking has been <strong>approved</strong>.`,
      BOOKING_UPDATED: `This booking has been <strong>updated</strong>.`,
      BOOKING_CANCELLED: `This booking has been <strong>cancelled</strong>.`,
      BOOKING_CHANGE_REQUESTED: `A <strong>change request</strong> has been made for this booking.`,
    };

    const googleCalUrl = this.generateCalendarUrl(booking);
    const appleCalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/${booking.id}`;

    const html = this.getBaseTemplate(
      `
      <h1>${titleMap[type]}</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">${messageMap[type]}</p>
      
      <div class="divider"></div>

      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">When</span>
          <span class="detail-value">${when}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Location</span>
          <span class="detail-value">${location}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Client</span>
          <span class="detail-value">${clientName}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Agent</span>
          <span class="detail-value">${agentName}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Team</span>
          <span class="detail-value">${team}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Services</span>
          <span class="detail-value">${services}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Access</span>
          <span class="detail-value">${booking.propertyStatus || "TBC"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Status</span>
          <span class="detail-value">${status}</span>
        </div>
        ${
          booking.clientNotes
            ? `<div class="detail-item"><span class="detail-label">Client Notes</span><span class="detail-value">${booking.clientNotes}</span></div>`
            : ""
        }
        ${
          booking.internalNotes
            ? `<div class="detail-item"><span class="detail-label">Internal Notes</span><span class="detail-value">${booking.internalNotes}</span></div>`
            : ""
        }
      </div>

      <div class="divider"></div>

      <div style="text-align: center; space-y: 12px;">
        <a href="${googleCalUrl}" style="font-size: 12px; font-weight: 700; color: ${booking.tenant.brandColor || "#10b981"}; text-decoration: none; border: 2px solid ${booking.tenant.brandColor || "#10b981"}; padding: 10px 20px; border-radius: 10px; display: inline-block; margin: 0 8px 12px 8px;">+ Add to Google Calendar</a>
        <a href="${appleCalUrl}" style="font-size: 12px; font-weight: 700; color: #ef4444; text-decoration: none; border: 2px solid #ef4444; padding: 10px 20px; border-radius: 10px; display: inline-block; margin: 0 8px 12px 8px;">+ Add to Apple Calendar</a>
      </div>
    `,
      booking.tenant,
      titleMap[type]
    );

    const to = this.resolveBookingRecipients(booking);
    return { bookingId: String(booking.id), type, subject: subjectMap[type], html, to };
  }

  async sendBookingEmail(params: { bookingId: string; type: BookingNotificationType; toOverride?: string[] }) {
    const preview = await this.buildBookingEmail({ bookingId: params.bookingId, type: params.type });
    if (!preview) return { success: false, error: "Booking not found" };
    const to = Array.isArray(params.toOverride) && params.toOverride.length ? params.toOverride : preview.to;
    if (!to.length) return { success: false, error: "No recipients" };

    await emailService.sendEmail({
      tenantId: (await prisma.booking.findUnique({ where: { id: params.bookingId }, select: { tenantId: true } }))?.tenantId || "MASTER",
      to,
      subject: preview.subject,
      html: preview.html,
      headers: {
        "X-Entity-Ref-ID": `booking-${preview.type}-${preview.bookingId}`,
      },
    });

    return { success: true, to, subject: preview.subject };
  }

  /**
   * Sends an email using the standard Studiio base template + block content.
   * This is used for Master Admin communications (welcome template + newsletters).
   */
  async sendCustomTemplateEmail(params: {
    tenant: any;
    toEmail: string;
    subject: string;
    title: string;
    blocks: any[];
    data?: Record<string, string>;
    headers?: Record<string, string>;
    sendAsMaster?: boolean;
  }) {
    const {
      tenant,
      toEmail,
      subject,
      title,
      blocks,
      data = {},
      headers,
      sendAsMaster = false,
    } = params;

    if (!toEmail) return;

    const contentHtml = this.blocksToHtml(blocks || [], data);
    const html = this.getBaseTemplate(contentHtml, tenant, title);

    await emailService.sendEmail({
      // Master sending ensures it comes from team@studiio.au (and not tenant SMTP settings)
      tenantId: sendAsMaster ? "MASTER" : (tenant?.id || "MASTER"),
      to: toEmail,
      subject: this.applyTags(subject, data),
      html,
      fromName: "Studiio",
      replyTo: "team@studiio.au",
      headers,
    });
  }

  /**
   * Global welcome email sent when a new tenant is created in Master Admin.
   * Uses `SystemConfig.welcomeEmailSubject` and `SystemConfig.welcomeEmailBlocks`.
   */
  async sendTenantWelcomeEmail(params: { tenantId: string; toEmail: string; toName?: string | null }) {
    const { tenantId, toEmail, toName } = params;
    if (!tenantId || !toEmail) return;

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const cfg = await prisma.systemConfig.findUnique({
      where: { id: "system" },
      select: { welcomeEmailSubject: true, welcomeEmailBlocks: true },
    });

    const subject = cfg?.welcomeEmailSubject || "Welcome to Studiio";
    const blocks = (cfg?.welcomeEmailBlocks as any) || [];

    await this.sendCustomTemplateEmail({
      tenant,
      toEmail,
      subject,
      title: "Welcome",
      blocks,
      data: {
        "@user_name": (toName || "there").toString(),
        "@studio_name": tenant.name,
      },
      sendAsMaster: true,
      headers: {
        "Precedence": "transactional",
        "X-Entity-Ref-ID": `tenant-welcome-${tenantId}`,
      },
    });
  }

  // 1. New Booking Notification (to Admin)
  async sendNewBookingNotification(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tenant: true,
        client: true,
        property: true,
        agent: true,
        services: { include: { service: true } },
        assignments: { include: { teamMember: true } }
      }
    });

    if (!booking) return;

    const brandColor = booking.tenant.brandColor || "#10b981";

    const html = this.getBaseTemplate(`
      <h1>New Booking Created</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">A new appointment has been scheduled for ${booking.property?.name || booking.title}.</p>
      
      <div class="divider"></div>

      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Date</span>
          <span class="detail-value">${format(new Date(booking.startAt), "PPPP")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Time</span>
          <span class="detail-value">${format(new Date(booking.startAt), "p")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Project</span>
          <span class="detail-value">${booking.property?.name || booking.title}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Access Status</span>
          <span class="detail-value" style="color: ${brandColor}; font-weight: 700;">${booking.propertyStatus || "TBC"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Services</span>
          <span class="detail-value">${booking.services.map(s => s.service.name).join(", ")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Team Members</span>
          <span class="detail-value">
            ${booking.assignments.map(a => `
              <div style="margin-bottom: 4px;">
                ${a.teamMember.displayName} 
                ${a.teamMember.phone ? `<span style="color: ${brandColor}; font-size: 12px; margin-left: 8px; font-weight: 700;">${a.teamMember.phone}</span>` : ""}
              </div>
            `).join("") || "Unassigned"}
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Lead Agent</span>
          <span class="detail-value">${booking.agent?.name || "PENDING"}</span>
          ${booking.agent?.phone ? `<br/><span style="color: ${brandColor}; font-size: 12px; font-weight: 700;">${booking.agent.phone}</span>` : ""}
        </div>
        <div class="detail-item">
          <span class="detail-label">Agency Name</span>
          <span class="detail-value">${booking.client?.businessName || booking.client?.name || "Client"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Client Email</span>
          <a href="mailto:${booking.client?.email}" class="detail-value link">${booking.client?.email}</a>
        </div>
        <div class="detail-item">
          <span class="detail-label">Instructions / Access</span>
          <span class="detail-value">${booking.clientNotes || "None provided"}</span>
        </div>
      </div>

      <div class="divider"></div>
      
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/tenant/calendar" class="button">View Calendar</a>
    `, booking.tenant, "New Booking");

    await emailService.sendEmail({
      tenantId: booking.tenantId,
      to: booking.tenant.contactEmail || "",
      subject: `New Booking: ${booking.property?.name || booking.title}`,
      html
    });
  }

  // 2. Booking Confirmation (to Client)
  async sendBookingConfirmationToClient(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tenant: true,
        client: true,
        property: true,
        agent: true,
        services: { include: { service: true } },
        assignments: { include: { teamMember: true } }
      }
    });

    if (!booking || !booking.client?.email) return;

    const brandColor = booking.tenant.brandColor || "#10b981";
    const googleCalUrl = this.generateCalendarUrl(booking);
    const appleCalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/${booking.id}`;

    const html = this.getBaseTemplate(`
      <h1>Booking Confirmed</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Hi ${booking.client?.name || "Client"}, your booking with ${booking.tenant.name} is now confirmed.</p>
      
      <div class="divider"></div>

      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Date</span>
          <span class="detail-value">${format(new Date(booking.startAt), "PPPP")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Time</span>
          <span class="detail-value">${format(new Date(booking.startAt), "p")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Location</span>
          <span class="detail-value">${booking.property?.name || booking.title}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Access Status</span>
          <span class="detail-value" style="color: ${brandColor}; font-weight: 700;">${booking.propertyStatus || "TBC"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Services</span>
          <span class="detail-value">${booking.services.map(s => s.service.name).join(", ")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Team Assigned</span>
          <span class="detail-value">
            ${booking.assignments.map(a => `
              <div style="margin-bottom: 4px;">
                ${a.teamMember.displayName} 
                ${a.teamMember.phone ? `<span style="color: ${brandColor}; font-size: 12px; margin-left: 8px; font-weight: 700;">${a.teamMember.phone}</span>` : ""}
              </div>
            `).join("") || "Assigned by Admin"}
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Lead Agent</span>
          <span class="detail-value">${booking.agent?.name || "PENDING"}</span>
          ${booking.agent?.phone ? `<br/><span style="color: ${brandColor}; font-size: 12px; font-weight: 700;">${booking.agent.phone}</span>` : ""}
        </div>
        ${booking.clientNotes ? `
        <div class="detail-item">
          <span class="detail-label">Important Notes</span>
          <span class="detail-value">${booking.clientNotes}</span>
        </div>` : ""}
      </div>

      <div class="divider"></div>
      
      <div style="text-align: center; space-y: 12px;">
        <a href="${googleCalUrl}" style="font-size: 12px; font-weight: 700; color: ${brandColor}; text-decoration: none; border: 2px solid ${brandColor}; padding: 10px 20px; border-radius: 10px; display: inline-block; margin: 0 8px 12px 8px;">+ Add to Google Calendar</a>
        <a href="${appleCalUrl}" style="font-size: 12px; font-weight: 700; color: #ef4444; text-decoration: none; border: 2px solid #ef4444; padding: 10px 20px; border-radius: 10px; display: inline-block; margin: 0 8px 12px 8px;">+ Add to Apple Calendar</a>
      </div>
    `, booking.tenant, "Booking Confirmed");

    // Send to Agency
    await emailService.sendEmail({
      tenantId: booking.tenantId,
      to: booking.client?.email || "",
      subject: `Confirmed: ${booking.property?.name || booking.title}`,
      html
    });

    // Also send to Agent if they have a separate email
    if (booking.agent?.email && booking.agent.email !== booking.client?.email) {
      await emailService.sendEmail({
        tenantId: booking.tenantId,
        to: booking.agent.email,
        subject: `Confirmed: ${booking.property?.name || booking.title}`,
        html
      });
    }
  }

  // 3. Invoice Issued
  async sendInvoiceNotification(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        tenant: true,
        client: true,
        lineItems: true,
      }
    });

    const toEmail = invoice?.invoiceEmailOverride || invoice?.client?.email;
    if (!invoice || !toEmail) return;

    const total = invoice.lineItems.reduce((acc, item) => acc + (Number(item.unitPrice) * item.quantity), 0);
    const taxRate = Number(invoice.taxRate);
    const discount = Number(invoice.discount);
    const grandTotal = (total - discount) * (1 + taxRate);

    const html = this.getBaseTemplate(`
      <h1>New Invoice</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Invoice <strong>#${invoice.number}</strong> from ${invoice.tenant.name} is now available.</p>
      
      <div class="divider"></div>

      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Amount Due</span>
          <span class="detail-value" style="font-size: 24px; color: #0f172a;">${invoice.currency} ${grandTotal.toFixed(2)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Due Date</span>
          <span class="detail-value">${invoice.dueAt ? format(new Date(invoice.dueAt), "PPPP") : "On Receipt"}</span>
        </div>
      </div>

      <div class="divider"></div>
      
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/api/tenant/${invoice.tenantId}/invoices/${invoice.id}/pdf" class="button">Download Invoice PDF</a>
    `, invoice.tenant, "Invoice Issued");

    await emailService.sendEmail({
      tenantId: invoice.tenantId,
      to: toEmail,
      subject: `Invoice #${invoice.number} from ${invoice.tenant.name}`,
      html
    });
  }

  // 3b. Invoice Reminder
  async sendInvoiceReminder(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        tenant: true,
        client: true,
        lineItems: true,
      }
    });

    const toEmail = invoice?.invoiceEmailOverride || invoice?.client?.email;
    if (!invoice || !toEmail) return;

    const subtotal = invoice.lineItems.reduce((acc, item) => acc + (Number(item.unitPrice) * item.quantity), 0);
    const discount = Number(invoice.discount);
    const taxRate = Number(invoice.taxRate);
    const total = (subtotal - discount) * (1 + taxRate);
    const balance = total - Number(invoice.paidAmount);

    const brandColor = invoice.tenant.brandColor || "#10b981";

    const html = this.getBaseTemplate(`
      <h1 style="color: #ef4444;">Payment Reminder</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">This is a friendly reminder that invoice <strong>#${invoice.number}</strong> from ${invoice.tenant.name} is currently outstanding.</p>
      
      <div class="divider"></div>

      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Balance Outstanding</span>
          <span class="detail-value" style="font-size: 24px; color: #ef4444;">${invoice.currency} ${balance.toFixed(2)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Original Due Date</span>
          <span class="detail-value">${invoice.dueAt ? format(new Date(invoice.dueAt), "PPPP") : "On Receipt"}</span>
        </div>
      </div>

      <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 20px; border-radius: 0 12px 12px 0; margin: 24px 0;">
        <p style="margin: 0; font-size: 13px; color: #9a3412; font-weight: 600;">Please arrange payment as soon as possible to avoid any service interruptions or late fees.</p>
      </div>

      <div class="divider"></div>
      
      <div style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/api/tenant/${invoice.tenantId}/invoices/${invoice.id}/pdf" class="button">View & Download Invoice</a>
      </div>
    `, invoice.tenant, "Overdue Notice");

    await emailService.sendEmail({
      tenantId: invoice.tenantId,
      to: toEmail,
      subject: `REMINDER: Invoice #${invoice.number} is outstanding`,
      html
    });
  }

  // 4. Edit Request Completed
  async sendEditRequestCompleted(requestId: string) {
    const request = await prisma.editRequest.findUnique({
      where: { id: requestId },
      include: {
        tenant: true,
        client: true,
        gallery: true,
      }
    });

    if (!request || !request.client?.email) return;

    const html = this.getBaseTemplate(`
      <h1>Edits Completed</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Your edit request for <strong>${request.gallery.title}</strong> has been processed.</p>
      
      <div class="divider"></div>

      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Gallery</span>
          <span class="detail-value">${request.gallery.title}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Completed At</span>
          <span class="detail-value">${format(new Date(), "PPPP p")}</span>
        </div>
      </div>

      <div class="divider"></div>
      
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/tenant/galleries" class="button">View Gallery</a>
    `, request.tenant, "Edits Ready");

    await emailService.sendEmail({
      tenantId: request.tenantId,
      to: request.client.email,
      subject: `Edits Completed: ${request.gallery.title}`,
      html
    });
  }

  // 5. Welcome Team Member
  async sendTeamMemberWelcome(memberId: string) {
    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      include: { tenant: true }
    });

    if (!member || !member.email) return;

    const html = this.getBaseTemplate(`
      <h1>Welcome to the Team</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Hi ${member.displayName}, you've been added to ${member.tenant.name} on Studiio.</p>
      
      <div class="divider"></div>

      <p style="font-size: 14px; color: #334155; font-weight: 500;">Use the button below to access your dashboard and view your upcoming assignments.</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/login" class="button">Access Dashboard</a>
    `, member.tenant, "Welcome");

    await emailService.sendEmail({
      tenantId: member.tenantId,
      to: member.email,
      subject: `Welcome to ${member.tenant.name}`,
      html
    });
  }

  // 6. Welcome Client
  async sendClientWelcome(clientId: string) {
    console.log(`[NOTIFICATION_SERVICE] Preparing welcome email for client ${clientId}...`);
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { tenant: true }
    });

    if (!client || !client.email) return;

    const html = this.getBaseTemplate(`
      <h1>Welcome to the Portal</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Hi ${client.name}, ${client.tenant.name} has invited you to their client portal.</p>
      
      <div class="divider"></div>

      <p style="font-size: 14px; color: #334155; font-weight: 500;">Log in to view your bookings, download invoices, and access your high-res galleries.</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/login" class="button">Access Client Portal</a>
    `, client.tenant, "Welcome");

    await emailService.sendEmail({
      tenantId: client.tenantId,
      to: client.email,
      subject: `Welcome to ${client.tenant.name} Portal`,
      html
    });
  }

  // 9. Welcome Agent
  async sendAgentWelcome(agentId: string) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { tenant: true, client: true }
    });

    if (!agent || !agent.email) return;

    const html = this.getBaseTemplate(`
      <h1>Welcome Agent</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Hi ${agent.name}, you've been added as an agent for <strong>${agent.client.businessName || agent.client.name}</strong> at ${agent.tenant.name}.</p>
      
      <div class="divider"></div>

      <p style="font-size: 14px; color: #334155; font-weight: 500;">Log in to track your upcoming shoots, view your property galleries, and manage your bookings.</p>

      <a href="${process.env.NEXT_PUBLIC_APP_URL}/login" class="button">Access Agency Portal</a>
    `, agent.tenant, "Welcome");

    await emailService.sendEmail({
      tenantId: agent.tenantId,
      to: agent.email,
      subject: `Welcome to ${agent.tenant.name} - Agency Portal`,
      html
    });
  }

  // 7. Gallery Delivered
  async sendGalleryDelivery(galleryId: string) {
    console.log(`[DEBUG] Attempting to send gallery delivery notification for ${galleryId}`);
    const gallery = await prisma.gallery.findUnique({
      where: { id: galleryId },
      include: {
        tenant: true,
        client: true,
        property: true,
        agent: true,
      }
    });

    if (!gallery) {
      console.log(`[DEBUG] Gallery ${galleryId} not found`);
      return;
    }

    const toEmail = gallery.deliveryEmail || (gallery as any).otcEmail || gallery.client?.email;
    const recipientName = (gallery as any).otcName || gallery.client?.name || "there";
    if (!toEmail) {
      console.log(`[DEBUG] Gallery ${gallery.id} has no recipient email (client/otc/deliveryEmail missing)`);
      return;
    }

    console.log(`[DEBUG] Sending gallery notification to ${toEmail}`);
    if (gallery.agent?.email) {
      console.log(`[DEBUG] CC'ing Lead Agent: ${gallery.agent.email}`);
    }

    const brandColor = gallery.tenant.brandColor || "#10b981";
    const bannerUrl = gallery.bannerImageUrl ? formatDropboxUrl(gallery.bannerImageUrl) : null;
    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL}/gallery/${gallery.id}`;

    const html = this.getBaseTemplate(`
      <h1>Gallery Ready</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Hi ${recipientName}, your gallery for <strong>${gallery.property.name}</strong> is now ready for viewing and download.</p>
      
      <div class="divider"></div>

      ${bannerUrl ? `
        <div style="margin-bottom: 32px; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <img src="${bannerUrl}" style="width: 100%; height: auto; display: block;" alt="${gallery.title}">
        </div>
      ` : ""}

      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Project Name</span>
          <span class="detail-value">${gallery.property.name}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Delivery Status</span>
          <span class="detail-value" style="color: ${brandColor};">Delivered</span>
        </div>
      </div>

      ${gallery.deliveryNotes ? `
        <div style="background: #f8fafc; border-left: 4px solid ${brandColor}; padding: 24px; border-radius: 0 16px 16px 0; margin-bottom: 32px;">
          <span style="font-size: 10px; font-weight: 800; color: ${brandColor}; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 8px;">A Note from the Team</span>
          <p style="margin: 0; font-size: 14px; font-weight: 500; color: #334155; line-height: 1.6;">${gallery.deliveryNotes}</p>
        </div>
      ` : ""}

      <div class="divider"></div>
      
      <div style="text-align: center;">
        <a href="${publicUrl}" class="button" style="padding: 18px 48px; font-size: 14px;">Open Public Gallery</a>
      </div>
    `, gallery.tenant, "Gallery Delivered");

    await emailService.sendEmail({
      tenantId: gallery.tenantId,
      to: toEmail,
      subject: `Ready: ${gallery.property.name}`,
      html
    });

    // Also notify the Lead Agent if they have a separate email
    if (gallery.agent?.email && gallery.agent.email !== toEmail) {
      await emailService.sendEmail({
        tenantId: gallery.tenantId,
        to: gallery.agent.email,
        subject: `Ready: ${gallery.property.name} (CC)`,
        html
      });
    }
  }

  // 8. Team Member Assignment Notification
  async sendBookingAssignmentNotification(bookingId: string, teamMemberId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tenant: true,
        client: true,
        property: true,
        services: { include: { service: true } }
      }
    });

    const member = await prisma.teamMember.findUnique({
      where: { id: teamMemberId }
    });

    if (!booking || !member || !member.email) return;

    const html = this.getBaseTemplate(`
      <h1>New Assignment</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Hi ${member.displayName}, you have been assigned to a new shoot.</p>
      
      <div class="divider"></div>

      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Date</span>
          <span class="detail-value">${format(new Date(booking.startAt), "PPPP")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Time</span>
          <span class="detail-value">${format(new Date(booking.startAt), "p")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Location</span>
          <span class="detail-value">${booking.property?.name || booking.title}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Access Status</span>
          <span class="detail-value" style="color: ${booking.tenant.brandColor || "#10b981"}; font-weight: 700;">${booking.propertyStatus || "TBC"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Client</span>
          <span class="detail-value">${booking.client?.businessName || booking.client?.name || "Client"}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Services</span>
          <span class="detail-value">${booking.services.map(s => s.service.name).join(", ")}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Instructions</span>
          <span class="detail-value">${booking.internalNotes || "None provided"}</span>
        </div>
      </div>

      <div class="divider"></div>
      
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/tenant/calendar" class="button">View in Calendar</a>
    `, booking.tenant, "Assignment");

    await emailService.sendEmail({
      tenantId: booking.tenantId,
      to: member.email,
      subject: `New Shoot Assignment: ${booking.property?.name || booking.title}`,
      html
    });
  }

  // 10. Newsletter Broadcast
  async sendNewsletterBroadcast(tenantId: string, template: any, recipientIds: string[]) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return;

    const clients = await prisma.client.findMany({
      where: { id: { in: recipientIds }, tenantId },
      select: { id: true, email: true, name: true, businessName: true }
    });

    for (const client of clients) {
      if (!client.email) continue;

      const data = {
        "@user_name": client.name,
        "@studio_name": tenant.name,
      };

      const contentHtml = this.blocksToHtml(template.blocks, data);
      const html = this.getBaseTemplate(contentHtml, tenant, "Announcement");

      // Production Headers for Newsletters (High Deliverability)
      const headers = {
        "List-Unsubscribe": `<${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe/${client.id}>`,
        "Precedence": "bulk",
        "X-Auto-Response-Suppress": "OOF, AutoReply",
        "Feedback-ID": `${tenantId}:newsletter:studiio`
      };

      await emailService.sendEmail({
        tenantId,
        to: client.email,
        subject: template.subject.replaceAll("@studio_name", tenant.name),
        html,
        headers
      });
    }
  }

  // 11. Booking Reminder
  async sendBookingReminder(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tenant: true,
        client: true,
        property: true,
      }
    });

    if (!booking || !booking.client?.email) return;

    const settings = (booking.tenant.settings as any) || {};
    const template = settings.reminderTemplate;

    if (!template || !template.enabled) return;

    const data = {
      "@user_name": booking.client?.name || "Client",
      "@date": format(new Date(booking.startAt), "PPPP"),
      "@time": format(new Date(booking.startAt), "p"),
      "@location": booking.property?.name || booking.title,
      "@studio_name": booking.tenant.name,
    };

    const contentHtml = this.blocksToHtml(template.blocks, data);
    const html = this.getBaseTemplate(contentHtml, booking.tenant, "Booking Reminder");

    // Transactional Headers for Reminders
    const headers = {
      "Precedence": "transactional",
      "X-Entity-Ref-ID": `reminder-${bookingId}`,
    };

    await emailService.sendEmail({
      tenantId: booking.tenantId,
      to: booking.client?.email || "",
      subject: template.subject
        .replaceAll("@studio_name", booking.tenant.name)
        .replaceAll("@location", booking.property?.name || booking.title)
        .replaceAll("@date", format(new Date(booking.startAt), "PPP")),
      html,
      headers
    });
  }

  // 12. Send OTP
  async sendOTP(email: string, otp: string, tenantId: string | "MASTER") {
    let tenant: any = {
      name: "Studiio Master Admin",
      brandColor: "#10b981",
      logoUrl: "https://studiio.au/logo-dark.png"
    };

    if (tenantId !== "MASTER") {
      const dbTenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
      });
      if (dbTenant) tenant = dbTenant;
    }

    const html = this.getBaseTemplate(`
      <h1>Verification Code</h1>
      <p style="color: #64748b; font-size: 16px; margin-top: 8px;">Use the code below to sign in to your ${tenant.name} account.</p>
      
      <div style="background: #f8fafc; border-radius: 16px; padding: 32px; text-align: center; margin: 32px 0;">
        <span style="font-size: 48px; font-weight: 900; letter-spacing: 0.2em; color: #0f172a;">${otp}</span>
      </div>

      <p style="font-size: 13px; color: #94a3b8; text-align: center;">This code will expire in 10 minutes. If you didn't request this code, you can safely ignore this email.</p>
    `, tenant, "Login Security");

    await emailService.sendEmail({
      tenantId: tenantId === "MASTER" ? "MASTER" : tenantId, // Use a dummy tenantId for Master
      to: email,
      subject: `Your ${tenant.name} login code`,
      html
    });
  }
}

export const notificationService = NotificationService.getInstance();

