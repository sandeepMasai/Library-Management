import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { addDays, differenceInDays, isSameDay, format } from 'date-fns';
import { resolveApiBaseUrl } from './constants/apiUrl';
import { prepareAttendanceQrPayload } from './utils/attendanceQr';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, apiDelete, apiGet, apiPatch, apiPost, apiPut, type ApiError } from './services/api';

export type Role = 'admin' | 'student';
export type FeeStatus = 'Paid' | 'Half Paid' | 'Pending';
export type FeeMethod = 'cash' | 'upi';
export type AuthRole = 'admin' | 'library' | 'student';

export interface User {
  id: string;
  role: AuthRole;
  name: string;
  username: string;
  mobile: string;
  /**
   * Student PIN is only provided on create/login.
   * Backend does not return PIN for security, so keep this optional.
   */
  pin?: string;
  joinDate: string;
  expiryDate: string;
  feeStatus: FeeStatus;
  feeAmount: number;
  feeMethod?: FeeMethod;
  isBlocked: boolean;
  photoUrl?: string | null;
  /**
   * Present for student role (hydrated from GET /api/student/me).
   * This prevents any cross-library mix-up in UI.
   */
  library?: { id?: string | null; libraryName?: string; logoUrl?: string | null } | null;
  /**
   * Tenant id:
   * - library role: equals library's own id
   * - student role: libraryId of the library they belong to
   * - admin role: null
   *
   * Backend may omit this in some responses, so keep optional.
   */
  libraryId?: string | null;
  // Optional library fields (present when role === 'library')
  ownerName?: string;
  email?: string;
  city?: string;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  /** No SaaS access until first paid activation (`none`). */
  plan?: 'none' | 'pro';
  /** SKU (`none` until subscribed): trial | monthly | … */
  currentPlanKey?: 'none' | 'trial' | 'monthly' | '6month' | 'yearly';
  /** Library tenants — mirrored from backend */
  isActive?: boolean;
  /** One-time trial guard */
  trialUsed?: boolean;
  planStartDate?: string | null;
  planExpiryDate?: string | null;
  subscriptionStatus?: 'inactive' | 'active' | 'cancelled' | 'expired';
  cancelledAt?: string | null;
  cancelReason?: string | null;
  cancelNote?: string | null;
  libraryCode?: string;
}

export interface Attendance {
  id: string;
  studentId: string;
  date: string; // ISO string
}

/** Library announcement type (shown to students with badge + styling) */
export type NotificationCategory =
  | 'general'
  | 'festival'
  | 'closure'
  | 'hours'
  | 'rules'
  | 'event';

export interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  targetId?: string; // 'all' or studentId
  targetType?: 'all' | 'student' | 'library';
  category?: NotificationCategory;
  /** Server: true when this user has a readReceipt (PATCH /api/notifications/:id/read). */
  readByMe?: boolean;
  /** Legacy global read flag (library inbox); still returned for compatibility. */
  isRead?: boolean;
  readAt?: string | null;
}

export interface StudentInput {
  name: string;
  username: string;
  mobile: string;
  /**
   * Required when creating a student, optional when editing.
   * UI enforces required-on-create + 4-digit validation.
   */
  pin?: string;
  joinDate?: string;
  membershipDays?: 30 | 90 | 180 | 365;
  feeStatus: FeeStatus;
  feeAmount: number;
  feeMethod?: FeeMethod;
  isBlocked: boolean;
}

export interface QrTokenInfo {
  token: string | null;
  generatedAt?: string;
  expiresAt?: string;
  created?: boolean;
  locked?: boolean;
  message?: string;
}

export type SeatStatus = 'available' | 'occupied';
export interface Seat {
  id: string;
  libraryId: string | null;
  number: number;
  spaceId?: string | null;
  status: SeatStatus;
  studentId: string | null;
}

export interface Space {
  id: string;
  libraryId: string | null;
  name: string;
  order: number;
}

export interface Shift {
  id: string;
  libraryId: string | null;
  name: string;
  type: 'morning' | 'evening' | 'full_day' | 'half_day' | 'custom';
  startTime: number; // minutes-from-midnight
  endTime: number; // minutes-from-midnight
}

export type AllocationStatus = 'active' | 'cancelled';
export interface SeatAllocation {
  id: string;
  libraryId: string | null;
  seatId: string;
  shiftId: string;
  studentId: string;
  startDate: string; // ISO
  endDate: string; // ISO
  status: AllocationStatus;
  createdAt?: string;
  updatedAt?: string;
}

