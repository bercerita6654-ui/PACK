import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

export const TOKEN_STORAGE_KEY = 'packTrack_google_access_token';
export const TOKEN_EXPIRY_KEY = 'packTrack_google_token_expiry';
export const USER_PROFILE_KEY = 'packTrack_cached_user_profile';

let isSigningIn = false;
let cachedAccessToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;

// Helper: Get cached token from localStorage
export const getStoredAccessToken = (): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    console.warn('Could not read access token from storage:', e);
    return null;
  }
};

// Helper: Save token to localStorage with expiry
export const setStoredAccessToken = (token: string | null, expiresInSeconds = 3500) => {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      const expiry = Date.now() + expiresInSeconds * 1000;
      localStorage.setItem(TOKEN_EXPIRY_KEY, expiry.toString());
      cachedAccessToken = token;
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      cachedAccessToken = null;
    }
  } catch (e) {
    console.warn('Could not write access token to storage:', e);
  }
};

// Helper: Cache user profile for instant loading
export interface CachedGoogleProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export const getCachedUserProfile = (): CachedGoogleProfile | null => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

export const cacheUserProfile = (user: User | null) => {
  try {
    if (typeof window === 'undefined') return;
    if (user) {
      const data: CachedGoogleProfile = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      };
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(USER_PROFILE_KEY);
    }
  } catch (e) {
    console.warn('Could not cache user profile:', e);
  }
};

// Check if error is due to token expiration (401 Unauthorized / UNAUTHENTICATED)
export const isAuthExpiredError = (err: any): boolean => {
  if (!err) return false;
  const msg = String(err.message || err);
  return (
    msg.includes('401') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('invalid_token') ||
    msg.includes('invalid_grant') ||
    msg.includes('Auth credential')
  );
};

// Create a GoogleAuthProvider with Workspace scopes and optional login hint
const createProvider = (emailHint?: string | null) => {
  const provider = new GoogleAuthProvider();
  WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
  if (emailHint) {
    provider.setCustomParameters({ login_hint: emailHint });
  }
  return provider;
};

// Initialize auth state listener and automatically restore user & token
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cacheUserProfile(user);
      const token = cachedAccessToken || getStoredAccessToken();
      cachedAccessToken = token;
      if (onAuthSuccess) {
        onAuthSuccess(user, token);
      }
    } else {
      // User is explicitly logged out
      cachedAccessToken = null;
      setStoredAccessToken(null);
      cacheUserProfile(null);
      if (onAuthFailure) {
        onAuthFailure();
      }
    }
  });
};

// Sign in with Google with Workspace scopes
export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const cachedProfile = getCachedUserProfile();
    const emailHint = auth.currentUser?.email || cachedProfile?.email;
    const provider = createProvider(emailHint);

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan access token dari Google Auth');
    }

    cachedAccessToken = credential.accessToken;
    setStoredAccessToken(credential.accessToken);
    cacheUserProfile(result.user);

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Refresh Google access token (uses current user login hint for seamless re-auth)
export const refreshGoogleToken = async (): Promise<string> => {
  try {
    isSigningIn = true;
    const cachedProfile = getCachedUserProfile();
    const emailHint = auth.currentUser?.email || cachedProfile?.email;
    const provider = createProvider(emailHint);

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal memperbarui access token Google');
    }

    cachedAccessToken = credential.accessToken;
    setStoredAccessToken(credential.accessToken);
    cacheUserProfile(result.user);

    return credential.accessToken;
  } catch (error) {
    console.error('Refresh token error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || getStoredAccessToken();
};

export const setCachedAccessToken = (token: string | null) => {
  setStoredAccessToken(token);
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  setStoredAccessToken(null);
  cacheUserProfile(null);
};

