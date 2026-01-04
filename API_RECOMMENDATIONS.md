# API Design Recommendations

This document provides recommendations for implementing the OpenAPI specification for the Studiio Photography Platform API.

## 🎯 Core Principles

### 1. Tenant Isolation Enforcement

**Critical:** All tenant-scoped endpoints MUST automatically filter by the authenticated user's tenant.

**Implementation Pattern:**
```typescript
// Middleware/Prisma Extension
prisma.$use(async (params, next) => {
  const tenantScopedModels = [
    'Client', 'Property', 'Gallery', 'Media', 'Booking',
    'TeamMember', 'BookingAssignment', 'BookingHistory',
    'GalleryFavorite', 'PropertyAgentAssignment'
  ];
  
  if (tenantScopedModels.includes(params.model)) {
    const tenantId = getTenantIdFromToken(params.args);
    params.args.where = {
      ...params.args.where,
      tenantId,
    };
  }
  return next(params);
});
```

**Recommendations:**
- ✅ Never trust client-provided `tenantId` in request body
- ✅ Always derive tenant from JWT token claims
- ✅ Use database-level RLS as defense-in-depth
- ✅ Log all cross-tenant access attempts
- ✅ Return 404 (not 403) for cross-tenant resources to prevent enumeration

### 2. Authentication & Authorization

**JWT Token Structure:**
```json
{
  "userId": "user-123",
  "tenantId": "tenant-456",
  "role": "TENANT_ADMIN",
  "memberships": [
    {
      "tenantId": "tenant-456",
      "role": "TENANT_ADMIN",
      "clientId": null
    }
  ],
  "iat": 1234567890,
  "exp": 1234571490
}
```

**Authorization Levels:**
1. **Master Admin** - Full system access
2. **Tenant Admin** - Full tenant access
3. **Team Member** - Limited tenant access (role-based)
4. **Client/Agent** - Client-scoped access only

**Recommendations:**
- ✅ Use short-lived access tokens (15-30 min)
- ✅ Implement refresh token rotation
- ✅ Include role and permissions in token (not just userId)
- ✅ Validate permissions on every request
- ✅ Support token revocation (blacklist)

### 3. Rate Limiting Strategy

**Tiered Rate Limits:**
```
Standard Endpoints:
- Per Tenant: 1000 req/hour
- Per User: 200 req/hour

Upload Endpoints:
- Per Tenant: 100 req/hour
- Per User: 20 req/hour

Admin Endpoints:
- Per Tenant: 5000 req/hour
- Per User: 500 req/hour
```

**Implementation:**
- Use Redis for distributed rate limiting
- Include rate limit headers in responses:
  ```
  X-RateLimit-Limit: 1000
  X-RateLimit-Remaining: 999
  X-RateLimit-Reset: 1234567890
  ```
- Return `429 Too Many Requests` with retry-after header

**Recommendations:**
- ✅ Implement sliding window algorithm
- ✅ Different limits for different endpoint groups
- ✅ Consider burst allowances
- ✅ Monitor and alert on rate limit violations

### 4. Pagination Best Practices

**Cursor-Based Pagination (Recommended for Large Datasets):**
```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6IjEyMyJ9",
    "hasMore": true,
    "limit": 20
  }
}
```