interface AppState {
  currentUser: User | null;
  /**
   * Auth state flow (multi-role SaaS):
   * - On login success: set auth fields + set currentUser
   * - Persist: token/role/libraryId/libraryCode stored in storage
   * - On app load: persist middleware restores auth fields automatically
   * - UI stays compatible by continuing to use currentUser for navigation
   */
  authToken: string | null; // kept for backwards compatibility with existing code paths
  token: string | null;
  role: AuthRole | null;
  libraryId: string | null;
  libraryCode: string | null;
  users: User[];
  attendances: Attendance[];
  notifications: Notification[];
  dailyQrToken: string | null;
  lastNotifSeenAt: string | null;
  seats: Seat[];
  spaces: Space[];
  shifts: Shift[];
  allocations: SeatAllocation[];

  // Auth
  login: (
    usernameOrMobile: string,
    pinOrPassword: string,
    opts?: { libraryCode?: string; mode?: 'pin' | 'password' }
  ) => Promise<{ ok: boolean; message?: string }>;
  adminLogin: (username: string, pin: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  patchCurrentUser: (patch: Partial<User>) => void;
  fetchMyProfile: () => Promise<{ ok: boolean; message?: string }>;

  // Library - Password
  requestLibraryPasswordReset: (email: string) => Promise<{ ok: boolean; message?: string }>;
  resetLibraryPassword: (token: string, newPassword: string) => Promise<{ ok: boolean; message?: string }>;
  changeLibraryPassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; message?: string }>;

  // Helpers
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  isLibrary: () => boolean;
  isStudent: () => boolean;

  // Library - Seats
  fetchSeats: () => Promise<void>;
  assignSeat: (seatId: string, studentId: string) => Promise<{ ok: boolean; message?: string }>;
  unassignSeat: (seatId: string) => Promise<{ ok: boolean; message?: string }>;

  // Library - Spaces/Shifts/Allocations (Seat Management)
  fetchSpaces: () => Promise<void>;
  createSpace: (name: string) => Promise<{ ok: boolean; message?: string; space?: Space }>;
  fetchShifts: () => Promise<void>;
  createShift: (data: { name: string; type?: Shift['type']; startTime: number | string; endTime: number | string }) => Promise<{ ok: boolean; message?: string; shift?: Shift }>;
  fetchAllocations: (shiftId?: string, spaceId?: string) => Promise<void>;
  assignAllocation: (data: { seatId: string; studentId: string; shiftId: string; startDate: string; endDate: string }) => Promise<{ ok: boolean; message?: string; allocation?: SeatAllocation }>;
  cancelAllocation: (allocationId: string) => Promise<{ ok: boolean; message?: string }>;
  bulkCreateSeats: (totalSeats: number, spaceId?: string | null) => Promise<{ ok: boolean; message?: string }>;
  updateSeatSpace: (seatId: string, spaceId: string | null) => Promise<{ ok: boolean; message?: string }>;

  // Admin - Students
  fetchStudents: () => Promise<void>;
  fetchStudentsPage: (page: number, limit: number) => Promise<User[]>;
  addStudent: (student: StudentInput) => Promise<{ ok: boolean; message?: string; student?: User }>;
  updateStudent: (id: string, data: Partial<User>) => Promise<{ ok: boolean; message?: string }>;
  deleteStudent: (id: string) => Promise<{ ok: boolean; message?: string }>;
  toggleBlockStudent: (id: string) => Promise<{ ok: boolean; message?: string }>;
  uploadStudentPhoto: (id: string, localUri: string) => Promise<{ ok: boolean; message?: string }>;

  // Student - Profile
  uploadMyPhoto: (localUri: string) => Promise<{ ok: boolean; message?: string }>;
  deleteMyAccount: () => Promise<{ ok: boolean; message?: string }>;

  // Admin - Attendance
  generateDailyQr: (opts?: { rotate?: boolean }) => Promise<QrTokenInfo | null>;
  fetchTodayAttendance: () => Promise<void>;
  fetchAttendanceByDate: (date: string) => Promise<void>;

  // Admin - Notifications
  fetchNotifications: (studentId?: string) => Promise<void>;
  fetchNotificationsPage: (page: number, limit: number, studentId?: string) => Promise<Notification[]>;
  sendNotification: (
    title: string,
    message: string,
    targetId?: string,
    category?: NotificationCategory
  ) => Promise<{ ok: boolean; message?: string }>;
  markNotificationRead: (id: string) => Promise<{ ok: boolean }>;

