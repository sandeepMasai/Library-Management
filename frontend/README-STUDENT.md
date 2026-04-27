# Student Flow (Only) — libDesk

This README is **only for the Student app flow** (login → scan QR → attendance → profile).

## Run the app (Expo)

From `libDesk/frontend/`:

```bash
npm install
npx expo start
```

- Press `a` to open on Android (device/emulator).
- Make sure your phone and laptop are on the same Wi‑Fi (or use USB debugging).

## Student flow (plain)

### 1) Open the app
- Launch the app from Android.

### 2) Login as Student
- On the login screen, select **Student**
- Enter:
  - **Mobile**
  - **4‑digit PIN**

Student login screen:
- `screens/auth/LoginScreen.tsx`

### 3) Student Home
- After login, you land on Student tabs (Home/Scan/Calendar/Notifications)

Tabs setup:
- `App.tsx` → `StudentTabs()` / `StudentMainStack()`

### 4) Scan QR (mark attendance)
- Go to **Scan Attendance**
- Scan the library QR
- You’ll see the same **premium modal** (Success / Already Marked / Error)

QR screen:
- `screens/student/ScanQR.tsx`

### 5) Profile (student self‑service)
- Open **Profile**
- Actions:
  - Update photo
  - Sign out (premium modal)
  - Delete account (premium danger modal)

Profile screen:
- `screens/student/Profile.tsx`

## Student screens folder

- `screens/student/`
  - `Home.tsx`
  - `ScanQR.tsx`
  - `Profile.tsx`
  - `Notifications.tsx`
  - `CalendarScreen.tsx`

## API / Store actions used by Student flow

Student actions are called from the app store:
- `store.ts`
  - `login(...)`
  - `markAttendance(qrData)`
  - `uploadMyPhoto(uri)`
  - `deleteMyAccount()`
  - `logout()`

## UI: premium modals (no Alert.alert)

Reusable modal component:
- `components/ConfirmModal.tsx`

Student screens use it for:
- Info alerts (OK only)
- Confirm actions (Cancel + Confirm)
- Danger actions (Delete)

