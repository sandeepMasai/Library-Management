import React from 'react';
import { Alert, BackHandler, Platform, StatusBar as RNStatusBar, ToastAndroid, TouchableOpacity } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAppStore } from './store';
import { Ionicons } from '@expo/vector-icons';
import { theme } from './theme';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import FloatingTabBar from './components/navigation/FloatingTabBar';
import { AdminRoute, LibraryRoute, StudentRoute } from './components/routing/ProtectedRoutes';
// Screens
import LoginScreen from './screens/auth/LoginScreen';
import RegisterLibraryScreen from './screens/auth/RegisterLibraryScreen';
import AdminDashboardScreen from './screens/admin/Dashboard';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminStudentsPage from './pages/AdminStudentsPage';
import AdminSubscriptionsPage from './pages/AdminSubscriptionsPage';
import AdminNotifyLibrariesPage from './pages/AdminNotifyLibrariesPage';
import AdminLibrariesPage from './pages/AdminLibrariesPage';
import AdminStudents from './screens/admin/Students';
import AdminStudentForm from './screens/admin/StudentForm';
import AdminAttendance from './screens/admin/Attendance';
import AdminNotifications from './screens/admin/Notifications';
import AdminFees from './screens/admin/Fees';
import SettingsScreen from './screens/common/SettingsScreen';
import StudentHome from './screens/student/Home';
import StudentScanQR from './screens/student/ScanQR';
import StudentNotifications from './screens/student/Notifications';
import StudentCalendarScreen from './screens/student/CalendarScreen';
import StudentProfile from './screens/student/Profile';
import LibrarySeatsScreen from './screens/library/Seats';
import SubscriptionScreen from './screens/library/Subscription';
import LibraryProfileScreen from './screens/library/Profile';
import MessageTemplatesScreen from './screens/library/MessageTemplates';
import EditTemplateScreen from './screens/library/EditTemplate';
import CreateTemplateScreen from './screens/library/CreateTemplate';
import LibraryBrandingScreen from './screens/library/LibraryBranding';
import PlaceholderScreen from './screens/common/PlaceholderScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();

/**
 * Web path routing (deep links) + role guards:
 * - Native apps keep using screen-based navigation.
 * - On web, react-navigation uses this linking config to map URL paths to screens.
 * - AdminRoute/LibraryRoute/StudentRoute enforce auth + role constraints.
 */
const linking = {
  prefixes: ['/', 'libdesk://'],
  config: {
    screens: {
      Login: '',
      RegisterLibrary: 'register-library',
      AdminRoot: 'admin',
      LibraryRoot: {
        screens: {
          Dashboard: 'dashboard',
          Students: 'students',
          Attendance: 'attendance',
          Payments: 'payments',
          Seats: 'seats',
        },
      },
      StudentRoot: {
        path: 'student',
        screens: {
          Dashboard: 'dashboard',
          Attendance: 'attendance',
        },
      },
    },
  },
} as const;

function AdminTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';
          if (route.name === 'Dashboard') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === 'Students') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Subscriptions') iconName = focused ? 'card' : 'card-outline';
          else if (route.name === 'Notify') iconName = focused ? 'megaphone' : 'megaphone-outline';
          else if (route.name === 'Libraries') iconName = focused ? 'business' : 'business-outline';
          else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
      })}
    >
      {/* Admin SaaS dashboard (charts + libraries + subscriptions + logs + notify) */}
      <Tab.Screen name="Dashboard" component={AdminDashboardPage} />
      {/* Global students across all libraries */}
      <Tab.Screen name="Students" component={AdminStudentsPage} />
      {/* Subscription tracking list */}
      <Tab.Screen name="Subscriptions" component={AdminSubscriptionsPage} />
      {/* Admin → Libraries notify form */}
      <Tab.Screen name="Notify" component={AdminNotifyLibrariesPage} />
      {/* Libraries list (10/page) */}
      <Tab.Screen name="Libraries" component={AdminLibrariesPage} />
      {/* Admin settings */}
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function StudentTabs() {
  const currentUser      = useAppStore((s) => s.currentUser);
  const notifications    = useAppStore((s) => s.notifications);
  const lastNotifSeenAt  = useAppStore((s) => s.lastNotifSeenAt);

  const unread = (() => {
    if (!currentUser) return 0;
    const cutoff = lastNotifSeenAt ? new Date(lastNotifSeenAt).getTime() : 0;
    return notifications.filter(
      (n) =>
        !n.id.startsWith('sys-') && // exclude auto-generated system notifications
        (n.targetId === 'all' || n.targetId === currentUser.id) &&
        new Date(n.date).getTime() > cutoff
    ).length;
  })();

  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Scan Attendance') iconName = focused ? 'qr-code' : 'qr-code-outline';
          else if (route.name === 'Calendar') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'Notifications') iconName = focused ? 'notifications' : 'notifications-outline';
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={StudentHome}
        options={({ navigation }) => ({
          tabBarLabel: 'Home',
          title: 'Student Home',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => (navigation.getParent() as any)?.navigate('StudentProfile')}
              style={{ marginRight: 4, padding: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              <Ionicons name="person-circle-outline" size={28} color={theme.colors.text} />
            </TouchableOpacity>
          ),
        })}
      />
      <Tab.Screen name="Scan Attendance" component={StudentScanQR} options={{ tabBarLabel: 'Scan', title: 'Scan Attendance' }} />
      <Tab.Screen name="Calendar" component={StudentCalendarScreen} options={{ tabBarLabel: 'Calendar', title: 'Attendance History' }} />
      <Tab.Screen
        name="Notifications"
        component={StudentNotifications}
        options={{ tabBarLabel: 'Notifications', title: 'Notifications', tabBarBadge: unread > 0 ? unread : undefined }}
      />
    </Tab.Navigator>
  );
}

function StudentMainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="StudentTabs" component={StudentTabs} />
      <Stack.Screen
        name="StudentProfile"
        component={StudentProfile}
        options={{
          headerShown: true,
          title: 'Profile',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}

function LibraryTabs() {
  // Reuse the same UI screens, but expose URL paths as requested.
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = '';
          if (route.name === 'Dashboard') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === 'Students') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Attendance') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'Payments') iconName = focused ? 'cash' : 'cash-outline';
          else if (route.name === 'Seats') iconName = focused ? 'apps' : 'apps-outline';
          else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.text, fontWeight: '700' },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
      })}
    >
      {/* Library dashboard keeps existing UI */}
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen name="Students" component={AdminStudents} />
      <Tab.Screen name="Attendance" component={AdminAttendance} />
      <Tab.Screen name="Payments" component={AdminFees} />
      <Tab.Screen name="Seats" component={LibrarySeatsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function LibraryMainStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="LibraryTabs" component={LibraryTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications" component={AdminNotifications} options={{ headerShown: false }} />
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ title: 'Subscription', headerStyle: { backgroundColor: theme.colors.surface }, headerShadowVisible: false }}
      />
      <Stack.Screen
        name="Billing"
        options={{ title: 'Billing', headerStyle: { backgroundColor: theme.colors.surface }, headerShadowVisible: false }}
      >
        {() => <PlaceholderScreen title="Billing" subtitle="Coming soon" />}
      </Stack.Screen>
      <Stack.Screen
        name="Profile"
        component={LibraryProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Branch"
        options={{ title: 'Branch', headerStyle: { backgroundColor: theme.colors.surface }, headerShadowVisible: false }}
      >
        {() => <PlaceholderScreen title="Branch Switcher" subtitle="Coming soon" />}
      </Stack.Screen>
      <Stack.Screen name="MessageTemplates" component={MessageTemplatesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditTemplate" component={EditTemplateScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CreateTemplate" component={CreateTemplateScreen} options={{ headerShown: false }} />
      <Stack.Screen name="LibraryBranding" component={LibraryBrandingScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function AdminRoot() {
  return (
    <AdminRoute>
      <AdminTabs />
    </AdminRoute>
  );
}

function LibraryRoot() {
  return (
    <LibraryRoute>
      <LibraryMainStack />
    </LibraryRoute>
  );
}

function StudentRoot() {
  return (
    <StudentRoute>
      <StudentMainStack />
    </StudentRoute>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const currentUser = useAppStore((state) => state.currentUser);
  const backPressRef = React.useRef(0);
  const { mode, hydrated, theme: uiTheme } = useTheme();
  const barStyle = mode === 'dark' ? 'light-content' : 'dark-content';

  React.useEffect(() => {
    if (!currentUser) return;

    const studentRootTabs = ['Home', 'Scan Attendance', 'Calendar', 'Notifications'];
    const adminRootTabs = ['Dashboard', 'Students', 'Attendance', 'Notifications'];

    const handleBackPress = () => {
      if (!navigationRef.isReady()) return false;

      const route = navigationRef.getCurrentRoute();
      const routeName = route?.name ?? '';

      if (currentUser.role === 'student') {
        if (routeName && routeName !== 'Home' && studentRootTabs.includes(routeName)) {
          // Student main stack is mounted under `StudentRoot` (not `StudentMain`).
          // This keeps Android back behavior working without navigating to a missing route.
          (navigationRef as any).navigate('StudentRoot', {
            screen: 'StudentTabs',
            params: { screen: 'Home' },
          });
          return true;
        }
        if (routeName === 'Home') {
          const now = Date.now();
          if (backPressRef.current && now - backPressRef.current < 1800) {
            BackHandler.exitApp();
            return true;
          }
          backPressRef.current = now;
          if (Platform.OS === 'android') {
            ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
          } else {
            Alert.alert('Exit', 'Press back again to exit');
          }
          return true;
        }
      }

      if (currentUser.role === 'admin') {
        if (routeName && routeName !== 'Dashboard' && adminRootTabs.includes(routeName)) {
          (navigationRef as any).navigate('AdminMain', { screen: 'Dashboard' });
          return true;
        }
        if (routeName === 'Dashboard') {
          const now = Date.now();
          if (backPressRef.current && now - backPressRef.current < 1800) {
            BackHandler.exitApp();
            return true;
          }
          backPressRef.current = now;
          if (Platform.OS === 'android') {
            ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
          } else {
            Alert.alert('Exit', 'Press back again to exit');
          }
          return true;
        }
      }

      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [currentUser]);

  if (!hydrated) return null;

  return (
    <NavigationContainer
      key={mode}
      ref={navigationRef}
      linking={linking as any}
      theme={{
        dark: mode === 'dark',
        colors: {
          primary: uiTheme.colors.primary,
          background: uiTheme.colors.background,
          card: uiTheme.colors.surface,
          text: uiTheme.colors.text,
          border: uiTheme.colors.border,
          notification: '#EF4444',
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <RNStatusBar
        hidden={false}
        translucent={false}
        barStyle={barStyle}
        backgroundColor={Platform.OS === 'android' ? uiTheme.colors.background : undefined}
      />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* Public */}
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="RegisterLibrary" component={RegisterLibraryScreen} />

        {/* Protected role roots */}
        <Stack.Screen name="AdminRoot" component={AdminRoot} />
        <Stack.Screen name="LibraryRoot" component={LibraryRoot} />
        <Stack.Screen name="StudentRoot" component={StudentRoot} />

        {/* Shared screens (kept for backwards compatible navigation flows) */}
        <Stack.Screen
          name="AdminStudentForm"
          component={AdminStudentForm}
          options={{
            headerShown: true,
            title: 'Student Details',
            headerStyle: { backgroundColor: uiTheme.colors.surface },
            headerTintColor: uiTheme.colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="AdminFees"
          component={AdminFees}
          options={{
            headerShown: true,
            title: 'Fee Management',
            headerStyle: { backgroundColor: uiTheme.colors.surface },
            headerTintColor: uiTheme.colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
