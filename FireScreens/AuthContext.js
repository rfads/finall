import React, { createContext, useState, useContext, useEffect } from 'react';
import { auth } from '../FireBaseServer';
import { onAuthStateChanged } from 'firebase/auth';
import { View, ActivityIndicator } from 'react-native';

// Create the AuthContext
const AuthContext = createContext();

// AuthProvider component
export function AuthProvider({ children }) {
    const [loggedInUser, setLoggedInUser] = useState(null);
    const [initializing, setInitializing] = useState(true);

    useEffect(() => {
        let unsubscribe;
        try {
            // Listen for auth state changes
            unsubscribe = onAuthStateChanged(auth, (user) => {
                setLoggedInUser(user);
                if (initializing) setInitializing(false);
            }, (error) => {
                console.error('Auth state change error:', error);
                if (initializing) setInitializing(false);
            });
        } catch (error) {
            console.error('Auth initialization error:', error);
            if (initializing) setInitializing(false);
        }

        // Cleanup subscription
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [initializing]);

    const login = (userData) => {
        setLoggedInUser(userData);
    };

    const logout = async () => {
        try {
            await auth.signOut();
            setLoggedInUser(null);
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    if (initializing) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0000ff" />
            </View>
        );
    }

    return (
        <AuthContext.Provider value={{ loggedInUser, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

// Custom hook to use the AuthContext
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthProvider;