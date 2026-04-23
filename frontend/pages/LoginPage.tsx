import React from 'react';
import LoginScreen from '../screens/auth/LoginScreen';

/**
 * LoginPage
 * - Uses the existing Login UI unchanged.
 * - Auth + API wiring happens in the Zustand store + Axios service.
 */
export default function LoginPage() {
  return <LoginScreen />;
}

