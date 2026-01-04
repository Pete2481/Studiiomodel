# Schema Assessment: Multi-Tenant SaaS Photography Platform

## Executive Summary

Your schema demonstrates **good foundational design** with proper tenant relationships, but has **critical gaps in tenant isolation** and **scalability optimizations** that must be addressed before production scale.

**Overall Grade: B-**
- ✅ Strong: Relationship modeling, cascade deletes, enum usage
- ⚠️ Moderate: Some tenant isolation gaps, missing indexes
- ❌ Critical: Missing tenantId on several models, no RLS, JSON performance concerns

---

## 1. TENANT ISOLATION ASSESSMENT

### ✅ **Strengths**

1. **Core tenant-scoped models properly isolated:**
   - `Tenant`, `Client`, `Property`, `Gallery`, `Booking` all have `tenantId`
   - Foreign keys with `onDelete: Cascade` ensure data cleanup
   - Composite unique constraints prevent cross-tenant conflicts (`@@unique([tenantId, slug])`)

2. **TenantMembership model well-designed:**
   - Proper junction table with role-based access
   - Supports client-scoped memberships (`clientId`)
   - Unique constraint prevents duplicate memberships

### ❌ **CRITICAL ISSUES**

#### **Issue 1: Missing `tenantId` on Child Models**

**Problem:** Several models lack direct `tenantId` fields, forcing joins to determine tenant scope:

```prisma
model Media {
  id           String        @id @default(cuid())
  galleryId    String        // ❌ No tenantId - must join Gallery
  // ...
}

model GalleryFavorite {
  id        String   @id @default(cuid())
  galleryId String   // ❌ No tenantId - must join Gallery
  // ...
}

model BookingHistory {
  id        String        @id @default(cuid())
  bookingId String        // ❌ No tenantId - must join Booking
  // ...
}

model BookingAssignment {
  id           String         @id @default(cuid())
  bookingId    String         // ❌ No tenantId - must join Booking
  teamMemberId String         // ❌ No tenantId - must join TeamMember
  // ...
}
```

**Impact:**
- **Performance:** Every tenant-scoped query requires joins
- **Security Risk:** Harder to enforce tenant isolation at query level
- **Scalability:** Joins become expensive at scale (millions of records)

**Recommendation:** Add `tenantId` to all child models:

```prisma
model Media {
  id           String        @id @default(cuid())
  tenantId     String        // ✅ Add this
  galleryId    String
  // ...
  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, galleryId])
}

model GalleryFavorite {
  id        String   @id @default(cuid())
  tenantId  String   // ✅ Add this
  galleryId String
  // ...
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, galleryId])
}

model BookingHistory {
  id        String        @id @default(cuid())
  tenantId  String        // ✅ Add this
  bookingId String
  // ...
  tenant    Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, bookingId])
}

model BookingAssignment {
  id           String         @id @default(cuid())
  tenantId     String         // ✅ Add this
  bookingId    String
  teamMemberId String
  // ...
  tenant       Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, bookingId])
  @@unique([tenantId, bookingId, teamMemberId])
}
```

#### **Issue 2: No Database-Level Row-Level Security (RLS)**

**Problem:** Schema relies entirely on application-level tenant checks. A single bug could expose cross-tenant data.

**Impact:**
- **Security:** No defense-in-depth
- **Compliance:** May not meet enterprise security requirements
- **Audit:** Harder to prove tenant isolation

**Recommendation:** Implement PostgreSQL RLS policies:

```sql
-- Example RLS policy (to be added via migrations)
ALTER TABLE "Gallery" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_gallery ON "Gallery"
  USING (tenant_id = current_setting('app.current_tenant_id')::text);
```

**Note:** Requires application to set `app.current_tenant_id` session variable on each connection.

#### **Issue 3: Missing Tenant Indexes**

**Problem:** Many models lack indexes on `tenantId`, causing full table scans.

