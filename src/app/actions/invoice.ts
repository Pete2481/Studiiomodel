"use server";

import { getTenantPrisma, enforceSubscription } from "@/lib/tenant-guard";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { notificationService } from "@/server/services/notification.service";
import { addDays } from "date-fns";
import { permissionService } from "@/lib/permission-service";

export async function createInvoiceFromGallery(galleryId: string) {
  try {
    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription();

    const tPrisma = await getTenantPrisma();

    // 1. Fetch gallery with all needed relations
    const gallery = await tPrisma.gallery.findUnique({
      where: { id: galleryId },
      include: {
        client: true,
        property: true,
        services: { include: { service: true } },
        tenant: true
      }
    });

    if (!gallery) return { success: false, error: "Gallery not found." };

    // 2. Check if invoice already exists
    const existing = await tPrisma.invoice.findFirst({
      where: { galleryId, deletedAt: null }
    });
    if (existing) return { success: true, invoiceId: existing.id };

    // 3. Generate unique invoice number (e.g. #2025-001)
    const latestInvoice = await tPrisma.invoice.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { number: true }
    });

    let nextNum = 1;
    if (latestInvoice?.number) {
      const parts = latestInvoice.number.split('-');
      const lastNum = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    const year = new Date().getFullYear();
    const number = `INV-${year}-${nextNum.toString().padStart(3, '0')}`;

    // Get price overrides from client settings
    const clientSettings = (gallery.client.settings as any) || {};
    const priceOverrides = clientSettings.priceOverrides || {};

    // 4. Create the Invoice
    const dueDays = (gallery.tenant as any).invoiceDueDays ?? 7;
    const dueAt = addDays(new Date(), dueDays);

    const invoice = await (tPrisma as any).invoice.create({
      data: {
        client: { connect: { id: gallery.clientId } },
        gallery: { connect: { id: gallery.id } },
        booking: gallery.bookingId ? { connect: { id: gallery.bookingId } } : undefined,
        number,
        address: gallery.property.name,
        status: "DRAFT",
        taxRate: gallery.tenant.taxRate || 0.1,
        issuedAt: new Date(),
        dueAt,
        currency: "AUD",
        paymentTerms: gallery.tenant.accountName ? `Account Name: ${gallery.tenant.accountName}\nBSB: ${gallery.tenant.bsb || ""}  Account: ${gallery.tenant.accountNumber || ""}` : null,
        invoiceTerms: gallery.tenant.invoiceTerms,
        tenant: { connect: { id: gallery.tenantId } },
        lineItems: {
          create: gallery.services.map((gs: any) => {
            const overridePrice = priceOverrides[gs.serviceId];
            return {
              description: gs.service.name,
              unitPrice: overridePrice !== undefined ? Number(overridePrice) : gs.service.price,
              quantity: 1,
              serviceId: gs.serviceId
            };
          })
        }
      }
    });

    revalidatePath("/tenant/galleries");
    revalidatePath("/tenant/invoices");
    revalidatePath("/mobile/invoices");
    return { success: true, invoiceId: invoice.id };
  } catch (error: any) {
    console.error("AUTO-INVOICE ERROR:", error);
    return { success: false, error: error.message || "Failed to create invoice." };
  }
}

