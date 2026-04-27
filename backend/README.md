# Backend (Express + MongoDB)

This backend powers **login**, **student management**, **attendance via QR token**, and **notifications** for LibDesk.

## How the backend flows (request lifecycle)

1. **Process entry**: `server.js`
   - Loads env via `dotenv` (with `override: true` so `backend/.env` wins).
   - Connects to MongoDB using `src/config/db` → `db.js`.
   - Ensures a unique index on attendance: `(studentId, attendanceDate)` to prevent duplicates.
   - Starts Express on `PORT`.

2. **Express app**: `src/app.js`
   - `cors()` + `express.json()`
   - Mounts routes:
     - `/api/auth` → `src/routes/auth.routes.js` → `routes/auth.js`
     - `/api/students` → `src/routes/student.routes.js` → `routes/students.js`
     - `/api/attendance` → `src/routes/attendance.routes.js` → `routes/attendance.js`
     - `/api/qr` → `src/routes/qr.routes.js` (re-uses `routes/attendance.js`)
     - `/api/notifications` → `src/routes/notification.routes.js` → `routes/notifications.js`
   - `GET /health` returns `{ ok, service, db, timestamp }`.
   - Global error handler: `src/middleware/error.middleware.js`

3. **Auth / roles (JWT)**
   - Login issues an `authToken` JWT (7 days).
   - Middleware exists:
     - `src/middleware/auth.middleware.js` → `requireAuth` (reads `Authorization: Bearer <token>`)
     - `src/middleware/role.middleware.js` → `requireRole(...roles)`
   - Note: some routes (like attendance marking) verify JWT inline (not via middleware).

## Setup

### 1) Install

```bash
npm install
```

### 2) Environment variables (`backend/.env`)

Minimum:

```env
PORT=1998
MONGODB_URI=mongodb://127.0.0.1:27017/library_student_management
AUTH_JWT_SECRET=change_me
LIBRARY_ID=library-main
```

Optional:

```env
# Admin login (static admin user)
ADMIN_USERNAME=admin
ADMIN_PIN=admin@123
ADMIN_MOBILE=0000000000

# Attendance time window (server time)
ATTENDANCE_HOUR_START=7
ATTENDANCE_HOUR_END=23

# Cloudinary (required for student photo upload)
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

Mongo connection behavior:
- Uses `MONGODB_URI` (or `MONGO_URI`).
- If using `mongodb+srv://...` and DNS lookup fails, it retries with public DNS.
- Optional fallbacks:
  - `MONGODB_URI_DIRECT`
  - `MONGODB_URI_FALLBACK`

### 3) Run

```bash
npm start
```

Health check:

```bash
curl http://localhost:$PORT/health
```

## Authentication (frontend contract)

After login you must send:

```
Authorization: Bearer <authToken>
```

The JWT payload is:
- `userId`: `"admin-1"` for admin, or Mongo ObjectId string for students
- `role`: `"admin"` or `"student"`

## API

Base URL: `http://localhost:$PORT`

### Auth

#### `POST /api/auth/login`

Body:

```json
{
  "usernameOrMobile": "admin",
  "pin": "admin@123"
}
```

Returns:
- `user` object
- `authToken` (JWT, 7d)

Admin login:
- Matches `ADMIN_USERNAME` or `ADMIN_MOBILE`
- PIN matches `ADMIN_PIN` (also accepts `"admin123"`)

Student login:
- Finds `Student` by `{ username OR mobile }` and exact `pin`
- Blocks login if `isBlocked === true`

---

### Students

#### `GET /api/students`
Returns all students (latest first).

#### `POST /api/students`
Creates a student and auto-sets `expiryDate = joinDate + 30 days`.

Required fields:
- `name`, `mobile`, `username`, `pin`, `joinDate`, `feeAmount`, `feeStatus`

#### `PUT /api/students/:id`
Updates student fields. If `joinDate` changes, `expiryDate` is recalculated to +30 days.

#### `PATCH /api/students/:id/block`
Toggles block by default, or set explicitly:

```json
{ "isBlocked": true }
```

#### `DELETE /api/students/:id`
Deletes a student.

#### `POST /api/students/:id/photo` (multipart)
Uploads student photo (requires Cloudinary configured).

- Form field: `photo` (file)
- Uses Cloudinary folder `libdesk/students` and a face-crop transform.

---

### Attendance + QR token

Important rules enforced by the backend:
- Attendance is unique per student per day (enforced by Mongo unique index).
- A QR token row is considered active if `expiresAt > now`.
- Attendance marking allowed only within hour window:
  - Defaults: 00:00–23:59
  - Configure `ATTENDANCE_HOUR_START` / `ATTENDANCE_HOUR_END`.

#### `GET /api/attendance/token`
Returns active QR token (if exists), otherwise `{ token: null, generated: false }`.

#### `POST /api/attendance/token`
Creates a new QR token (valid for 30 days) or returns current.

Body:
- `{ "rotate": true }` to force new token (limited to **once per month**).

#### `GET /api/attendance?date=YYYY-MM-DD`
Lists attendance records for a date.

#### `GET /api/attendance/today`
Lists today’s attendance records.

#### `GET /api/attendance/student/:studentId?year=YYYY&month=MM`
Returns month attendance for a student as:

```json
[{ "date": "YYYY-MM-DD", "status": "present" }]
```

#### `POST /api/attendance/mark`
Marks attendance for the **currently logged-in student**.

Headers:
- `Authorization: Bearer <student authToken>`

Body:

```json
{ "token": "<scanned qr token>" }
```

Notes:
- Only `role: "student"` is allowed.
- Token scanning is normalized to handle:
  - raw token
  - JSON payload like `{ "token": "..." }`
  - URLs containing `data=...`
- If already marked today, returns `alreadyMarked: true`.
- If a legacy bad unique index exists, backend tries to self-heal and retry once.

#### `/api/qr/*`
`/api/qr` is just an alias that mounts the same attendance router (historical compatibility).

---

### Notifications

#### `GET /api/notifications?studentId=<id>`
Returns notifications from last 30 days.
- If `studentId` is provided: returns notifications where `targetId` is `"all"` or that studentId.

#### `POST /api/notifications`
Creates a notification.

Body:

```json
{
  "title": "Library closed",
  "message": "Closed on Sunday",
  "targetId": "all",
  "category": "closure"
}
```

Allowed `category` values:
- `general`, `festival`, `closure`, `hours`, `rules`, `event`

Data retention:
- Notifications auto-expire **30 days** after their `date` (Mongo TTL index).

## Data models (Mongo)

- `Student` (`src/models/Student.js`)
- `Attendance` (`src/models/Attendance.js`)
- `AttendanceQr` (`src/models/AttendanceQr.js`)
- `Notification` (`src/models/Notification.js`)

