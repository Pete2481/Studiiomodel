import { test, expect } from '@playwright/test';

/**
 * THE BEAST TEST SUITE - PHASE 2: BRUTE FORCE & CHAOS
 */

test.describe('Brute Force & Chaos Attacks', () => {

  test('Attack: ID Harvesting (Brute Force)', async ({ page }) => {
    // Malicious script trying to guess sequential IDs for galleries
    // If our UUID/CUID system and Tenant Guard is working, they should ALL fail.
    const fakeIds = ['123', '999', 'admin', 'root', '../../etc/passwd'];
    
    for (const id of fakeIds) {
      const response = await page.goto(`/gallery/${id}`);
      // We expect either a 404 (Not Found) or a redirect to login, but NEVER a 200 with data
      expect(response?.status()).not.toBe(200);
    }
  });

  test('Attack: Mass Request Flood', async ({ request }) => {
    // Simulating a "Bot" trying to create 50 galleries in 1 second
    const promises = Array.from({ length: 20 }).map(() => 
      request.post('/api/actions/gallery', {
        data: { title: "Spam Gallery", clientId: "spam" }
      })
    );

    const responses = await Promise.all(promises);
    
    // We expect the server to catch these via our enforceSubscription() guard
    for (const res of responses) {
      const body = await res.json().catch(() => ({}));
      // Either unauthorized (no session) or Locked (no subscription)
      expect([401, 403, 200]).toContain(res.status()); 
      if (res.status() === 200) {
        expect(body.success).toBe(false); // Should return success: false from the action
      }
    }
  });

  test('Attack: Script Injection Attempt', async ({ request }) => {
    // Trying to inject a script tag into a gallery title
    const response = await request.post('/api/actions/gallery', {
      data: { 
        title: "<script>alert('hacked')</script>", 
        clientId: "victim-client" 
      }
    });

    // The server should ideally reject this or at least our guard should block it
    const body = await response.json().catch(() => ({}));
    expect(body.success).toBe(false);
  });
});