export async function createInvoiceFromEditRequests(galleryId: string) {
  try {
    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription();

    const tPrisma = await getTenantPrisma();

    // 1. Fetch gallery and its completed edit requests
    const gallery = await tPrisma.gallery.findUnique({
      where: { id: galleryId },
      include: {
        client: true,
        property: true,
        tenant: true,
        editRequests: {
          where: { status: "COMPLETED" },
          include: {
            selectedTags: {
              include: { editTag: true }
            }
          }
        }
      }
    });

    if (!gallery) return { success: false, error: "Gallery not found." };
    if (gallery.editRequests.length === 0) return { success: false, error: "No completed edit requests found for this job." };

    // 2. Generate unique invoice number
    const latestInvoice = await tPrisma.invoice.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { number: true }
    });

    let nextNum = 1;
    if (latestInvoice?.number) {
      const parts = latestInvoice.number.split('-');
      const lastNum = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    const year = new Date().getFullYear();
    const number = `INV-${year}-${nextNum.toString().padStart(3, '0')}`;

    // 3. Prepare line items from edit requests
    const lineItemsData = gallery.editRequests.flatMap(req => 
      req.selectedTags.map(st => ({
        description: `${req.title || 'Edit Request'}: ${st.editTag.name}`,
        unitPrice: st.costAtTime,
        quantity: 1,
        serviceId: null 
      }))
    );

    // 4. Create the Invoice
    const dueDays = (gallery.tenant as any).invoiceDueDays ?? 7;
    const dueAt = addDays(new Date(), dueDays);

    const invoice = await (tPrisma as any).invoice.create({
      data: {
        client: { connect: { id: gallery.clientId } },
        gallery: { connect: { id: gallery.id } },
        booking: gallery.bookingId ? { connect: { id: gallery.bookingId } } : undefined,
        number,
        address: gallery.property.name,
        status: "DRAFT",
        taxRate: gallery.tenant.taxRate || 0.1,
        issuedAt: new Date(),
        dueAt,
        currency: "AUD",
        paymentTerms: gallery.tenant.accountName ? `Account Name: ${gallery.tenant.accountName}\nBSB: ${gallery.tenant.bsb || ""}  Account: ${gallery.tenant.accountNumber || ""}` : null,
        invoiceTerms: gallery.tenant.invoiceTerms,
        tenant: { connect: { id: gallery.tenantId } },
        lineItems: {
          create: lineItemsData
        }
      }
    });

    revalidatePath("/tenant/edits");
    revalidatePath("/tenant/invoices");
    revalidatePath("/mobile/invoices");
    return { success: true, invoiceId: invoice.id };
  } catch (error: any) {
    console.error("EDIT-REQUEST-INVOICE ERROR:", error);
    return { success: false, error: error.message || "Failed to create invoice from edits." };
  }
}

export async function getNextInvoiceNumberAction() {
  try {
    const tPrisma = await getTenantPrisma();

    const latestInvoice = await tPrisma.invoice.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { number: true }
    });

    let nextNum = 1;
    if (latestInvoice?.number) {
      const parts = latestInvoice.number.split('-');
      const lastNum = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    const year = new Date().getFullYear();
    const number = `INV-${year}-${nextNum.toString().padStart(3, '0')}`;

    return { success: true, number };
  } catch (error: any) {
    console.error("GET-NEXT-NUMBER ERROR:", error);
    return { success: false, error: "Failed to generate invoice number" };
  }
}

