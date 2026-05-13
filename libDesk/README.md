# Library-student-Management


### 1) Install dependencies

```bash
npm install
npm --prefix backend install this command
```

### 2) Run frontend only (Expo)

```bash
npm run start:frontend
```

### 3) Run backend only (Express API)

```bash
npm run start:backend
```

### 4) Run both

```bash
npm run start:all
```

Backend health check:

```bash
curl http://localhost:5000/health
```

## MongoDB setup

1) Create backend env file:

cp backend/.env.example backend/.env
```

2) Update `backend/.env` with your MongoDB URI:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/library_student_management
PORT=5000
ADMIN_USERNAME=
ADMIN_PIN=
ADMIN_MOBILE=0000000000
```

3) Start backend:

```bash
npm run start:backend
```

4) (Optional for mobile device testing) set frontend API URL in root `.env`:

```env
EXPO_PUBLIC_API_URL=http://<your-local-ip>:5000
```

Student management now uses backend APIs under `/api/students` for add/edit/delete/block-unblock.
Login now uses backend API `/api/auth/login` (no hardcoded student login in frontend state).
Attendance and notifications now use backend APIs too:
- `/api/attendance/token`, `/api/attendance/today`, `/api/attendance/mark`
- `/api/notifications`

Attendance rules:
- One admin QR token (JWT) valid for 30 days
- All students scan the same QR
- One attendance per student per day
- Allowed time: 7:00 AM to 11:59 PM
- Date filter API: `/api/attendance?date=YYYY-MM-DD`