  // Library - Subscription
  // Legacy (no-payment) upgrade endpoint is disabled on backend now.
  upgradeSubscription: (planKey: 'free_trial' | 'pro_monthly' | 'pro_6_month' | 'pro_yearly') => Promise<{ ok: boolean; message?: string }>;
  cancelSubscription: (data?: { reason?: string | null; note?: string | null }) => Promise<{ ok: boolean; message?: string }>;
  saveRetentionChoice: (choice: 'accept_discount' | 'continue_cancel') => Promise<{ ok: boolean; message?: string }>;

  // Student - Attendance
  fetchStudentAttendance: (studentId: string, year?: number, month?: number) => Promise<void>;
  markAttendance: (token: string) => Promise<{ ok: boolean; alreadyMarked?: boolean; message?: string }>;

  // Helpers
  getTodayAttendance: () => Attendance[];
  getStudentAttendance: (studentId: string) => Attendance[];
  getStudentNotifications: (studentId: string) => Notification[];
  markNotifsRead: () => void;
  getUnreadNotifCount: (studentId: string) => number;
}

const initialAdmin: User = {
  id: 'admin-1',
  role: 'admin',
  name: 'Admin',
  username: 'admin',
  mobile: '0000000000',
  pin: 'admin@123',
  joinDate: new Date().toISOString(),
  expiryDate: addDays(new Date(), 3650).toISOString(),
  feeStatus: 'Paid',
  feeAmount: 0,
  isBlocked: false,
};

const API_URL = resolveApiBaseUrl();

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
};

function unwrapApiData<T>(response: T | ApiEnvelope<T>): T {
  return response && typeof response === 'object' && 'success' in response && 'data' in response
    ? (response as ApiEnvelope<T>).data
    : (response as T);
}

function mergeStudentsInUsers(currentUsers: User[], students: User[]) {
  const nonStudents = currentUsers.filter((u) => u.role !== 'student');
  return [...nonStudents, ...students];
}

/**
 * Persisted auth storage:
 * - Uses AsyncStorage on native, localStorage on web.
 * - Also maintains legacy key names requested by the spec:
 *   - authToken
 *   - userRole
 *   - libraryId
 */