export async function upsertInvoice(data: any) {
  try {
    // SECURITY: Prevent API-level bypass of the paywall
    await enforceSubscription();

    const tPrisma = await getTenantPrisma();

    const { 
      id, 
      lineItems, 
      issuedAt, 
      dueAt, 
      discount, 
      taxRate, 
      paidAmount, 
      ...rest 
    } = data;

    if (rest.bookingId === "") rest.bookingId = null;
    if (rest.galleryId === "") rest.galleryId = null;
    if (rest.clientId === "") rest.clientId = null;

    const issuedAtDate = issuedAt ? new Date(issuedAt) : new Date();
    const dueAtDate = dueAt ? new Date(dueAt) : new Date();

    if (id) {
      const { bookingId, galleryId, clientId, tenantId, ...updateRest } = rest;
      await (tPrisma as any).invoice.update({
        where: { id },
        data: {
          ...updateRest,
          client: clientId ? { connect: { id: clientId } } : undefined,
          booking: bookingId ? { connect: { id: bookingId } } : { disconnect: true },
          gallery: galleryId ? { connect: { id: galleryId } } : { disconnect: true },
          issuedAt: issuedAtDate,
          dueAt: dueAtDate,
          discount: Number(discount),
          taxRate: Number(taxRate),
          paidAmount: Number(paidAmount),
          sentAt: rest.status === 'SENT' ? new Date() : undefined,
          lineItems: {
            deleteMany: {}, 
            create: lineItems.map((li: any) => ({
              description: li.description,
              quantity: Number(li.quantity),
              unitPrice: Number(li.unitPrice),
              serviceId: li.serviceId || null,
            }))
          }
        }
      });

      // TRIGGER EMAIL IF STATUS IS 'SENT'
      if (rest.status === 'SENT') {
        try {
          await notificationService.sendInvoiceNotification(id);
        } catch (emailErr) {
          console.error("Failed to send invoice email:", emailErr);
        }
      }

      if ((rest.status === 'SENT' || rest.status === 'PAID') && rest.galleryId) {
        const gallery = await (tPrisma as any).gallery.findUnique({
          where: { id: rest.galleryId },
          select: { status: true }
        });
        if (gallery?.status === 'DRAFT') {
          await (tPrisma as any).gallery.update({
            where: { id: rest.galleryId },
            data: { status: 'READY' }
          });
        }
      }
    } else {
      const { bookingId, galleryId, clientId, tenantId, ...createRest } = rest;
      const newInvoice = await (tPrisma as any).invoice.create({
        data: {
          ...createRest,
          client: { connect: { id: clientId } },
          booking: bookingId ? { connect: { id: bookingId } } : undefined,
          gallery: galleryId ? { connect: { id: galleryId } } : undefined,
          issuedAt: issuedAtDate,
          dueAt: dueAtDate,
          discount: Number(discount),
          taxRate: Number(taxRate),
          paidAmount: Number(paidAmount),
          sentAt: rest.status === 'SENT' ? new Date() : undefined,
          lineItems: {
            create: lineItems.map((li: any) => ({
              description: li.description,
              quantity: Number(li.quantity),
              unitPrice: Number(li.unitPrice),
              serviceId: li.serviceId || null,
            }))
          }
        }
      });

      // TRIGGER EMAIL IF STATUS IS 'SENT'
      if (rest.status === 'SENT') {
        try {
          await notificationService.sendInvoiceNotification(newInvoice.id);
        } catch (emailErr) {
          console.error("Failed to send invoice email:", emailErr);
        }
      }

      if ((rest.status === 'SENT' || rest.status === 'PAID') && rest.galleryId) {
        await (tPrisma as any).gallery.update({
          where: { id: rest.galleryId },
          data: { status: 'READY' }
        });
      }
    }

    revalidatePath("/tenant/invoices");
    revalidatePath("/mobile/invoices");
    if (data.galleryId) {
      revalidatePath("/tenant/galleries");
      revalidatePath("/mobile/galleries");
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("UPSERT-INVOICE ERROR:", error);
    return { success: false, error: error.message || "Failed to save invoice" };
  }
}

export async function deleteInvoice(id: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    if (!permissionService.can(session.user, "manageInvoices")) {
      // For now, let's assume manageInvoices is needed for deletion
      if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "ACCOUNTS") {
        return { success: false, error: "Permission Denied: Cannot delete invoices." };
      }
    }

    const tPrisma = await getTenantPrisma();

    await (tPrisma as any).invoice.update({
      where: { id },
      data: { deletedAt: new Date() }
    });

    revalidatePath("/tenant/invoices");
    revalidatePath("/mobile/invoices");
    return { success: true };
  } catch (error: any) {
    console.error("DELETE-INVOICE ERROR:", error);
    return { success: false, error: "Failed to delete invoice" };
  }
}

export async function updateInvoiceStatus(id: string, status: string) {
  try {
    const session = await auth();
    if (!session) return { success: false, error: "Unauthorized" };

    // PERMISSION CHECK
    // Clients can't update status, only staff
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "ACCOUNTS" && session.user.role !== "TEAM_MEMBER") {
      return { success: false, error: "Permission Denied: Cannot update invoice status." };
    }

    const tPrisma = await getTenantPrisma();

    await (tPrisma as any).invoice.update({
      where: { id },
      data: { 
        status: status as any,
        sentAt: status === 'SENT' ? new Date() : undefined,
        paidAt: status === 'PAID' ? new Date() : undefined
      }
    });

    if (status === 'SENT') {
      try {
        await notificationService.sendInvoiceNotification(id);
      } catch (emailErr) {
        console.error("Failed to send invoice email:", emailErr);
      }
    }

    revalidatePath("/tenant/invoices");
    revalidatePath("/mobile/invoices");
    return { success: true };
  } catch (error: any) {
    console.error("UPDATE-INVOICE-STATUS ERROR:", error);
    return { success: false, error: "Failed to update status" };
  }
}

export async function sendInvoiceReminder(id: string) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return { success: false, error: "Unauthorized" };
    
    // PERMISSION CHECK
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "ADMIN" && session.user.role !== "ACCOUNTS") {
      return { success: false, error: "Permission Denied: Cannot send invoice reminders." };
    }

    await notificationService.sendInvoiceReminder(id);
    
    return { success: true };
  } catch (error) {
    console.error("SEND-REMINDER ERROR:", error);
    return { success: false, error: "Failed to send reminder" };
  }
}
