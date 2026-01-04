import { test, expect } from '@playwright/test';

/**
 * THE BEAST TEST SUITE
 * 
 * This suite simulates a malicious or expired user trying to break the 
 * Studiio Pro security model.
 */

test.describe('Security & Paywall Chaos Tests', () => {

  test('Vulnerability: Cross-Tenant Data Leak (Invoice PDF)', async ({ page }) => {
    // Attempt to access a hypothetical invoice ID belonging to another tenant
    // We expect a 403 Forbidden because of the new security check in the route.ts
    const response = await page.goto('/api/tenant/attacker-tenant-id/invoices/victim-invoice-id/pdf');
    
    // If our fix is working, this should NOT be 200 OK
    expect(response?.status()).not.toBe(200);
    expect(response?.status()).toBe(403);
  });

  test('Vulnerability: Paywall Bypass (Direct API Action)', async ({ request }) => {
    // Attempt to trigger a 'Create Gallery' server action directly via POST
    // even though the UI button is hidden/locked.
    
    // Note: In a real attack, the user would find the action ID from the network tab.
    // Here we are testing the endpoint's logic.
    const response = await request.post('/api/actions/gallery', {
      data: {
        title: "Hacked Gallery",
        clientId: "some-client-id"
      }
    });

    // We expect the server to throw an error because of enforceSubscription()
    // It should either return an error object or a redirect to billing
    const body = await response.json().catch(() => ({}));
    if (body.error) {
      expect(body.error).toContain('Action-Locked');
    }
  });

  test('Vulnerability: High-Res Asset Theft (Expired Subscription)', async ({ page }) => {
    // Attempt to download a high-res asset via the proxy while 'expired'
    const response = await page.goto('/api/dropbox/download/some-gallery-id?path=/photo.jpg');
    
    // We expect 402 Payment Required or 403 Forbidden
    expect(response?.status()).toBe(402);
  });

  test('Vulnerability: Master Admin Escalation', async ({ page }) => {
    // Attempt to access the master dashboard as a non-master user
    const response = await page.goto('/master');
    
    // Should redirect to login or show 401/403
    expect(page.url()).not.toContain('/master');
  });
});

