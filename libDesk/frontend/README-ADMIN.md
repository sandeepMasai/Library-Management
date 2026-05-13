## Super Admin (Admin) Tabs

Super Admin UI is mounted under `AdminRoot` → `AdminTabs()` in `libDesk/frontend/App.tsx`.

### Tabs (Bottom navigation)

- **Dashboard**
  - **Route name**: `Dashboard`
  - **Component**: `AdminDashboardPage`
  - **File**: `libDesk/frontend/pages/AdminDashboardPage.tsx`
  - **Backend APIs (common)**:
    - `GET /api/admin/dashboard`
    - `GET /api/admin/libraries`
    - `DELETE /api/admin/libraries/:id`
    - `PATCH /api/admin/libraries/:id/block`

- **Subscriptions**
  - **Route name**: `Subscriptions`
  - **Component**: `AdminSubscriptionsPage`
  - **File**: `libDesk/frontend/pages/AdminSubscriptionsPage.tsx`
  - **Backend APIs (common)**:
    - `GET /api/admin/subscriptions?status=active|expired|cancelled`

- **Plans (Plan Management)**
  - **Route name**: `Plans`
  - **Tab title**: `Plan Management`
  - **Component**: `AdminPlansPage`
  - **File**: `libDesk/frontend/pages/AdminPlansPage.tsx`
  - **Backend APIs (common)**:
    - `GET /api/plans?all=1` (admin-only)
    - `POST /api/plans`
    - `PUT /api/plans/:id`
    - `DELETE /api/plans/:id` (system plans like `free`/`trial` are protected)

- **Notify**
  - **Route name**: `Notify`
  - **Component**: `AdminNotifyLibrariesPage`
  - **File**: `libDesk/frontend/pages/AdminNotifyLibrariesPage.tsx`
  - **Backend APIs (common)**:
    - `POST /api/admin/notify`
    - (picker list) `GET /api/admin/libraries?page=1&limit=100`

- **Libraries**
  - **Route name**: `Libraries`
  - **Component**: `AdminLibrariesPage`
  - **File**: `libDesk/frontend/pages/AdminLibrariesPage.tsx`
  - **Backend APIs (common)**:
    - `GET /api/admin/libraries?page=1&limit=10`
    - `PATCH /api/admin/libraries/:id/block`
    - `DELETE /api/admin/libraries/:id` (restricted by “PRO active only” rule)

- **Settings**
  - **Route name**: `Settings`
  - **Component**: `SettingsScreen`
  - **File**: `libDesk/frontend/screens/common/SettingsScreen.tsx`
  - **Related admin screens reachable from Settings**
    - **Global URLs**: `AdminGlobalSettingsPage` → `libDesk/frontend/pages/AdminGlobalSettingsPage.tsx`
    - **Appearance**: `AppearanceScreen` → `libDesk/frontend/screens/common/AppearanceScreen.tsx`

### Admin “detail” screens (not tabs, opened from tabs)

- **Library Detail**
  - **Route name**: `AdminLibraryDetail`
  - **Component**: `AdminLibraryDetailPage`
  - **File**: `libDesk/frontend/pages/AdminLibraryDetailPage.tsx`

- **Subscription Detail**
  - **Route name**: `AdminSubscriptionDetail`
  - **Component**: `AdminSubscriptionDetailPage`
  - **File**: `libDesk/frontend/pages/AdminSubscriptionDetailPage.tsx`

### Notes

- Admin tabs are defined here:
  - `libDesk/frontend/App.tsx` → `function AdminTabs()`
- There is also a legacy dashboard screen (`libDesk/frontend/screens/admin/Dashboard.tsx`) that is currently reused in `LibraryTabs()`. The Super Admin tab uses `pages/AdminDashboardPage.tsx`.