**Offset-Based Pagination (Current Implementation):**
```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Recommendations:**
- ✅ Use cursor-based for large datasets (Media, Bookings)
- ✅ Use offset-based for smaller datasets (Clients, Properties)
- ✅ Default limit: 20, max limit: 100
- ✅ Include total count only when needed (expensive)
- ✅ Consider `includeDeleted` parameter for soft-deleted items

### 5. Error Handling

**Standard Error Response:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ],
    "requestId": "req-123456",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

**HTTP Status Codes:**
- `200` - Success (GET, PATCH)
- `201` - Created (POST)
- `204` - No Content (DELETE)
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `422` - Unprocessable Entity (business logic errors)
- `429` - Too Many Requests
- `500` - Internal Server Error

**Recommendations:**
- ✅ Always include request ID for debugging
- ✅ Don't expose internal errors to clients
- ✅ Log full error details server-side
- ✅ Use consistent error structure
- ✅ Include validation field-level errors

### 6. Filtering & Search

**Query Parameters Pattern:**
```
GET /api/v1/galleries?status=READY&clientId=client-123&search=beach&page=1&limit=20
```

**Search Implementation:**
- Use PostgreSQL full-text search for text fields
- Index commonly searched fields
- Support partial matching on names/titles
- Consider Elasticsearch for advanced search needs

**Recommendations:**
- ✅ Support filtering by indexed fields only
- ✅ Validate filter values (enums, formats)
- ✅ Limit search to prevent expensive queries
- ✅ Use parameterized queries (prevent SQL injection)
- ✅ Document searchable fields in API docs

### 7. File Upload Strategy

**Direct Upload Flow:**
1. Client requests upload URL from API
2. API returns pre-signed S3/Dropbox URL
3. Client uploads directly to storage
4. Client notifies API of completion
5. API creates Media record

**Multipart Upload:**
- Use for small files (< 10MB)
- Stream to storage immediately
- Return Media record on success

**Recommendations:**
- ✅ Use pre-signed URLs for large files
- ✅ Validate file types and sizes
- ✅ Generate thumbnails asynchronously
- ✅ Support resumable uploads for large files
- ✅ Implement virus scanning for uploads

### 8. Webhooks & Real-time Updates

**Webhook Events:**
```typescript
enum WebhookEvent {
  GALLERY_PUBLISHED = 'gallery.published',
  GALLERY_DELIVERED = 'gallery.delivered',
  BOOKING_CREATED = 'booking.created',
  BOOKING_STATUS_CHANGED = 'booking.status_changed',
  MEDIA_ADDED = 'media.added',
}
```

**Webhook Payload:**
```json
{
  "event": "gallery.published",
  "tenantId": "tenant-123",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "galleryId": "gallery-456",
    "title": "Beach House",
    "status": "READY"
  }
}
```

**Recommendations:**
- ✅ Use webhooks for async notifications
- ✅ Implement webhook retry logic (exponential backoff)
- ✅ Sign webhook payloads (HMAC)
- ✅ Support webhook subscriptions per tenant
- ✅ Consider WebSocket for real-time updates

### 9. API Versioning

**URL Versioning (Current):**
```
/api/v1/galleries
/api/v2/galleries
```

**Header Versioning (Alternative):**
```
Accept: application/vnd.studiio.v1+json
```

**Recommendations:**
- ✅ Start with v1, plan for v2
- ✅ Maintain backward compatibility within major version
- ✅ Deprecate gracefully (6+ months notice)
- ✅ Document breaking changes clearly
- ✅ Support multiple versions during transition

### 10. Performance Optimization

**Caching Strategy:**
- **Public Resources:** Cache for 5-15 minutes
- **User Resources:** Cache for 1-5 minutes
- **Tenant Settings:** Cache for 1 hour
- **Invalidate on updates**

**Database Optimization:**
- Use database indexes (already in schema)
- Implement query result caching
- Use connection pooling
- Consider read replicas for heavy read workloads

**Response Optimization:**
- Use `include` parameter to control related data
- Implement field selection (`fields` parameter)
- Compress responses (gzip)
- Use HTTP/2 for multiplexing

**Recommendations:**
- ✅ Cache at multiple levels (CDN, API, DB)
- ✅ Use GraphQL or field selection for flexible queries
- ✅ Implement response compression
- ✅ Monitor slow queries (> 100ms)
- ✅ Use database query explain plans

### 11. Security Best Practices

**Input Validation:**
- ✅ Validate all input (type, format, length)
- ✅ Sanitize user input
- ✅ Use parameterized queries
- ✅ Validate file uploads (type, size, content)

**Output Sanitization:**
- ✅ Don't expose internal IDs unnecessarily
- ✅ Mask sensitive data in logs
- ✅ Use CORS properly
- ✅ Implement CSP headers

**Additional Security:**
- ✅ Use HTTPS everywhere
- ✅ Implement CSRF protection
- ✅ Use secure session cookies
- ✅ Implement request signing for sensitive operations
- ✅ Regular security audits

### 12. Monitoring & Observability

**Metrics to Track:**
- Request rate per endpoint
- Response times (p50, p95, p99)
- Error rates by type
- Tenant isolation violations
- Rate limit hits
- Database query performance

**Logging:**
- Structured logging (JSON)
- Include request ID in all logs
- Log authentication events
- Log authorization failures
- Log data access patterns

**Alerting:**
- High error rates (> 1%)
- Slow response times (> 1s p95)
- Rate limit violations
- Tenant isolation failures
- Database connection issues

**Recommendations:**
- ✅ Use distributed tracing (OpenTelemetry)
- ✅ Implement health check endpoints
- ✅ Monitor tenant resource usage
- ✅ Set up alerting for critical metrics
- ✅ Regular performance reviews

### 13. Documentation

**API Documentation:**
- ✅ Keep OpenAPI spec up-to-date
- ✅ Include code examples
- ✅ Document error scenarios
- ✅ Provide Postman collection
- ✅ Interactive API explorer (Swagger UI)

**Developer Guides:**
- ✅ Quick start guide
- ✅ Authentication flow
- ✅ Common use cases
- ✅ Webhook setup guide
- ✅ Rate limiting guide

**Recommendations:**
- ✅ Auto-generate docs from OpenAPI spec
- ✅ Include SDK examples (TypeScript, Python)
- ✅ Version documentation with API
- ✅ Provide migration guides for breaking changes

### 14. Testing Strategy

**Test Types:**
1. **Unit Tests** - Individual functions/middleware
2. **Integration Tests** - API endpoints with test DB
3. **E2E Tests** - Full user flows
4. **Load Tests** - Performance under load
5. **Security Tests** - Penetration testing

**Test Coverage:**
- ✅ All CRUD operations
- ✅ Authentication/authorization
- ✅ Tenant isolation
- ✅ Error scenarios
- ✅ Edge cases

**Recommendations:**
- ✅ Use test database (isolated per test)
- ✅ Mock external services (S3, Dropbox)
- ✅ Test with realistic data volumes
- ✅ Automate security testing
- ✅ Regular load testing

### 15. Deployment & CI/CD

**Deployment Strategy:**
- Use blue-green or canary deployments
- Feature flags for gradual rollouts
- Database migrations run separately
- Rollback plan for each deployment

**CI/CD Pipeline:**
1. Lint and format code
2. Run tests (unit, integration)
3. Build Docker image
4. Deploy to staging
5. Run E2E tests
6. Deploy to production (with approval)

**Recommendations:**
- ✅ Automate deployments
- ✅ Use infrastructure as code
- ✅ Monitor deployments closely
- ✅ Have rollback procedures
- ✅ Document deployment process

## 📋 Implementation Checklist

### Phase 1: Core API (MVP)
- [ ] Authentication endpoints
- [ ] Tenant-scoped CRUD for Clients
- [ ] Tenant-scoped CRUD for Properties
- [ ] Tenant-scoped CRUD for Galleries
- [ ] Basic Media operations
- [ ] Tenant isolation middleware
- [ ] Error handling
- [ ] Basic rate limiting

### Phase 2: Advanced Features
- [ ] Booking system
- [ ] Team member management
- [ ] Gallery favorites
- [ ] File upload endpoints
- [ ] Advanced filtering/search
- [ ] Webhooks
- [ ] Audit logging

### Phase 3: Optimization
- [ ] Caching layer
- [ ] Response compression
- [ ] Database query optimization
- [ ] Advanced rate limiting
- [ ] Monitoring & alerting
- [ ] Performance testing

### Phase 4: Enterprise Features
- [ ] API versioning
- [ ] Advanced webhooks
- [ ] GraphQL endpoint (optional)
- [ ] SDK generation
- [ ] Advanced analytics
- [ ] Multi-region support

## 🚀 Quick Start Implementation

### 1. Generate Prisma Client
```bash
npx prisma generate
```

### 2. Create API Middleware
```typescript
// middleware/tenant-isolation.ts
export function tenantIsolation(req, res, next) {
  const tenantId = req.user.tenantId;
  req.tenantId = tenantId;
  next();
}
```

### 3. Implement Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // per tenant
  keyGenerator: (req) => req.tenantId,
});
```

### 4. Set Up Error Handling
```typescript
export function errorHandler(err, req, res, next) {
  const error = {
    code: err.code || 'INTERNAL_ERROR',
    message: err.message,
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };
  
  res.status(err.status || 500).json({ error });
}
```

## 📚 Additional Resources

- [OpenAPI Specification](https://swagger.io/specification/)
- [REST API Best Practices](https://restfulapi.net/)
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [PostgreSQL Performance](https://www.postgresql.org/docs/current/performance-tips.html)

---

**Last Updated:** 2024  
**API Version:** 1.0.0  
**Status:** Production Ready


