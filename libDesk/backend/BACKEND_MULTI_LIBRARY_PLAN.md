# Backend Multi-Library SaaS Plan (No API Breaks)

This document is the **implementation plan** to convert the existing backend from a single-library system into a **multi-library SaaS** with strict tenant isolation, while **keeping the existing API structure** (extend only).

## Goals
- Introduce a `Library` tenant.
- Add `libraryId` to all tenant-owned data.
- Enforce **data isolation**: every query must filter by `libraryId` (admin exception allowed).
- Upgrade auth to 3 roles: `admin` (super admin), `library` (library owner), `student`.
- Hash all sensitive secrets (passwords + PINs) and never return them in API responses.

## Current state (baseline)
- `POST /api/auth/login` supports env-admin + DB-student login.
- Students and other entities currently have **no tenant scoping**.
- Attendance uses `LIBRARY_ID` from `.env` (must be removed).

## Phase 1 — Add Library tenant model
### 1.1 Create `Library` model
Add file: `src/models/Library.js`

Fields:
- `name` (String, required)
- `ownerName` (String, required)
- `email` (String, required, unique, lowercase, trim)
- `passwordHash` (String, required)
- `city` (String, required)
- `plan` (String enum: `free|pro`, default `free`)
- `isActive` (Boolean, default `true`)
- `timestamps`

Indexes:
- unique index on `email`

## Phase 2 — Remove hardcoded LIBRARY_ID
### 2.1 Delete LIBRARY_ID usage
- Remove `LIBRARY_ID` from `.env` expectations.
- Update attendance/QR code so library identity is always derived from:
  - `req.user.libraryId` for `library`/`student`
  - explicit `libraryId` param/body only for `admin`

## Phase 3 — Add `libraryId` to all tenant-owned models
Update these models to include:
- `libraryId: { type: ObjectId, ref: "Library", required: true, index: true }`

### 3.1 Student
File: `src/models/Student.js`
- Add `libraryId` required
- Add credentials:
  - `username` (String, required)
  - `pinHash` (String, required)
  - `isBlocked` (Boolean, default `false`)
- Keep existing fields for backward compatibility (e.g. `mobile`, `feeAmount`, etc.) unless you choose to migrate later.

Indexes (critical):
- `({ libraryId: 1, username: 1 }, { unique: true })`
- `({ libraryId: 1, mobile: 1 }, { unique: true })` (or `phone`)

### 3.2 Attendance
File: `src/models/Attendance.js`
- Add `libraryId` required

Indexes:
- Unique: `({ libraryId: 1, studentId: 1, attendanceDate: 1 }, { unique: true })`
- Query index: `({ libraryId: 1, attendanceDate: 1 })`

### 3.3 AttendanceQr
File: `src/models/AttendanceQr.js`
- Add `libraryId` required

Indexes:
- `({ libraryId: 1, expiresAt: 1 })`
- Keep token uniqueness if desired (global unique `token` is fine)

### 3.4 Notification
File: `src/models/Notification.js`
- Add `libraryId` required

Indexes:
- `({ libraryId: 1, date: 1 })`
- Keep TTL index (30 days) unchanged

## Phase 4 — Authentication upgrade (3 roles) + JWT payload
### 4.1 JWT payload format
All tokens must include:
- `userId`
- `role`
- `libraryId` (only for `library` and `student`)

### 4.2 Middleware changes
File: `src/middleware/auth.middleware.js`
- `requireAuth` should verify JWT and attach:
  - `req.user = { userId, role, libraryId }`

File: `src/middleware/role.middleware.js`
- Keep `requireRole(...roles)` but ensure it relies on `req.user.role`.

### 4.3 Admin login (env-based)
Extend existing auth route file (keep structure consistent):
- `POST /api/auth/login`:
  - If credentials match admin env → return JWT with `role: "admin"`.