**Current State:**
- ✅ `TenantMembership`: Has `@@index([tenantId, role])`
- ❌ `Client`: No index on `tenantId` alone
- ❌ `Property`: No index on `tenantId` alone (only composite)
- ❌ `Gallery`: No index on `tenantId`
- ❌ `Booking`: No index on `tenantId`
- ❌ `TeamMember`: No index on `tenantId`

**Recommendation:** Add tenant indexes to all tenant-scoped models:

```prisma
model Client {
  // ...
  @@index([tenantId])  // ✅ Add this
  @@unique([tenantId, slug])
}

model Property {
  // ...
  @@index([tenantId])  // ✅ Add this
  @@index([tenantId, clientId])
  @@unique([tenantId, slug])
}

model Gallery {
  // ...
  @@index([tenantId])  // ✅ Add this
  @@index([tenantId, clientId])
  @@index([tenantId, propertyId])
}

model Booking {
  // ...
  @@index([tenantId])  // ✅ Add this
  @@index([tenantId, clientId])
  @@index([tenantId, status])
}
```

---

## 2. SCALABILITY ASSESSMENT

### ✅ **Strengths**

1. **CUID usage:** Better than UUID for index performance (sequential)
2. **Cascade deletes:** Prevents orphaned records
3. **Composite unique constraints:** Prevents data duplication

### ⚠️ **CONCERNS**

#### **Issue 1: JSON Fields Without Indexing Strategy**

**Problem:** Multiple `Json` fields (`metadata`, `settings`, `permissions`) cannot be efficiently indexed.

**Affected Models:**
- `Tenant.settings`
- `Client.settings`
- `Property.metadata`
- `Gallery.metadata`
- `Media.metadata`
- `TeamMember.permissions`
- `TenantMembership.permissions`
- `Booking.metadata`

**Impact:**
- **Query Performance:** Filtering/searching JSON fields requires full table scans
- **Storage:** JSON fields can bloat table size
- **Maintenance:** Schema changes harder to track

**Recommendations:**

1. **Extract frequently queried fields:**
   ```prisma
   model Gallery {
     // Instead of metadata: Json
     publishAt     DateTime?  // Extract from metadata
     deliveryEmail String?    // Extract from metadata
     // Keep metadata for rarely-queried data
     metadata      Json       @default("{}")
   }
   ```

2. **Use PostgreSQL JSONB indexes** (via migrations):
   ```sql
   CREATE INDEX idx_gallery_metadata_status ON "Gallery" 
   USING GIN ((metadata->>'status'));
   ```

3. **Consider separate tables** for complex nested data:
   ```prisma
   model GalleryMetadata {
     id        String   @id @default(cuid())
     galleryId String   @unique
     // Extract commonly queried fields here
   }
   ```

#### **Issue 2: Missing Composite Indexes for Common Query Patterns**

**Problem:** Likely query patterns lack optimized indexes.

**Missing Indexes:**

```prisma
// Common: "Get all galleries for a tenant, filtered by status"
model Gallery {
  @@index([tenantId, status])  // ❌ Missing
}

// Common: "Get bookings for a tenant, filtered by date range"
model Booking {
  @@index([tenantId, startAt])  // ❌ Missing
}

// Common: "Get media for a gallery, ordered by creation"
model Media {
  @@index([galleryId, createdAt])  // ❌ Missing
}

// Common: "Get team members for a tenant, filtered by role"
model TeamMember {
  @@index([tenantId, role])  // ❌ Missing
}
```

#### **Issue 3: No Soft Delete Pattern**

**Problem:** Hard deletes via cascade can cause data loss and audit issues.

**Impact:**
- **Compliance:** May violate data retention requirements
- **Recovery:** Cannot restore accidentally deleted records
- **Audit:** No history of deletions

**Recommendation:** Add soft delete pattern:

```prisma
model Gallery {
  // ...
  deletedAt   DateTime?  // ✅ Add soft delete
  tenant      Tenant     @relation(fields: [tenantId], references: [id], onDelete: Restrict)  // Change cascade
  
  @@index([tenantId, deletedAt])  // For filtering active records
}
```