const authStorage = createJSONStorage(() => {
  const isWeb = Platform.OS === 'web';

  const webStorage = {
    getItem: async (name: string) => {
      try {
        return window?.localStorage?.getItem(name) ?? null;
      } catch {
        return null;
      }
    },
    setItem: async (name: string, value: string) => {
      try {
        window?.localStorage?.setItem(name, value);
      } catch {
        // ignore
      }
    },
    removeItem: async (name: string) => {
      try {
        window?.localStorage?.removeItem(name);
      } catch {
        // ignore
      }
    },
  };

  const base = isWeb ? webStorage : AsyncStorage;

  // Wrap to also write legacy keys on setItem.
  return {
    getItem: async (name: string) => {
      const raw = await base.getItem(name);
      if (raw) return raw;

      // Fallback restore from legacy keys (if persist key was never written).
      const legacyToken = await base.getItem('authToken');
      const legacyRole = await base.getItem('userRole');
      const legacyLibraryId = await base.getItem('libraryId');
      const legacyLibraryCode = await base.getItem('libraryCode');
      if (!legacyToken && !legacyRole && !legacyLibraryId && !legacyLibraryCode) return null;

      const hydrated = {
        state: {
          token: legacyToken,
          role: (legacyRole as AuthRole | null) ?? null,
          libraryId: legacyLibraryId,
          libraryCode: legacyLibraryCode,
          authToken: legacyToken, // keep in sync
        },
        version: 1,
      };
      return JSON.stringify(hydrated);
    },
    setItem: async (name: string, value: string) => {
      await base.setItem(name, value);
      try {
        const parsed = JSON.parse(value) as { state?: Partial<AppState> };
        const token = parsed?.state?.token ?? null;
        const role = parsed?.state?.role ?? null;
        const libraryId = parsed?.state?.libraryId ?? null;
        const libraryCode = parsed?.state?.libraryCode ?? null;
        await Promise.all([
          base.setItem('authToken', token ?? ''),
          base.setItem('userRole', role ?? ''),
          base.setItem('libraryId', libraryId ?? ''),
          base.setItem('libraryCode', libraryCode ?? ''),
        ]);
      } catch {
        // ignore
      }
    },
    removeItem: async (name: string) => {
      await base.removeItem(name);
      await Promise.all([
        base.removeItem('authToken'),
        base.removeItem('userRole'),
        base.removeItem('libraryId'),
        base.removeItem('libraryCode'),
      ]);
    },
  };
});

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  currentUser: null,
  authToken: null,
  token: null,
  role: null,
  libraryId: null,
  libraryCode: null,
  users: [initialAdmin],
  attendances: [],
  notifications: [
    {
      id: 'notif-1',
      title: 'Welcome!',
      message: 'Welcome to the Library Management System.',
      date: new Date().toISOString(),
      targetId: 'all',
      category: 'general',
    },
  ],
  dailyQrToken: null,
  lastNotifSeenAt: null,
  seats: [],
  spaces: [],
  shifts: [],
  allocations: [],

  isAuthenticated: () => Boolean(get().token),
  isAdmin: () => get().role === 'admin',
  isLibrary: () => get().role === 'library',
  isStudent: () => get().role === 'student',

  upgradeSubscription: async (planKey) => {
    try {
      const res = await apiPost<{ ok: boolean; user: User }>(`/api/subscription/upgrade`, { planKey });
      if (res?.user) {
        set({ currentUser: res.user });
      }
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to upgrade plan' };
    }
  },

  cancelSubscription: async (data) => {
    try {
      const res = await apiPost<{ ok: boolean; user: User }>(`/api/subscription/cancel`, {
        reason: data?.reason ?? null,
        note: data?.note ?? null,
      });
      if (res?.user) set({ currentUser: res.user });
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to cancel subscription' };
    }
  },

  saveRetentionChoice: async (choice) => {
    try {
      await apiPost<{ ok: boolean }>(`/api/subscription/retention-choice`, { choice });
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to store choice' };
    }
  },

  fetchSeats: async () => {
    try {
      const response = await apiGet<Seat[] | ApiEnvelope<Seat[]>>(`/api/seats`);
      const list = unwrapApiData(response);
      set({ seats: list });
    } catch {
      // keep local state
    }
  },

  fetchSpaces: async () => {
    try {
      const response = await apiGet<Space[] | ApiEnvelope<Space[]>>(`/api/spaces`);
      const list = unwrapApiData(response);
      set({ spaces: list });
    } catch {
      // keep local state
    }
  },

  createSpace: async (name) => {
    try {
      const response = await apiPost<Space | ApiEnvelope<Space>>(`/api/spaces`, { name });
      const space = unwrapApiData(response);
      set((s) => ({ spaces: [...s.spaces, space].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }));
      return { ok: true, space };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to create space' };
    }
  },

  fetchShifts: async () => {
    try {
      const response = await apiGet<Shift[] | ApiEnvelope<Shift[]>>(`/api/shifts`);
      const list = unwrapApiData(response);
      set({ shifts: list });
    } catch {
      // keep local state
    }
  },

  createShift: async (data) => {
    try {
      const response = await apiPost<Shift | ApiEnvelope<Shift>>(`/api/shifts`, data);
      const shift = unwrapApiData(response);
      set((s) => ({ shifts: [...s.shifts, shift].sort((a, b) => a.startTime - b.startTime) }));
      return { ok: true, shift };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to create shift' };
    }
  },

  fetchAllocations: async (shiftId, spaceId) => {
    try {
      const params: any = {};
      if (shiftId) params.shiftId = shiftId;
      if (spaceId) params.spaceId = spaceId;
      const response = await apiGet<SeatAllocation[] | ApiEnvelope<SeatAllocation[]>>(`/api/allocations`, params);
      const list = unwrapApiData(response);
      set({ allocations: list });
    } catch {
      // keep local state
    }
  },

  assignAllocation: async (data) => {
    const prev = get().allocations;
    const optimistic: SeatAllocation = {
      id: `tmp-${Date.now()}`,
      libraryId: get().libraryId,
      seatId: data.seatId,
      shiftId: data.shiftId,
      studentId: data.studentId,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'active',
    };
    set((s) => ({ allocations: [optimistic, ...s.allocations] }));
    try {
      const response = await apiPost<SeatAllocation | ApiEnvelope<SeatAllocation>>(`/api/allocations`, data);
      const created = unwrapApiData(response);
      set((s) => ({ allocations: s.allocations.map((a) => (a.id === optimistic.id ? created : a)) }));
      return { ok: true, allocation: created };
    } catch (e) {
      set({ allocations: prev });
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to assign seat' };
    }
  },

  cancelAllocation: async (allocationId) => {
    const prev = get().allocations;
    set((s) => ({ allocations: s.allocations.map((a) => (a.id === allocationId ? { ...a, status: 'cancelled' } : a)) }));
    try {
      await apiPatch<SeatAllocation | ApiEnvelope<SeatAllocation>>(`/api/allocations/${allocationId}`, { status: 'cancelled' });
      return { ok: true };
    } catch (e) {
      set({ allocations: prev });
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to unassign' };
    }
  },

  bulkCreateSeats: async (totalSeats, spaceId) => {
    try {
      const response = await apiPost<Seat[] | ApiEnvelope<Seat[]>>(`/api/seats/bulk-create`, { totalSeats, spaceId: spaceId ?? null });
      const list = unwrapApiData(response);
      set({ seats: list });
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to create seats' };
    }
  },

  updateSeatSpace: async (seatId, spaceId) => {
    const prev = get().seats;
    set((s) => ({ seats: s.seats.map((x) => (x.id === seatId ? { ...x, spaceId } : x)) }));
    try {
      const response = await apiPatch<Seat | ApiEnvelope<Seat>>(`/api/seats/${seatId}`, { spaceId });
      const updated = unwrapApiData(response);
      set((s) => ({ seats: s.seats.map((x) => (x.id === updated.id ? updated : x)) }));
      return { ok: true };
    } catch (e) {
      set({ seats: prev });
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to update seat' };
    }
  },

  assignSeat: async (seatId, studentId) => {
    // Optimistic UI: update immediately, rollback on error
    const prev = get().seats;
    set((s) => ({
      seats: s.seats.map((x) => (x.id === seatId ? { ...x, status: 'occupied', studentId } : x)),
    }));
    try {
      // Backend call: POST /api/seats/assign (alias supported)
      const response = await apiPost<Seat | ApiEnvelope<Seat>>(`/api/seats/assign`, { seatId, studentId });
      const updated = unwrapApiData(response);
      set((s) => ({ seats: s.seats.map((x) => (x.id === updated.id ? updated : x)) }));
      return { ok: true };
    } catch (e) {
      set({ seats: prev });
      const err = e as ApiError;
      return { ok: false, message: err?.message };
    }
  },

  unassignSeat: async (seatId) => {
    const prev = get().seats;
    set((s) => ({
      seats: s.seats.map((x) => (x.id === seatId ? { ...x, status: 'available', studentId: null } : x)),
    }));
    try {
      const response = await apiPost<Seat | ApiEnvelope<Seat>>(`/api/seats/unassign`, { seatId });
      const updated = unwrapApiData(response);
      set((s) => ({ seats: s.seats.map((x) => (x.id === updated.id ? updated : x)) }));
      return { ok: true };
    } catch (e) {
      set({ seats: prev });
      const err = e as ApiError;
      return { ok: false, message: err?.message };
    }
  },

  login: async (usernameOrMobile, pinOrPassword, opts) => {
    try {
      const mode = opts?.mode ?? 'pin';
      const libraryCode = opts?.libraryCode ?? get().libraryCode ?? undefined;

      /**
       * Connection: POST /api/auth/login
       * - Axios service attaches Authorization automatically on future requests
       * - For login itself: we send credentials only (no token yet)
       */
      const response = await apiPost<
        | { user: User; authToken?: string; libraryCode?: string }
        | { success: boolean; data: { user: User; authToken?: string; libraryCode?: string }; message?: string }
      >(`/api/auth/login`, {
        usernameOrMobile,
        ...(mode === 'password' ? { password: pinOrPassword } : { pin: pinOrPassword }),
        ...(libraryCode ? { libraryCode } : {}),
      });
      const data = 'success' in response ? response.data : response;
      const authenticatedUser = data.user;
      const token = data.authToken || null;

      // Safety: backend no longer supports admin via /api/auth/login
      if (authenticatedUser?.role === 'admin') {
        return { ok: false, message: 'Admin login is not available here.' };
      }

      // For library logins, backend includes libraryCode in user; for student logins, we keep what user typed.
      const nextLibraryCode =
        authenticatedUser.role === 'library'
          ? (authenticatedUser.libraryCode ?? data.libraryCode ?? null)
          : (libraryCode ?? null);

      /**
       * Persist required auth fields:
       * - token
       * - role
       * - libraryId (tenant)
       *
       * Library role: libraryId === user.id
       * Student role: libraryId may not be present in login response → hydrate via GET /api/student/me
       */
      let nextLibraryId: string | null =
        authenticatedUser.role === 'library'
          ? authenticatedUser.id
          : authenticatedUser.role === 'student'
            ? (authenticatedUser.libraryId ?? null)
            : null;

      set((state) => ({
        currentUser: authenticatedUser,
        // Keep both fields in sync until the rest of codebase is migrated.
        authToken: token,
        token,
        role: authenticatedUser.role,
        libraryId: nextLibraryId,
        libraryCode: nextLibraryCode,
        users:
          authenticatedUser.role === 'admin'
            ? [authenticatedUser, ...state.users.filter((u) => u.role === 'student')]
            // Always include the logged-in student in users so getStudentNotifications can find them
            : [initialAdmin, authenticatedUser, ...state.users.filter((u) => u.role === 'student' && u.id !== authenticatedUser.id)],
      }));

      // If student login didn't include libraryId, fetch /api/student/me once to hydrate tenant id.
      if (authenticatedUser.role === 'student' && !nextLibraryId && token) {
        try {
          const me = await apiGet<{ ok: boolean; student?: { libraryId?: string | null } }>(`/api/student/me`);
          const hydratedLibraryId = me?.student?.libraryId ?? null;
          if (hydratedLibraryId) {
            nextLibraryId = hydratedLibraryId;
            set({ libraryId: hydratedLibraryId });
          }
        } catch {
          // Non-fatal: UI can still work, but some tenant-scoped calls may fail until refreshed.
        }
      }

      if (authenticatedUser.role === 'admin') {
        await get().fetchStudents();
      } else {
        // Fetch student's notifications and attendance on login
        await Promise.all([
          get().fetchNotifications(authenticatedUser.id),
          get().fetchStudentAttendance(authenticatedUser.id),
        ]);
      }

      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      const msg = err?.message || 'Network error';
      if (/Network/i.test(msg)) {
        return { ok: false, message: 'Please check your internet connection' };
      }
      return { ok: false, message: msg };
    }
  },

  adminLogin: async (username, pin) => {
    try {
      const response = await apiPost<
        | { user: User; authToken?: string; libraryCode?: string }
        | { success: boolean; data: { user: User; authToken?: string; libraryCode?: string }; message?: string }
      >(`/api/admin/login`, { username, pin });
      const data = 'success' in response ? response.data : response;
      const authenticatedUser = data.user;
      const token = data.authToken || null;
      if (!authenticatedUser || authenticatedUser.role !== 'admin') {
        return { ok: false, message: 'Invalid admin credentials' };
      }
      set((state) => ({
        currentUser: authenticatedUser,
        authToken: token,
        token,
        role: authenticatedUser.role,
        libraryId: null,
        libraryCode: null,
        users: [authenticatedUser, ...state.users.filter((u) => u.role === 'student')],
      }));
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Network error' };
    }
  },

  logout: () =>
    set({
      currentUser: null,
      authToken: null,
      token: null,
      role: null,
      libraryId: null,
      libraryCode: null,
    }),

  patchCurrentUser: (patch) =>
    set((state) => ({
      currentUser: state.currentUser ? { ...state.currentUser, ...patch } : (state.role ? ({ role: state.role, ...patch } as any) : state.currentUser),
    })),

  fetchMyProfile: async () => {
    const { currentUser: cu, role, libraryId } = get();
    const effectiveRole = cu?.role || role;
    if (!effectiveRole) return { ok: false, message: 'Not logged in' };
    try {
      if (effectiveRole === 'library') {
        const res = await apiGet<{ ok: boolean; profile: any }>(`/api/library/profile`);
        const p = res.profile;
        // If currentUser wasn't persisted, create it from profile response.
        set({
          currentUser: {
            ...(cu || ({} as any)),
            id: cu?.id || libraryId || p?.id || '',
            role: 'library',
            name: p?.libraryName ?? cu?.name,
            ownerName: p?.name ?? cu?.ownerName,
            email: p?.email ?? cu?.email,
            phone: p?.phone ?? cu?.phone,
            address: p?.address ?? cu?.address,
            city: p?.city ?? cu?.city,
            logoUrl: p?.logoUrl ?? cu?.logoUrl,
            plan: p?.plan ?? cu?.plan,
            planExpiryDate: p?.planExpiryDate ?? cu?.planExpiryDate,
          } as any,
        });
        return { ok: true };
      }

      if (effectiveRole === 'student') {
        const res = await apiGet<{ ok: boolean; student: any }>(`/api/student/me`);
        const s = res.student;
        set({
          currentUser: {
            ...(cu || ({} as any)),
            ...s,
            role: 'student',
            photoUrl: s?.photoUrl ?? (cu as any)?.photoUrl,
          } as any,
        });
        return { ok: true };
      }

      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || 'Failed to load profile' };
    }
  },

  requestLibraryPasswordReset: async (email) => {
    try {
      await apiPost<{ ok: boolean; message?: string }>(`/api/auth/forgot-password`, { email });
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  resetLibraryPassword: async (token, newPassword) => {
    try {
      await apiPost<{ ok: boolean; message?: string }>(`/api/auth/reset-password`, { token, newPassword });
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  changeLibraryPassword: async (currentPassword, newPassword) => {
    try {
      await apiPost<{ ok: boolean; message?: string }>(`/api/auth/change-password`, { currentPassword, newPassword });
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  fetchStudents: async () => {
    try {
      const students = await apiGet<User[]>(`/api/students`);
      set((state) => ({ users: mergeStudentsInUsers(state.users, students) }));
    } catch {
      // Keep existing local users when backend is unavailable.
    }
  },

  fetchStudentsPage: async (page, limit) => {
    // Pagination: avoid loading all data for list screens
    // Multi-tenant backend filters by token automatically.
    return await apiGet<User[]>(`/api/students`, { page, limit });
  },

  addStudent: async (studentData) => {
    try {
      const created = await apiPost<User>(`/api/students`, studentData);
      set((state) => ({ users: [...state.users.filter((u) => u.role !== 'student' || u.id !== created.id), created] }));
      return { ok: true, student: created };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  updateStudent: async (id, data) => {
    try {
      const updated = await apiPut<User>(`/api/students/${id}`, data);
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? updated : u)),
        currentUser: state.currentUser?.id === id ? updated : state.currentUser,
      }));
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  deleteStudent: async (id) => {
    try {
      await apiDelete(`/api/students/${id}`);

      set((state) => ({
        users: state.users.filter((u) => u.id !== id),
        currentUser: state.currentUser?.id === id ? null : state.currentUser,
      }));
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  uploadStudentPhoto: async (id, localUri) => {
    try {
      const formData = new FormData();
      const filename = localUri.split('/').pop() ?? 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      // React Native FormData accepts this object shape for file uploads
      formData.append('photo', { uri: localUri, name: filename, type } as unknown as Blob);

      const response = await api.post<User>(`/api/students/${id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = response.data;
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? updated : u)),
        currentUser: state.currentUser?.id === id ? updated : state.currentUser,
      }));
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  uploadMyPhoto: async (localUri) => {
    try {
      const formData = new FormData();
      const filename = localUri.split('/').pop() ?? 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      formData.append('photo', { uri: localUri, name: filename, type } as unknown as Blob);

      const response = await api.post<{ ok: boolean; student: User }>(`/api/student/me/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = response.data?.student;
      if (updated?.id) {
        set((state) => ({
          users: state.users.map((u) => (u.id === updated.id ? updated : u)),
          currentUser: state.currentUser?.id === updated.id ? updated : state.currentUser,
        }));
      }
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  deleteMyAccount: async () => {
    try {
      await apiDelete(`/api/student/me`);
      get().logout();
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  toggleBlockStudent: async (id) => {
    try {
      const updated = await apiPatch<User>(`/api/students/${id}/block`);
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? updated : u)),
        currentUser: state.currentUser?.id === id ? updated : state.currentUser,
      }));
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  generateDailyQr: async (opts) => {
    try {
      const data = await apiPost<QrTokenInfo>(`/api/attendance/token`, { rotate: Boolean(opts?.rotate) });
      set({ dailyQrToken: data.token || null });
      return data;
    } catch {
      return null;
    }
  },

  fetchTodayAttendance: async () => {
    try {
      const list = await apiGet<Attendance[]>(`/api/attendance/today`);
      set({ attendances: list });
    } catch {
      // Keep local state if backend fails.
    }
  },

  fetchAttendanceByDate: async (date) => {
    try {
      const list = await apiGet<Attendance[]>(`/api/attendance`, { date });
      set({ attendances: list });
    } catch {
      // Keep local state if backend fails.
    }
  },

  fetchNotifications: async (studentId) => {
    try {
      const list = await apiGet<Notification[]>(`/api/notifications`, studentId ? { studentId } : undefined);
      set({
        notifications: list.map((n) => ({
          ...n,
          category: (n.category as NotificationCategory) || 'general',
        })),
      });
    } catch {
      // Keep local state if backend fails.
    }
  },

  fetchNotificationsPage: async (page, limit, studentId) => {
    // Pagination: avoid loading all data for list screens
    const list = await apiGet<Notification[]>(`/api/notifications`, { page, limit, ...(studentId ? { studentId } : {}) });
    return list.map((n) => ({ ...n, category: (n.category as NotificationCategory) || 'general' }));
  },

  sendNotification: async (title, message, targetId = 'all', category: NotificationCategory = 'general') => {
    try {
      const created = await apiPost<Notification>(`/api/notifications`, { title, message, targetId, category });
      set((state) => ({ notifications: [created, ...state.notifications] }));
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  markNotificationRead: async (id) => {
    if (!id || id.startsWith('sys-')) return { ok: true };
    try {
      await apiPatch<{ ok?: boolean; readByMe?: boolean }>(`/api/notifications/${id}/read`, {});
      set((s) => ({
        notifications: s.notifications.map((n) =>
          n.id === id ? { ...n, readByMe: true } : n
        ),
      }));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },

  fetchStudentAttendance: async (studentId, year, month) => {
    try {
      const now = new Date();
      const y = year ?? now.getFullYear();
      const m = month ?? (now.getMonth() + 1);
      const items = await apiGet<{ date: string; status: string }[]>(`/api/attendance/student/${studentId}`, { year: y, month: m });
      const mapped: Attendance[] = items.map((item) => ({
        id: `${studentId}-${item.date}`,
        studentId,
        date: item.date,
      }));
      set((state) => {
        // Merge: keep non-student or other-month records, add fresh ones
        const others = state.attendances.filter(
          (a) => a.studentId !== studentId || !a.date.startsWith(`${y}-${String(m).padStart(2, '0')}`)
        );
        return { attendances: [...others, ...mapped] };
      });
    } catch {
      // Silently ignore — user sees stale data but app doesn't crash
    }
  },

  markAttendance: async (token) => {
    const { currentUser, authToken } = get();
    if (!currentUser || currentUser.role !== 'student') {
      return { ok: false, message: 'Only students can mark attendance' };
    }
    if (!authToken) {
      return { ok: false, message: 'Unauthorized. Please login again.' };
    }

    const normalized = prepareAttendanceQrPayload(token);

    try {
      const data = await apiPost<{ ok: boolean; alreadyMarked?: boolean; message?: string }>(`/api/attendance/mark`, { token: normalized });
      const { currentUser: cu } = get();
      if (cu) await get().fetchStudentAttendance(cu.id);
      return { ok: true, alreadyMarked: Boolean(data.alreadyMarked), message: data.message };
    } catch (e) {
      const err = e as ApiError;
      return { ok: false, message: err?.message || `Backend unavailable (${API_URL})` };
    }
  },

  getTodayAttendance: () => {
    const { attendances } = get();
    const today = new Date();
    return attendances.filter((a) => isSameDay(new Date(a.date), today));
  },

  getStudentAttendance: (studentId) => {
    const { attendances } = get();
    return attendances.filter((a) => a.studentId === studentId);
  },

  getStudentNotifications: (studentId) => {
    const { notifications, users, currentUser } = get();
    // Fallback to currentUser so the function works even if users list isn't populated yet
    const student = users.find((u) => u.id === studentId)
      ?? (currentUser?.id === studentId ? currentUser : null);
    if (!student) return [];

    const studentNotifs = notifications.filter((n) => n.targetId === 'all' || n.targetId === studentId);

    // Auto-generate expiry reminders
    const daysRemaining = differenceInDays(new Date(student.expiryDate), new Date());
    if (daysRemaining <= 3 && daysRemaining >= 0) {
      studentNotifs.unshift({
        id: 'sys-reminder',
        title: 'Membership Expiring Soon',
        message: `Your library membership will expire in ${daysRemaining} days. Please renew soon.`,
        date: new Date().toISOString(),
        targetId: studentId,
        category: 'rules',
      });
    } else if (daysRemaining < 0) {
      studentNotifs.unshift({
        id: 'sys-expired',
        title: 'Membership Expired',
        message: `Your library membership has expired. Please renew to continue access.`,
        date: new Date().toISOString(),
        targetId: studentId,
        category: 'rules',
      });
    }

    return studentNotifs;
  },

  markNotifsRead: () => {
    set({ lastNotifSeenAt: new Date().toISOString() });
  },

  getUnreadNotifCount: (studentId) => {
    const { notifications, lastNotifSeenAt } = get();
    const cutoff = lastNotifSeenAt ? new Date(lastNotifSeenAt).getTime() : 0;
    return notifications.filter((n) => {
      if (n.id.startsWith('sys-')) return false;
      if (!(n.targetId === 'all' || n.targetId === studentId)) return false;
      const hasPerUser = n.readByMe !== undefined && n.readByMe !== null;
      if (hasPerUser) return !n.readByMe;
      return new Date(n.date).getTime() > cutoff;
    }).length;
  },
}),
    {
      name: 'auth-state-v1',
      storage: authStorage,
      version: 1,
      // Only persist auth fields (do not persist large domain data)
      partialize: (state) => ({
        authToken: state.authToken,
        token: state.token,
        role: state.role,
        libraryId: state.libraryId,
        libraryCode: state.libraryCode,
      }),
    }
  )
);
