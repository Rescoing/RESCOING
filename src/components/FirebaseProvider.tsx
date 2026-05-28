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

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

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
              accessStatus: 'approved', // Auto-approve for smooth testing & chat
              permissions: {
                dashboard: true,
                crm: true,
                inventory: true,
                operations: true,
                finance: true,
                documents: true,
                suppliers: true,
                hr: true,
                library: true,
                audit_log: true,
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
            accessStatus: 'approved', // Auto-approve for smooth testing
            permissions: {
              dashboard: true,
              crm: true,
              inventory: true,
              operations: true,
              finance: true,
              documents: true,
              suppliers: true,
              hr: true,
              library: true,
              audit_log: true,
            },
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

  return (
    <AuthContext.Provider value={{ 
      user, profile, loading, login, 
      loginWithEmail, registerWithEmail, 
      logout, updateProfile 
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