**Note:** Requires changing `onDelete: Cascade` to `onDelete: Restrict` and handling soft deletes in application code.

#### **Issue 4: Media URL Storage**

**Problem:** `Media.url` stored as `String` - could be very long (S3/Dropbox URLs).

**Impact:**
- **Storage:** Long URLs consume more space
- **Performance:** Indexing long strings is inefficient

**Recommendation:** Consider normalizing:

```prisma
model Media {
  id           String        @id @default(cuid())
  galleryId    String
  provider     MediaProvider @default(DROPBOX)
  providerId   String        // ✅ Store provider-specific ID instead of full URL
  url          String        // Keep for backward compatibility
  // ...
  
  @@index([provider, providerId])  // More efficient than indexing URLs
}
```

---

## 3. MAINTAINABILITY ASSESSMENT

### ✅ **Strengths**

1. **Clear naming conventions:** Consistent, descriptive names
2. **Well-structured relationships:** Proper foreign keys and relations
3. **Enum usage:** Type-safe status/role fields
4. **Timestamps:** `createdAt`/`updatedAt` on most models

### ⚠️ **CONCERNS**

#### **Issue 1: Inconsistent Nullability**

**Problem:** Some fields are nullable when they shouldn't be (or vice versa).

**Examples:**
- `User.email` is `String?` but has `@unique` - should be required for non-master admins
- `Client.email` and `Client.phone` are optional - consider if business requires
- `Property.addressLine1` is optional - might want to require for bookings

**Recommendation:** Review business requirements and make fields required where appropriate.

#### **Issue 2: Missing Validation Constraints**

**Problem:** No length limits, format validation, or check constraints.

**Examples:**
- `Tenant.slug` - should enforce format (lowercase, alphanumeric, hyphens)
- `Property.postcode` - should enforce format per country
- `Media.url` - should validate URL format

**Recommendation:** Add Prisma validation or database constraints:

```prisma
model Tenant {
  slug  String  @db.VarChar(100)  // Limit length
  // Add format validation in application layer
}
```

#### **Issue 3: Missing Audit Fields**

**Problem:** No `createdBy`/`updatedBy` fields for audit trails.

**Impact:**
- **Compliance:** Cannot track who created/modified records
- **Debugging:** Harder to trace data changes

**Recommendation:** Add audit fields:

```prisma
model Gallery {
  // ...
  createdBy   String?
  updatedBy   String?
  createdByUser User?  @relation("GalleryCreatedBy", fields: [createdBy], references: [id])
  updatedByUser User?  @relation("GalleryUpdatedBy", fields: [updatedBy], references: [id])
}
```

---

## 4. CODE STABILITY ASSESSMENT

### ✅ **Strengths**

1. **Type safety:** Prisma generates TypeScript types
2. **Migration support:** Prisma migrations handle schema changes
3. **Enum types:** Prevents invalid values

### ❌ **ISSUES**

#### **Issue 1: Potential Data Integrity Gaps**

**Problem:** Some relationships lack proper constraints.

**Example:**
```prisma
model BookingAssignment {
  bookingId    String
  teamMemberId String
  // ❌ No check that teamMember.tenantId matches booking.tenantId
}
```

**Impact:** Could create assignments across tenants if application logic fails.

**Recommendation:** Add database check constraints (via migrations):

```sql
ALTER TABLE "BookingAssignment" 
ADD CONSTRAINT check_tenant_match 
CHECK (
  (SELECT tenant_id FROM "Booking" WHERE id = booking_id) = 
  (SELECT tenant_id FROM "TeamMember" WHERE id = team_member_id)
);
```

#### **Issue 2: Missing Required Fields**

**Problem:** Some business-critical fields are optional.

**Examples:**
- `Booking.timezone` has default but should probably be required
- `Gallery.deliveryEmail` is optional - might want to require for DELIVERED status

