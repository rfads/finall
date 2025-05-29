import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ScrollView, Platform, Alert, ActivityIndicator, Modal } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import { collection, addDoc, getDocs, query, where, deleteDoc, onSnapshot, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from './FireBaseServer';
import { useAuth } from './FireScreens/AuthContext';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { TextStyles } from './styles/TextStyles';
import { decode as decodePolyline } from '@mapbox/polyline';
import { MaterialIcons } from '@expo/vector-icons';
import PropTypes from 'prop-types';

const GOOGLE_MAPS_API_KEY = 'AIzaSyDsYG6T39ZhP6D83HUoVF1d70RllQdnq2Q';

const LocationPicker = ({ isWatcher = false, watchedUser = null, onDisconnect = () => {} }) => {
  const { loggedInUser } = useAuth();
  const [locations, setLocations] = useState([]);
  const [newLocation, setNewLocation] = useState('');
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [tempMarker, setTempMarker] = useState(null);
  const [tempAddress, setTempAddress] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [completedRouteCoordinates, setCompletedRouteCoordinates] = useState([]);
  const [remainingRouteCoordinates, setRemainingRouteCoordinates] = useState([]);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const mapRef = useRef(null);
  const [routeSteps, setRouteSteps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);

  // New states for watcher functionality
  const [watchKey, setWatchKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [watchedUserData, setWatchedUserData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // New states for obstacle marking
  const [showObstacleModal, setShowObstacleModal] = useState(false);
  const [obstacleDescription, setObstacleDescription] = useState('');
  const [obstacles, setObstacles] = useState([]);
  const [tempObstacle, setTempObstacle] = useState(null);
  const [isAddingObstacle, setIsAddingObstacle] = useState(false);

  // Add these new states at the top of the LocationPicker component
  const [activeRoute, setActiveRoute] = useState(null);
  const [watchedUsers, setWatchedUsers] = useState([]);

  const [mapError, setMapError] = useState(false);

  // Add this to your state variables at the top
  const [savedLocations, setSavedLocations] = useState([]);

  const [watchedLocation, setWatchedLocation] = useState(null);

  const [initialRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  // Add this state initialization at the top of your component
  const [mapReady, setMapReady] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isAddingLocation, setIsAddingLocation] = useState(false);

  // Add these state variables at the top
  const [selectedLocation, setSelectedLocation] = useState(null);

  // Add this state variable
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // Add this state at the top with other states
  const [connectedUserName, setConnectedUserName] = useState(null);

  // Rename watchedUser state to watchedUserId
  const [watchedUserId, setWatchedUserId] = useState(null);

  const [isNavigating, setIsNavigating] = useState(false);
  const [distanceToWatched, setDistanceToWatched] = useState(null);
  const [bearingToWatched, setBearingToWatched] = useState(null);

  // Add this state
  const [isMapReady, setIsMapReady] = useState(false);

  // Add this state to track if we're currently processing a route
  const [isProcessingRoute, setIsProcessingRoute] = useState(false);

  // Add default initialRegion
  const defaultRegion = {
    latitude: 0,
    longitude: 0,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

  // Add these new state variables
  const [lastRouteUpdate, setLastRouteUpdate] = useState(null);
  const [isRouteCalculationEnabled, setIsRouteCalculationEnabled] = useState(false);
  const ROUTE_UPDATE_INTERVAL = 30000; // 30 seconds minimum between route updates

  // Add this validation function at the top of the component
  const isValidCoordinate = (coord) => {
    return coord && 
           typeof coord.latitude === 'number' && 
           typeof coord.longitude === 'number' &&
           !isNaN(coord.latitude) && 
           !isNaN(coord.longitude);
  };

  // Update useEffect to safely handle watchedUser updates
  useEffect(() => {
    if (watchedUser?.currentLocation) {
      const newLocation = {
        latitude: Number(watchedUser.currentLocation.latitude) || 0,
        longitude: Number(watchedUser.currentLocation.longitude) || 0
      };
      setWatchedLocation(newLocation);
    }
  }, [watchedUser]);

  const handleWatchKeyChange = (text) => {
    setWatchKey(text.toUpperCase());
  };

  const connectToWatched = async () => {
    if (!watchKey.trim()) {
      Alert.alert('Error', 'Please enter a valid watch key');
      return;
    }

    setIsConnecting(true);
    try {
      const watchedRef = collection(firestore, 'watched_users');
      const q = query(
        watchedRef, 
        where('watchKey', '==', watchKey.trim()),
        where('isActive', '==', true)
      );
      
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        Alert.alert('Error', 'Invalid watch key');
        return;
      }

      const watchedDoc = querySnapshot.docs[0];
      const watchedData = watchedDoc.data();

      console.log('Connected to watched user:', watchedData);

      // Set up real-time location updates
      const unsubscribe = onSnapshot(
        doc(firestore, 'watched_users', watchedDoc.id),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            console.log('Received location update:', data.currentLocation);
            if (data.currentLocation) {
              setWatchedLocation(data.currentLocation);
            }
          }
        }
      );

      // Update the watched user's document
      await updateDoc(doc(firestore, 'watched_users', watchedDoc.id), {
        isWatcherConnected: true,
        watcherId: loggedInUser.uid
      });

      setWatchedUserData({
        id: watchedDoc.id,
        ...watchedData,
        unsubscribe
      });

      if (watchedData.currentLocation) {
        setWatchedLocation(watchedData.currentLocation);
      }

      setIsConnected(true);
      Alert.alert('Success', 'Connected to watched user successfully');

    } catch (error) {
      console.error('Error connecting to watched user:', error);
      Alert.alert('Error', 'Failed to connect to watched user: ' + error.message);
    } finally {
      setIsConnecting(false);
    }
  };

  

  useEffect(() => {
    return () => {
      if (watchedUserData?.unsubscribe) {
        watchedUserData.unsubscribe();
      }
    };
  }, [watchedUserData]);

  useEffect(() => {
    console.log('Current user:', loggedInUser?.uid);
    console.log('Watched user:', watchedUser);
  }, [loggedInUser, watchedUser]);

  useEffect(() => {
    if (startPoint && endPoint) {
      fetchRoute();
    } else {
      setRouteCoordinates([]);
      setRouteDistance(null);
      setRouteDuration(null);
    }
  }, [startPoint, endPoint]);

  useEffect(() => {
    if (loggedInUser) {
      loadSavedLocations();
    }
  }, [loggedInUser]);

  useEffect(() => {
    const loadActiveConnections = async () => {
      if (!loggedInUser?.uid) return;

      const connectionsQuery = query(
        collection(firestore, 'watch_connections'),
        where('watcherId', '==', loggedInUser.uid),
        where('isActive', '==', true)
      );

      const unsubscribe = onSnapshot(connectionsQuery, async (snapshot) => {
        const connections = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Load watched user details for each connection
        const watchedUsers = await Promise.all(
          connections.map(async (conn) => {
            const userDoc = await getDoc(doc(firestore, 'users', conn.watchedUserId));
            return {
              ...conn,
              watchedUserDetails: userDoc.data()
            };
          })
        );

        setWatchedUsers(watchedUsers);
      });

      return () => unsubscribe();
    };

    loadActiveConnections();
  }, [loggedInUser]);

  useEffect(() => {
    if (loggedInUser) {
      const loadExistingConnection = async () => {
        try {
          // Query for active connections where this user is the watcher
          const q = query(
            collection(firestore, 'watched_users'),
            where('watcherId', '==', loggedInUser.uid),
            where('isWatcherConnected', '==', true)
          );

          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            // Found existing connection
            const watchedDoc = querySnapshot.docs[0];
            const watchedData = watchedDoc.data();
            
            console.log('Found existing connection:', watchedData);
            
            // Restore the connection
            setWatchedUserData({
              id: watchedDoc.id,
              ...watchedData
            });
            
            // Set up location listener
            const unsubscribe = onSnapshot(
              doc(firestore, 'watched_users', watchedDoc.id),
              (snapshot) => {
                if (snapshot.exists()) {
                  const data = snapshot.data();
                  if (data.currentLocation) {
                    setWatchedLocation(data.currentLocation);
                  }
                }
              }
            );

            return () => unsubscribe();
          }
        } catch (error) {
          console.error('Error loading existing connection:', error);
        }
      };

      loadExistingConnection();
    }
  }, [loggedInUser]);

  const loadSavedLocations = async () => {
    if (!loggedInUser) {
      console.log('No user logged in');
      return;
    }
    
    setIsLoading(true);
    try {
      const locationsRef = collection(firestore, 'saved_locations');
      const q = query(locationsRef, where('userId', '==', loggedInUser.uid));
      const querySnapshot = await getDocs(q);
      
      const loadedLocations = querySnapshot.docs.map(doc => {
        const data = doc.data();
        // Add null checks and provide default values
        return {
          id: doc.id,
          name: data.name || 'Unnamed Location',
          coordinate: data.coordinate ? {
            latitude: data.coordinate.latitude || 0,
            longitude: data.coordinate.longitude || 0
          } : {
            latitude: 0,
            longitude: 0
          },
          userId: data.userId,
          createdAt: data.createdAt
        };
      }).filter(location => 
        //remove locations with invalid coords
        location.coordinate.latitude !== 0 && 
        location.coordinate.longitude !== 0
      );
      
      console.log('Loaded locations:', loadedLocations); // debuging logs 
      setLocations(loadedLocations);
      setSavedLocations(loadedLocations);
    } catch (error) {
      console.error('Error loading locations:', error);
      Alert.alert('Error', 'Failed to load saved locations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavedLocationSelect = (location) => {
    if (isProcessingRoute) {
      console.log('Already processing a route');
      return;
    }

    if (!location?.coordinate?.latitude || !location?.coordinate?.longitude) {
      console.log('Invalid location selected:', location);
      return;
    }

    Alert.alert(
      'Set Location',
      'Do you want to set this as start or end point?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Point',
          onPress: () => {
            try {
              const newStartPoint = {
                coordinate: {
                  latitude: Number(location.coordinate.latitude),
                  longitude: Number(location.coordinate.longitude)
                },
                name: location.name || 'Start Point'
              };
              console.log('Setting start point:', newStartPoint);
              if (isValidCoordinate(newStartPoint.coordinate)) {
                setStartPoint(newStartPoint);
                setIsRouteCalculationEnabled(false); // Disable route calculation when points change
              }
            } catch (error) {
              console.error('Error setting start point:', error);
            }
          }
        },
        {
          text: 'End Point',
          onPress: () => {
            try {
              const newEndPoint = {
                coordinate: {
                  latitude: Number(location.coordinate.latitude),
                  longitude: Number(location.coordinate.longitude)
                },
                name: location.name || 'End Point'
              };
              console.log('Setting end point:', newEndPoint);
              if (isValidCoordinate(newEndPoint.coordinate)) {
                setEndPoint(newEndPoint);
                setIsRouteCalculationEnabled(false); // Disable route calculation when points change
              }
            } catch (error) {
              console.error('Error setting end point:', error);
            }
          }
        }
      ]
    );
  };

  const saveLocation = async (name, coordinate) => {
    if (!loggedInUser || !name || !coordinate) return;

    try {
      const locationData = {
        name,
        coordinate,
        userId: loggedInUser.uid,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(firestore, 'saved_locations'), locationData);
      setSavedLocations([...savedLocations, { id: docRef.id, ...locationData }]);
      Alert.alert('Success', 'Location saved successfully');
    } catch (error) {
      console.error('Error saving location:', error);
      Alert.alert('Error', 'Failed to save location');
    }
  };

  

  const addLocation = async () => {
    if (newLocation.trim()) {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          newLocation
        )}&key=${GOOGLE_MAPS_API_KEY}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });
        
        const data = await response.json();
        
        if (data.status === 'REQUEST_DENIED') {
          throw new Error(data.error_message || 'Request denied');
        }

        if (data.results && data.results[0]) {
          const { lat, lng } = data.results[0].geometry.location;
          const address = data.results[0].formatted_address;
          addLocationToList(address, { latitude: lat, longitude: lng });
        } else {
          throw new Error('Location not found');
        }
      } catch (error) {
        console.error('Error geocoding address:', error);
        Alert.alert('Error', `Could not find location: ${error.message}`);
      }
    }
  };

  const addLocationToList = async (address, coordinate) => {
    const newLocationObj = {
      id: Date.now().toString(),
      name: address,
      coordinate: coordinate,
    };

    setLocations(prev => [...prev, newLocationObj]);
    await saveLocation(newLocationObj.name, newLocationObj.coordinate);
    
    setNewLocation('');
    setTempMarker(null);
    setTempAddress(null);
    setIsPickingLocation(false);
  };

  

 

  /**
   * Fetches and calculates a route between two points using Google Maps Directions API
   * This function handles pedestrian-friendly route creation with obstacle awareness
   * 
   * Flow:
   * 1. Validates start and end points
   * 2. Makes API call to Google Maps
   * 3. Processes route data for pedestrian navigation
   * 4. Updates UI with route information
   * 5. Syncs route with watched user if connected
   */
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  const fetchRoute = async () => {
    // Validate that both start and end points are set
    if (!startPoint?.coordinate || !endPoint?.coordinate) {
      Alert.alert('Error', 'Please set both start and end points');
      return;
    }

    // Check if route calculation is enabled
    if (!isRouteCalculationEnabled) {
      console.log('Route calculation is disabled');
      return;
    }

    // Check if enough time has passed since last route update
    const now = Date.now();
    if (lastRouteUpdate && (now - lastRouteUpdate) < ROUTE_UPDATE_INTERVAL) {
      console.log('Skipping route update - too soon since last update');
      return;
    }

    // Set loading state to show progress indicator
    setIsLoadingRoute(true);
    try {
      const startLat = startPoint.coordinate.latitude;
      const startLng = startPoint.coordinate.longitude;
      const endLat = endPoint.coordinate.latitude;
      const endLng = endPoint.coordinate.longitude;

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${endLat},${endLng}&mode=walking&key=${GOOGLE_MAPS_API_KEY}`
      );

      const data = await response.json();
      if (data.routes.length === 0) {
        throw new Error('No route found');
      }

      const route = data.routes[0];
      const decodedPoints = decodePolyline(route.overview_polyline.points);
      const steps = route.legs[0].steps.map(step => ({
        instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
        distance: step.distance.text,
        duration: step.duration.text,
        startLocation: {
          latitude: step.start_location.lat,
          longitude: step.start_location.lng
        },
        endLocation: {
          latitude: step.end_location.lat,
          longitude: step.end_location.lng
        }
      }));

      setRouteCoordinates(decodedPoints);
      setRouteDistance(route.legs[0].distance.text);
      setRouteDuration(route.legs[0].duration.text);
      setRouteSteps(steps);

      // Only update the watched user's route if navigation is active and user is connected
      if (watchedUserData?.id && isNavigating) {
        const currentRoute = {
          startPoint: {
            latitude: startLat,
            longitude: startLng,
            name: startPoint.name || 'Start'
          },
          endPoint: {
            latitude: endLat,
            longitude: endLng,
            name: endPoint.name || 'End'
          },
          distance: route.legs[0].distance.text,
          duration: route.legs[0].duration.text,
          steps: steps,
          routePolyline: decodedPoints,
          timestamp: new Date().toISOString()
        };

        // Get the current route from Firestore
        const watchedUserDoc = await getDoc(doc(firestore, 'watched_users', watchedUserData.id));
        const currentWatchedRoute = watchedUserDoc.data()?.assignedRoute;

        // Only update if the route has changed and navigation is active
        if ((!currentWatchedRoute || 
            JSON.stringify(currentWatchedRoute.routePolyline) !== JSON.stringify(currentRoute.routePolyline)) &&
            isNavigating) {
          await updateDoc(doc(firestore, 'watched_users', watchedUserData.id), {
            assignedRoute: currentRoute
          });
          setLastRouteUpdate(now);
        }
      }
    } catch (error) {
      console.error('Route calculation error:', error);
      Alert.alert(
        'Route Calculation Error',
        'Unable to calculate pedestrian route. Please try different points.'
      );
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Helper function to decode Google's polyline format
  function decodePolyline(encoded) {
    if (!encoded) return [];

    const poly = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;

      poly.push({
        latitude: lat * 1e-5,
        longitude: lng * 1e-5
      });
    }

    return poly;
  }

  

  

  

  // Add this useEffect for loading obstacles
  useEffect(() => {
    const loadObstacles = async () => {
      try {
        const obstaclesRef = collection(firestore, 'obstacles');
        const querySnapshot = await getDocs(obstaclesRef);
        const loadedObstacles = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setObstacles(loadedObstacles);
      } catch (error) {
        console.error('Error loading obstacles:', error);
      }
    };

    loadObstacles();
  }, []);

  // Update useEffect to use watchedUserId
  useEffect(() => {
    if (watchedUserId) {
      console.log('Setting up location listener for watched user:', watchedUserId);
      const watchedRef = doc(firestore, 'watched_users', watchedUserId);
      
      const unsubscribe = onSnapshot(watchedRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.currentLocation) {
            setWatchedLocation(data.currentLocation);
          }
        }
      });

      return () => unsubscribe();
    }
  }, [watchedUserId]);

  // Add this useEffect to check authentication status
  useEffect(() => {
    if (!loggedInUser) {
      console.log('No user is logged in');
    } else {
      console.log('User is logged in:', loggedInUser.uid);
    }
  }, [loggedInUser]);

  // Update the saveObstacle function with proper authentication check
  const saveObstacle = async () => {
    if (!tempObstacle || !obstacleDescription) {
      Alert.alert('Error', 'Please provide obstacle description');
      return;
    }

    if (!loggedInUser?.uid) {
      Alert.alert('Authentication Required', 'Please log in to add obstacles');
      return;
    }

    try {
      const obstacleData = {
        location: tempObstacle,
        description: obstacleDescription,
        createdAt: new Date().toISOString(),
        userId: loggedInUser.uid
      };

      const docRef = await addDoc(collection(firestore, 'obstacles'), obstacleData);
      
      setObstacles([...obstacles, { ...obstacleData, id: docRef.id }]);
      setShowObstacleModal(false);
      setObstacleDescription('');
      setTempObstacle(null);

      Alert.alert('Success', 'Obstacle marker added successfully');
    } catch (error) {
      console.error('Error saving obstacle:', error);
      Alert.alert('Error', 'Failed to save obstacle');
    }
  };

  

  // Get and watch location updates
  useEffect(() => {
    let locationSubscription;

    const startLocationTracking = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required');
        return;
      }

      // Get initial location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      // Watch for location updates
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 5
        },
        (location) => {
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude
          };
          setCurrentLocation(newLocation);
          
          // Center map on new location
          if (mapRef.current) {
            mapRef.current.animateToRegion({
              ...newLocation,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }, 1000);
          }
        }
      );
    };

    startLocationTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  const calculateDirections = (start, end) => {
    const R = 6371e3;
    const φ1 = (start.latitude * Math.PI) / 180;
    const φ2 = (end.latitude * Math.PI) / 180;
    const Δφ = ((end.latitude - start.latitude) * Math.PI) / 180;
    const Δλ = ((end.longitude - start.longitude) * Math.PI) / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    const bearing = (θ * 180 / Math.PI + 360) % 360;

    return { distance, bearing };
  };

  const getCardinalDirection = (bearing) => {
    const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  };

  const speakDirections = (distance, bearing) => {
    // Only speak if this is the watcher's view and navigation is on
    if (!isWatcher || !isNavigating) return;

    const direction = getCardinalDirection(bearing);
    const distanceInMeters = Math.round(distance);
    const message = `The person is ${distanceInMeters} meters to the ${direction}`;
    Speech.speak(message, {
      language: 'en',
      pitch: 1,
      rate: 0.8,
    });
  };

  useEffect(() => {
    let navigationInterval;

    if (isNavigating && currentLocation && watchedLocation) {
      navigationInterval = setInterval(() => {
        const { distance, bearing } = calculateDirections(currentLocation, watchedLocation);
        setDistanceToWatched(distance);
        setBearingToWatched(bearing);
        speakDirections(distance, bearing);
      }, 10000);
    }

    return () => {
      if (navigationInterval) {
        clearInterval(navigationInterval);
      }
    };
  }, [isNavigating, currentLocation, watchedLocation]);


  // Add this function near your other functions
  const disconnectFromWatched = async () => {
    try {
      if (watchedUserData) {
        // Stop navigation first
        if (isNavigating) {
          setIsNavigating(false);
        }
        Speech.stop(); // Stop any ongoing speech

        // Update the watched user's document
        await updateDoc(doc(firestore, 'watched_users', watchedUserData.id), {
          isWatcherConnected: false,
          isNavigating: false,
          assignedRoute: null // Clear the route
        });

        // Clean up the listener
        if (watchedUserData.unsubscribe) {
          watchedUserData.unsubscribe();
        }

        // Reset states
        setWatchedUserData(null);
        setWatchedLocation(null);
        setIsConnected(false);
        setWatchKey('');
        setIsRouteCalculationEnabled(false);

        // Clear route information
        setRouteCoordinates([]);
        setRouteDistance(null);
        setRouteDuration(null);
        setRouteSteps([]);
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      Alert.alert('Error', 'Failed to disconnect');
    }
  };

  

  // Add this useEffect to load saved locations
  useEffect(() => {
    const loadSavedLocations = async () => {
      if (!loggedInUser?.uid) return;

      try {
        const q = query(
          collection(firestore, 'saved_locations'),
          where('userId', '==', loggedInUser.uid)
        );
        const querySnapshot = await getDocs(q);
        const locations = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setSavedLocations(locations);
      } catch (error) {
        console.error('Error loading saved locations:', error);
      }
    };

    loadSavedLocations();
  }, [loggedInUser]);

  // Add this to handle saving current location
 

  // Remove or modify the useEffect that triggers route calculation
  useEffect(() => {
    // Clear the route if either point is removed
    if (!startPoint || !endPoint) {
      setRouteCoordinates([]);
      setRouteDistance(null);
      setRouteDuration(null);
      setIsRouteCalculationEnabled(false);
      // Clear route from Firestore if user is connected
      if (watchedUserData?.id) {
        updateDoc(doc(firestore, 'watched_users', watchedUserData.id), {
          assignedRoute: null
        });
      }
    }
  }, [startPoint, endPoint]);

  // Add this helper function to get cardinal directions
  

  // Add this useEffect to handle obstacles from props
  useEffect(() => {
    if (!isWatcher) {
      // If this is the watched view, use the obstacles passed from props
      setObstacles(obstacles);
    }
  }, [isWatcher, obstacles]);

  // Add this function to handle navigation state changes
  const toggleNavigation = async () => {
    if (!watchedUserData?.id) return;

    try {
      const newNavigationState = !isNavigating;
      setIsNavigating(newNavigationState);

      // Update the watched user's navigation state and route
      await updateDoc(doc(firestore, 'watched_users', watchedUserData.id), {
        isNavigating: newNavigationState,
        // Only clear route when stopping navigation
        ...(newNavigationState ? {} : { assignedRoute: null }),
        timestamp: new Date().toISOString()
      });

      // If navigation is stopped, also stop voice help and clear route
      if (!newNavigationState) {
        Speech.stop(); // Stop any ongoing speech
        setRouteCoordinates([]);
        setRouteDistance(null);
        setRouteDuration(null);
        setRouteSteps([]);
        setCompletedRouteCoordinates([]);
        setRemainingRouteCoordinates([]);
      }

    } catch (error) {
      console.error('Error toggling navigation:', error);
      Alert.alert('Error', 'Failed to update navigation state');
    }
  };

  // Modify the handleCalculateRoute function to be more strict
  const handleCalculateRoute = () => {
    if (!isNavigating) {
      Alert.alert('Navigation Required', 'Please start navigation before calculating a route');
      return;
    }
    setIsRouteCalculationEnabled(true);
    fetchRoute();
  };

  // Add the calculateRoute function
  const calculateRoute = async () => {
    if (!watchedUserData?.id) {
      Alert.alert('Error', 'Please connect to a watched user first');
      return;
    }

    if (!endPoint) {
      Alert.alert('Error', 'Please set an end point');
      return;
    }

    try {
      setIsLoadingRoute(true);

      // Get the watched user's current location
      console.log('Fetching location for watched user:', watchedUserData.id);
      const watchedUserDoc = await getDoc(doc(firestore, 'watched_users', watchedUserData.id));
      
      if (!watchedUserDoc.exists()) {
        console.error('Watched user document does not exist');
        Alert.alert('Error', 'Watched user not found');
        return;
      }

      const watchedUserLocation = watchedUserDoc.data();
      console.log('Watched user data:', watchedUserLocation);
      
      if (!watchedUserLocation?.currentLocation) {
        console.error('No current location in watched user data');
        Alert.alert('Error', 'Watched user\'s location is not available. Please wait for location updates.');
        return;
      }

      // Use watched user's location as start point
      const startLat = watchedUserLocation.currentLocation.latitude;
      const startLng = watchedUserLocation.currentLocation.longitude;
      const endLat = endPoint.coordinate.latitude;
      const endLng = endPoint.coordinate.longitude;

      console.log('Calculating route from:', { startLat, startLng }, 'to:', { endLat, endLng });

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${endLat},${endLng}&mode=walking&key=${GOOGLE_MAPS_API_KEY}`
      );

      const data = await response.json();
      if (data.routes.length === 0) {
        throw new Error('No route found');
      }

      const route = data.routes[0];
      const decodedPoints = decodePolyline(route.overview_polyline.points);
      const steps = route.legs[0].steps.map(step => ({
        instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
        distance: step.distance.text,
        duration: step.duration.text,
        startLocation: {
          latitude: step.start_location.lat,
          longitude: step.start_location.lng
        },
        endLocation: {
          latitude: step.end_location.lat,
          longitude: step.end_location.lng
        }
      }));

      // Create the route object
      const routeObject = {
        startPoint: {
          latitude: startLat,
          longitude: startLng,
          name: 'Current Location'
        },
        endPoint: {
          latitude: endLat,
          longitude: endLng,
          name: endPoint.name || 'End'
        },
        distance: route.legs[0].distance.text,
        duration: route.legs[0].duration.text,
        steps: steps,
        routePolyline: decodedPoints,
        timestamp: new Date().toISOString()
      };

      // Update the watched user's route and start navigation
      await updateDoc(doc(firestore, 'watched_users', watchedUserData.id), {
        assignedRoute: routeObject,
        isNavigating: true
      });

      // Update local state
      setRouteInfo(routeObject);
      setRouteCoordinates(decodedPoints);
      setRouteDistance(route.legs[0].distance.text);
      setRouteDuration(route.legs[0].duration.text);
      setRouteSteps(steps);
      setIsNavigating(true);

      // Fit map to show the entire route
      if (mapRef.current && decodedPoints.length > 0) {
        mapRef.current.fitToCoordinates(decodedPoints, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true
        });
      }

    } catch (error) {
      console.error('Error calculating route:', error);
      Alert.alert('Error', 'Failed to calculate route: ' + error.message);
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Add this useEffect to track the watched user's progress along the route
  useEffect(() => {
    if (watchedUserData?.currentLocation && routeCoordinates.length > 0) {
      // Find the closest point on the route to the current location
      let closestPointIndex = 0;
      let minDistance = Infinity;

      routeCoordinates.forEach((coord, index) => {
        const distance = calculateDistance(
          watchedUserData.currentLocation.latitude,
          watchedUserData.currentLocation.longitude,
          coord.latitude,
          coord.longitude
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestPointIndex = index;
        }
      });

      // Only consider a point as completed if the user is within 20 meters of it
      if (minDistance <= 20) {
        // Split the route into completed and remaining portions
        const completed = routeCoordinates.slice(0, closestPointIndex + 1);
        const remaining = routeCoordinates.slice(closestPointIndex);

        setCompletedRouteCoordinates(completed);
        setRemainingRouteCoordinates(remaining);
      }
    }
  }, [watchedUserData?.currentLocation, routeCoordinates]);

  // Add the calculateDistance function
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

  // Add the renderRouteControls function
  const renderRouteControls = () => {
    if (!isConnected) return null;

    return (
      <View style={styles.routeControls}>
        <TouchableOpacity
          style={styles.calculateButton}
          onPress={calculateRoute}
        >
          <Text style={styles.buttonText}>Calculate Route</Text>
        </TouchableOpacity>
        {routeInfo && (
          <TouchableOpacity
            style={[styles.navigationButton, isNavigating && styles.navigationButtonActive]}
            onPress={toggleNavigation}
          >
            <Text style={styles.buttonText}>
              {isNavigating ? 'Stop Navigation' : 'Start Navigation'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {!isConnected ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter Watch Key"
            value={watchKey}
            onChangeText={handleWatchKeyChange}
            autoCapitalize="characters"
            maxLength={6}
          />
          <TouchableOpacity
            style={styles.connectButton}
            onPress={connectToWatched}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={TextStyles.buttonText}>Connect</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.connectedView}>
          <View style={styles.connectedContainer}>
            <Text style={TextStyles.header}>Connected to Watch Key: {watchKey}</Text>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={disconnectFromWatched}
            >
              <Text style={TextStyles.buttonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.locationControls}>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={() => setIsAddingLocation(true)}
            >
              <Text style={styles.buttonText}>Add Location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.locationButton, routeCoordinates.length > 0 && styles.activeButton]}
              onPress={handleCalculateRoute}
              disabled={!startPoint || !endPoint}
            >
              <Text style={styles.buttonText}>Create Route</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={Platform.OS === 'ios' ? PROVIDER_DEFAULT : PROVIDER_GOOGLE}
              initialRegion={watchedLocation ? {
                latitude: Number(watchedLocation.latitude) || 0,
                longitude: Number(watchedLocation.longitude) || 0,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
              } : defaultRegion}
              onLayout={() => setIsMapReady(true)}
              showsUserLocation
              loadingEnabled
              onLongPress={(e) => {
                try {
                  const coordinate = e.nativeEvent.coordinate;
                  if (!coordinate?.latitude || !coordinate?.longitude) {
                    console.log('Invalid coordinate from long press');
                    return;
                  }

                  Alert.alert(
                    'Add Point',
                    'What would you like to add at this location?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Start Point',
                        onPress: () => {
                          const newStartPoint = {
                            coordinate: {
                              latitude: Number(coordinate.latitude),
                              longitude: Number(coordinate.longitude)
                            },
                            name: 'Start Point'
                          };
                          if (isValidCoordinate(newStartPoint.coordinate)) {
                            setStartPoint(newStartPoint);
                          }
                        }
                      },
                      {
                        text: 'End Point',
                        onPress: () => {
                          const newEndPoint = {
                            coordinate: {
                              latitude: Number(coordinate.latitude),
                              longitude: Number(coordinate.longitude)
                            },
                            name: 'End Point'
                          };
                          if (isValidCoordinate(newEndPoint.coordinate)) {
                            setEndPoint(newEndPoint);
                          }
                        }
                      },
                      {
                        text: 'Add Obstacle',
                        onPress: () => {
                          setTempObstacle(coordinate);
                          setShowObstacleModal(true);
                        }
                      }
                    ]
                  );
                } catch (error) {
                  console.error('Error handling map long press:', error);
                }
              }}
            >
              {isMapReady && watchedLocation && (
                <Marker
                  coordinate={{
                    latitude: Number(watchedLocation.latitude) || 0,
                    longitude: Number(watchedLocation.longitude) || 0,
                  }}
                  title="Watched User"
                  description="Current location"
                  pinColor="blue"
                />
              )}
              {startPoint && isValidCoordinate(startPoint.coordinate) && (
                <Marker
                  coordinate={{
                    latitude: Number(startPoint.coordinate.latitude),
                    longitude: Number(startPoint.coordinate.longitude),
                  }}
                  title={startPoint.name || "Start"}
                  pinColor="green"
                />
              )}
              {endPoint && isValidCoordinate(endPoint.coordinate) && (
                <Marker
                  coordinate={{
                    latitude: Number(endPoint.coordinate.latitude),
                    longitude: Number(endPoint.coordinate.longitude),
                  }}
                  title={endPoint.name || "End"}
                  pinColor="red"
                />
              )}
              {routeCoordinates && routeCoordinates.length > 0 && (
                <Polyline
                  coordinates={routeCoordinates}
                  strokeWidth={4}
                  strokeColor="#2196F3"
                  lineDashPattern={[1]}
                />
              )}
              {obstacles.map((obstacle) => (
                <Marker
                  key={obstacle.id}
                  coordinate={obstacle.location}
                  title="Obstacle"
                  description={obstacle.description}
                  pinColor="yellow"
                >
                  <View style={styles.obstacleMarker}>
                    <MaterialIcons name="warning" size={24} color="#FFA500" />
                  </View>
                </Marker>
              ))}
              {/* Completed route (gray) */}
              {completedRouteCoordinates.length > 0 && (
                <Polyline
                  coordinates={completedRouteCoordinates}
                  strokeWidth={4}
                  strokeColor="#808080"
                  zIndex={1}
                />
              )}

              {/* Remaining route (blue) */}
              {remainingRouteCoordinates.length > 0 && (
                <Polyline
                  coordinates={remainingRouteCoordinates}
                  strokeWidth={4}
                  strokeColor="#007AFF"
                  zIndex={2}
                />
              )}
            </MapView>

            {renderRouteControls()}
          </View>
        </View>
      )}

      {/* Location Input Modal */}
      <Modal
        visible={isAddingLocation}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <TextInput
              style={styles.locationInput}
              placeholder="Enter location name or address"
              value={newLocation}
              onChangeText={setNewLocation}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setIsAddingLocation(false);
                  setNewLocation('');
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={addLocation}
              >
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add this before the final closing View tag */}
      <Modal
        visible={showObstacleModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Obstacle</Text>
            <TextInput
              style={styles.locationInput}
              placeholder="Describe the obstacle"
              value={obstacleDescription}
              onChangeText={setObstacleDescription}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowObstacleModal(false);
                  setObstacleDescription('');
                  setTempObstacle(null);
                }}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={saveObstacle}
              >
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  connectedView: {
    flex: 1,
    padding: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginRight: 10,
    backgroundColor: 'white',
  },
  connectButton: {
    backgroundColor: '#007BFF',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  connectedContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  mapContainer: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  watchedLocationContainer: {
    padding: 10,
    backgroundColor: '#f8f8f8',
  },
  watchedLocationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  useLocationButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  savedLocationsMenu: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    height: 50,
  },
  savedLocationItem: {
    backgroundColor: 'white',
    padding: 10,
    marginHorizontal: 5,
    borderRadius: 5,
    elevation: 3,
  },
  savedLocationText: {
    fontSize: 14,
  },
  locationControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  locationButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 8,
    flex: 0.5,
  },
  activeButton: {
    backgroundColor: '#28a745',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    margin: 20,
    padding: 20,
    borderRadius: 8,
  },
  locationInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    padding: 10,
    borderRadius: 8,
    flex: 0.48,
  },
  cancelButton: {
    backgroundColor: '#dc3545',
  },
  saveButton: {
    backgroundColor: '#28a745',
  },
  savedLocationsList: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    maxHeight: 50,
  },
  locationName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  routeInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 8,
    elevation: 2,
  },
  routeText: {
    fontSize: 14,
    marginBottom: 5,
  },
  calculateButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
    marginVertical: 5,
  },
  routeInfoContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  routeInfoText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 10
  },
  navigationButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
    marginVertical: 5,
  },
  navigationButtonActive: {
    backgroundColor: '#28a745',
  },
  obstacleMarker: {
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFA500',
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  obstacleWarning: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: '#FFA500',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningText: {
    color: 'white',
    marginLeft: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
  routeControls: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    zIndex: 1,
    gap: 10,
  },
  calculateButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  navigationButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  navigationButtonActive: {
    backgroundColor: '#28a745',
  },
});

// Add prop types validation
LocationPicker.propTypes = {
  isWatcher: PropTypes.bool,
  watchedUser: PropTypes.shape({
    id: PropTypes.string,
    currentLocation: PropTypes.shape({
      latitude: PropTypes.number,
      longitude: PropTypes.number,
    }),
  }),
  onDisconnect: PropTypes.func,
  obstacles: PropTypes.array,
};

LocationPicker.defaultProps = {
  isWatcher: false,
  watchedUser: null,
  onDisconnect: () => {},
  obstacles: [],
};

export default LocationPicker; 