Suggested env vars:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD` (replace `ADMIN_PIN` for admin password-style auth)

### 4.4 Library registration (new endpoint)
Add endpoint:
- `POST /api/auth/register-library`

Input:
- `libraryName`
- `ownerName`
- `email`
- `password`
- `city`

Logic:
- Validate required fields
- Prevent duplicate email (unique index + 409 handling)
- Hash password using `bcrypt`
- Create `Library` with:
  - `name = libraryName`
  - `plan = "free"`
  - `isActive = true`
- Return JWT token with:
  - `role: "library"`
  - `libraryId`

### 4.5 Library login (DB)
Extend:
- `POST /api/auth/login`

Logic:
- If identifier looks like email (or explicit `email` field provided), attempt library login:
  - Find Library by email
  - Check `isActive`
  - Compare password via bcrypt
  - Return JWT `{ role: "library", libraryId }`

### 4.6 Student login (username/mobile + 4-digit PIN, scoped)
Extend existing:
- `POST /api/auth/login`

Logic:
- Require `libraryId` (or a future `libraryCode`) in request for tenant scoping.
- Find student by:
  - `{ libraryId, $or: [{ username }, { mobile }] }`
- Validate PIN:
  - PIN must be 4 digits
  - Compare bcrypt hash vs `pinHash`
- Reject blocked student (`isBlocked === true`)
- Return JWT `{ role: "student", userId, libraryId }`

Response rule:
- Do NOT return `pin`, `pinHash`, `passwordHash`.

## Phase 5 — Multi-tenant data isolation (apply everywhere)
**Rule**: For ALL queries on tenant-owned collections add:
- `libraryId` filter.

Admin exception:
- If `req.user.role === "admin"` allow cross-library access, optionally accept `libraryId` filter.

Add code comment at each enforcement point:
- `// Multi-tenant data isolation applied`

Apply to routes:
- `routes/students.js`
- `routes/attendance.js`
- `routes/notifications.js`
- QR token endpoints in `routes/attendance.js` (and `/api/qr` alias)

## Phase 6 — Update students create/update (hash PIN)
File: `routes/students.js`
- Accept `username` + `pin` when creating student
- Validate:
  - `pin` must be 4 digits
  - `username` unique within `(libraryId)`
- Hash PIN before storing in `pinHash`
- Ensure all reads/writes are scoped by `libraryId` (except admin)

## Phase 7 — Attendance per-library (keep existing logic)
File: `routes/attendance.js`
- Remove `LIBRARY_ID` comparisons
- Scope QR token selection by `libraryId`
- For marking attendance:
  - verify student JWT includes `libraryId`
  - ensure scanned QR row belongs to same `libraryId`
  - ensure Attendance writes include `libraryId`
- Keep existing logic:
  - time window
  - duplicate prevention (now unique per library)
  - QR normalization/validation

## Phase 8 — Notifications per-library
File: `routes/notifications.js`
- Always filter by `libraryId`
- `targetId = "all"` means all students within that library
- Students can only see their own library notifications
- TTL remains 30 days

## Security checklist (required)
- Hash all passwords and PINs with `bcrypt`.
- Never return hashes or raw PIN/password in responses.
- Validate required fields and sanitize input (trim/lowercase where needed).
- Ensure JWT secrets are set in env (no weak defaults in production).
- Add rate-limiting suggestion as a comment (no external service required).

## Backward compatibility strategy (do not break existing API)
- Keep existing route paths:
  - `/api/auth/login`
  - `/api/students`
  - `/api/attendance/*`
  - `/api/notifications`
- Extend request bodies to accept `libraryId` (required for library/student flows).
- Allow admin to operate without `libraryId` (but can pass it optionally).

## Expected modified files (implementation)
- Add: `src/models/Library.js`
- Update: `src/models/Student.js`
- Update: `src/models/Attendance.js`
- Update: `src/models/AttendanceQr.js`
- Update: `src/models/Notification.js`
- Update: `routes/auth.js`
- Update: `routes/students.js`
- Update: `routes/attendance.js`
- Update: `routes/notifications.js`
- Update: `src/middleware/auth.middleware.js`
- (Optional) Update: `backend/README.md` to document multi-library inputs