**Recommendation:** Review business logic and make fields required where appropriate.

#### **Issue 3: No Versioning Strategy**

**Problem:** Schema changes could break existing data.

**Impact:**
- **Migrations:** Risky to change enum values or field types
- **Backward compatibility:** Hard to rollback schema changes

**Recommendation:** 
- Use Prisma migrations with careful review
- Consider feature flags for schema changes
- Maintain migration rollback scripts

---

## 5. PRIORITY RECOMMENDATIONS

### 🔴 **CRITICAL (Do Before Production)**

1. **Add `tenantId` to all child models** (`Media`, `GalleryFavorite`, `BookingHistory`, `BookingAssignment`)
2. **Add indexes on `tenantId`** for all tenant-scoped models
3. **Add composite indexes** for common query patterns
4. **Implement RLS policies** or at minimum, add application-level tenant checks middleware

### 🟡 **HIGH PRIORITY (Do Soon)**

5. **Extract frequently-queried fields from JSON** (`metadata`, `settings`)
6. **Add soft delete pattern** for critical models
7. **Add audit fields** (`createdBy`, `updatedBy`)
8. **Add database check constraints** for cross-tenant integrity

### 🟢 **MEDIUM PRIORITY (Plan For)**

9. **Normalize Media URLs** (store provider IDs separately)
10. **Add validation constraints** (length limits, formats)
11. **Review nullability** of business-critical fields
12. **Consider versioning strategy** for schema changes

---

## 6. EXAMPLE: FIXED SCHEMA SECTIONS

Here's how key models should look after fixes:

```prisma
model Media {
  id           String        @id @default(cuid())
  tenantId     String        // ✅ Added
  galleryId    String
  type         MediaType     @default(IMAGE)
  provider     MediaProvider @default(DROPBOX)
  url          String
  thumbnailUrl String?
  metadata     Json          @default("{}")
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt  // ✅ Added
  gallery      Gallery       @relation(fields: [galleryId], references: [id], onDelete: Cascade)
  tenant       Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([tenantId, galleryId])
  @@index([galleryId, createdAt])
}

model Gallery {
  id            String            @id @default(cuid())
  tenantId      String
  clientId      String
  propertyId    String
  title         String
  status        GalleryStatus     @default(DRAFT)
  publishAt     DateTime?
  deliveredAt   DateTime?
  deliveryEmail String?
  deliveryNotes String?
  metadata      Json              @default("{}")
  deletedAt     DateTime?         // ✅ Soft delete
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  createdBy     String?           // ✅ Audit
  updatedBy     String?           // ✅ Audit
  client        Client            @relation(fields: [clientId], references: [id], onDelete: Cascade)
  property      Property          @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  tenant        Tenant            @relation(fields: [tenantId], references: [id], onDelete: Restrict)  // ✅ Changed
  media         Media[]
  editors       TeamMember[]      @relation("GalleryEditors")
  favorites     GalleryFavorite[]
  createdByUser User?             @relation("GalleryCreatedBy", fields: [createdBy], references: [id])
  updatedByUser User?             @relation("GalleryUpdatedBy", fields: [updatedBy], references: [id])
  
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, clientId])
  @@index([tenantId, propertyId])
  @@index([tenantId, deletedAt])
}
```

---

## 7. TESTING RECOMMENDATIONS

To ensure tenant isolation works correctly:

1. **Unit Tests:** Verify all queries include `tenantId` filter
2. **Integration Tests:** Test cross-tenant data access attempts fail
3. **Load Tests:** Verify index performance with millions of records
4. **Security Tests:** Attempt SQL injection to access other tenants' data

---

## Conclusion

Your schema has a **solid foundation** but needs **critical tenant isolation improvements** before production. The missing `tenantId` fields and indexes are the highest priority fixes. Once addressed, this schema can scale to handle massive multi-tenant workloads.

**Estimated effort to fix critical issues:** 2-3 days
**Estimated effort for all recommendations:** 1-2 weeks


