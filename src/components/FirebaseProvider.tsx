import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile as updateAuthProfile
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, query, collection, where, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  companyName?: string;
  companyRut?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogo?: string;
  companyEmail?: string;
  companyWebsite?: string;
  role: 'admin' | 'user';
  accessStatus: 'pending' | 'approved' | 'denied';
  permissions: {
    [key: string]: boolean;
  };
  updatedAt?: any;
}

export interface CompanySettings {
  companyName?: string;
  companyRut?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogo?: string;
  companyEmail?: string;
  companyWebsite?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  updateCompanySettings: (data: Partial<CompanySettings>) => Promise<void>;
  updateAccountSettings: (data: { displayName?: string; photoURL?: string; email?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (!user) {
        setProfile(null);
        setCompanySettings(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Subscribe to profile changes
  useEffect(() => {
    if (!user) return;

    const docRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      const isDefaultAdmin = user.email === 'rescoing@gmail.com';
      
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        
        // Auto-fix default admin profile if fields are missing or status is not approved
        if (isDefaultAdmin && (data.accessStatus !== 'approved' || data.role !== 'admin')) {
          const updatedProfile = {
            ...data,
            role: 'admin' as const,
            accessStatus: 'approved' as const,
            updatedAt: new Date().toISOString()
          };
          await setDoc(docRef, updatedProfile, { merge: true });
          setProfile(updatedProfile);
        } else {
          setProfile(data);
        }
        setLoading(false);
      } else {
        // Check for an invitation for this email using predictable ID
        const invitationId = `invite_${user.email?.toLowerCase()}`;
        const inviteDocRef = doc(db, 'users', invitationId);
        
        let initialProfile: UserProfile;

        try {
          // Use getDoc instead of getDocs to avoid list permission issues
          const inviteDocSnap = await getDoc(inviteDocRef);
          
          if (inviteDocSnap.exists()) {
            const inviteData = inviteDocSnap.data() as UserProfile;
            initialProfile = {
              ...inviteData,
              uid: user.uid,
              displayName: user.displayName || inviteData.displayName || 'Usuario',
              photoURL: user.photoURL || inviteData.photoURL || '',
              updatedAt: new Date().toISOString()
            };
          } else {
            // Create initial profile
            const isDefaultAdmin = user.email === 'rescoing@gmail.com';
            initialProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
              photoURL: user.photoURL || '',
              role: isDefaultAdmin ? 'admin' : 'user',
              accessStatus: isDefaultAdmin ? 'approved' : 'pending',
              permissions: {
                dashboard: true,
                crm: isDefaultAdmin,
                inventory: isDefaultAdmin,
                operations: isDefaultAdmin,
                finance: isDefaultAdmin,
                documents: isDefaultAdmin,
                suppliers: isDefaultAdmin,
                hr: isDefaultAdmin,
                library: isDefaultAdmin,
                audit_log: isDefaultAdmin,
              },
              updatedAt: new Date().toISOString()
            };
          }
        } catch (error) {
          console.error("Error checking invitation:", error);
          // Fallback to default
          const isDefaultAdmin = user.email === 'rescoing@gmail.com';
          initialProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
            photoURL: user.photoURL || '',
            role: isDefaultAdmin ? 'admin' : 'user',
            accessStatus: isDefaultAdmin ? 'approved' : 'pending',
            permissions: { dashboard: true },
            updatedAt: new Date().toISOString()
          };
        }

        try {
          await setDoc(docRef, initialProfile, { merge: true });
          setProfile(initialProfile);
          setLoading(false);
          
          // Delete the invitation document if it was used
          const invitationId = `invite_${user.email?.toLowerCase()}`;
          const inviteDocRef = doc(db, 'users', invitationId);
          const inviteDocSnap = await getDoc(inviteDocRef);
          if (inviteDocSnap.exists()) {
             await deleteDoc(inviteDocRef);
          }
        } catch (error) {
          console.error("Error creating profile:", error);
          setLoading(false);
        }
      }
    }, (error) => {
      console.error("Profile snapshot error:", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Subscribe to global company settings
  useEffect(() => {
    if (!user || !profile) {
      setCompanySettings(null);
      return;
    }

    // Only subscribe to settings if the user is approved or an admin
    const isApprovedUser = profile.role === 'admin' || profile.accessStatus === 'approved';
    if (!isApprovedUser) {
      setCompanySettings(null);
      return;
    }

    const companyDocRef = doc(db, 'settings', 'company');
    const unsubscribe = onSnapshot(companyDocRef, (snap) => {
      if (snap.exists()) {
        setCompanySettings(snap.data() as CompanySettings);
      } else {
        setCompanySettings(null);
      }
    }, (error) => {
      console.warn("Global settings access is restricted or loading: ", error);
    });

    return unsubscribe;
  }, [user, profile?.accessStatus, profile?.role]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const registerWithEmail = async (email: string, pass: string, name: string) => {
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, pass);
    await updateAuthProfile(newUser, { displayName: name });
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid);
    await setDoc(docRef, { ...profile, ...data, updatedAt: new Date().toISOString() }, { merge: true });
  };

  const updateCompanySettings = async (data: Partial<CompanySettings>) => {
    if (!user || profile?.role !== 'admin') return;
    const docRef = doc(db, 'settings', 'company');
    try {
      await setDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email || user.uid
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/company');
    }
  };

  const updateAccountSettings = async (data: { displayName?: string; photoURL?: string; email?: string }) => {
    if (!user || profile?.role !== 'admin') return;
    const docRef = doc(db, 'settings', `account_${user.uid}`);
    try {
      // Save inside 'settings' collection
      await setDoc(docRef, {
        ...data,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Also update standard user profile so it syncs immediately in UI
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        displayName: data.displayName ?? profile.displayName,
        photoURL: data.photoURL ?? profile.photoURL,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // If user profile object is loaded, also update the Auth profile 
      if (data.displayName && auth.currentUser) {
        await updateAuthProfile(auth.currentUser, {
          displayName: data.displayName,
          photoURL: data.photoURL || undefined
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `settings/account_${user.uid}`);
    }
  };

  // Merge companySettings into the exposed profile
  const mergedProfile: UserProfile | null = profile ? {
    ...profile,
    companyName: companySettings?.companyName ?? profile.companyName,
    companyRut: companySettings?.companyRut ?? profile.companyRut,
    companyAddress: companySettings?.companyAddress ?? profile.companyAddress,
    companyPhone: companySettings?.companyPhone ?? profile.companyPhone,
    companyLogo: companySettings?.companyLogo ?? profile.companyLogo,
    companyEmail: companySettings?.companyEmail ?? profile.companyEmail,
    companyWebsite: companySettings?.companyWebsite ?? profile.companyWebsite,
  } : null;

  return (
    <AuthContext.Provider value={{ 
      user, profile: mergedProfile, loading, login, 
      loginWithEmail, registerWithEmail, 
      logout, updateProfile,
      updateCompanySettings, updateAccountSettings
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }
  return context;
}
