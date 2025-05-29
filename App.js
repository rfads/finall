import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import ChangeText from './components/ChangeText';
import AddReminder from './components/AddReminder';
import { ReminderProvider } from './components/ReminderContext';
import { NameProvider } from './components/NameContext';
import LoginScreen from './components/FireScreens/LoginScreen';
import Map from './components/Map';
import { LogBox } from 'react-native';
import { AuthProvider, useAuth } from './components/FireScreens/AuthContext';
import GuestStack from './components/FireScreens/GuestStack';
import LocationPicker from './components/LocationPicker';
import WatchedView from './components/WatchedView';

// Ignore specific warnings
LogBox.ignoreLogs([
  "Warning: ...",
  "AsyncStorage has been extracted from react-native",
]);

const Stack = createStackNavigator();

const AppContent = () => {
  const { loggedInUser } = useAuth();
  
  return (
    <Stack.Navigator>
      {loggedInUser ? (
        <Stack.Screen 
          name="ChangeText" 
          component={ChangeText} 
          options={{ title: 'Choose Role', headerShown: false }} 
        />
      ) : (
        <Stack.Screen 
          name="GuestStack" 
          component={GuestStack} 
          options={{ headerShown: false }} 
        />
      )}

      <Stack.Screen name="AddReminder" component={AddReminder} />
      <Stack.Screen name="Map" component={Map} />
      <Stack.Screen name="LocationPicker" component={LocationPicker} options={{ title: 'Watcher View' }} />
      <Stack.Screen name="WatchedView" component={WatchedView} options={{ title: 'Generate Watch Key' }} />
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <NameProvider>
        <ReminderProvider>
          <NavigationContainer>
            <AppContent />
          </NavigationContainer>
        </ReminderProvider>
      </NameProvider>
    </AuthProvider>
  );
}

const styles = {
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
};
