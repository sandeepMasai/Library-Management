import React from 'react';
import RegisterLibraryScreen from '../screens/auth/RegisterLibraryScreen';

/**
 * RegisterLibraryPage (web-friendly wrapper)
 * - Keeps UI in `RegisterLibraryScreen` unchanged.
 * - Backend connection is inside the screen via Axios:
 *   POST /api/auth/register-library
 */
export default function RegisterLibraryPage() {
  return <RegisterLibraryScreen />;
}

