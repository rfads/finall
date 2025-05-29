// stuff we need to import
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Platform, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Alert } from 'react-native';
import axios from 'axios';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import * as Audio from 'expo-av';

const GOOGLE_MAPS_API_KEY = 'AIzaSyDsYG6T39ZhP6D83HUoVF1d70RllQdnq2Q';

// where the map starts (israel)
const initialRegion = {
  latitude: 31.964819,
  longitude: 34.810864,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

// Get the server URL based on platform
const getServerUrl = () => {
  return `https://c42d-93-172-224-146.ngrok-free.app`;
};

function Map() {
  // bunch of states we need for the map to work
  const [places, setPlaces] = useState([]);
  const [mapRef, setMapRef] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showList, setShowList] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [mapKey, setMapKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState(null);

  // load places when component mounts
  useEffect(() => {
    fetchAccessiblePlaces();
  }, []);

  // Request audio permissions
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Please grant microphone access to use audio features.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('Error requesting audio permissions:', error);
      }
    })();
  }, []);

  // Memoize the markers to prevent unnecessary re-renders
  const markers = useMemo(() => {
    if (!places || !Array.isArray(places)) return [];
    
    // Limit the number of markers to prevent performance issues
    const limitedPlaces = places.slice(0, 10);
    console.log('Creating markers for', limitedPlaces.length, 'places');
    
    return limitedPlaces.map((place, index) => {
      try {
        if (!place || !place.geometry || !place.geometry.location) {
          return null;
        }

        const lat = Number(place.geometry.location.lat);
        const lng = Number(place.geometry.location.lng);

        if (isNaN(lat) || isNaN(lng)) {
          return null;
        }

        return {
          id: place.place_id || `marker-${index}`,
          coordinate: {
            latitude: lat,
            longitude: lng,
          },
          title: place.name || 'Unknown Place',
          description: place.vicinity || 'No address available'
        };
      } catch (error) {
        console.error('Error creating marker:', error);
        return null;
      }
    }).filter(Boolean);
  }, [places]);

  // Memoize the map update function
  const updateMapView = useCallback((markers) => {
    if (!mapRef || !markers.length) return;
    
    try {
      console.log('Updating map view with', markers.length, 'markers');
      mapRef.fitToCoordinates(markers, {
        edgePadding: { top: 70, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    } catch (error) {
      console.error('Error updating map view:', error);
    }
  }, [mapRef]);

  // Update map when markers change
  useEffect(() => {
    if (markers.length > 0 && !showList) {
      const coordinates = markers.map(m => m.coordinate);
      const timer = setTimeout(() => {
        updateMapView(coordinates);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [markers, showList, updateMapView]);

  // Memoize the fetch function
  const fetchAccessiblePlaces = useCallback(async (query = '') => {
    console.log('Starting search with query:', query);
    setLoading(true);
    setErrorMsg(null);
    
    try {
      const baseUrl = getServerUrl();
      // Build the search keyword properly
      const searchKeyword = query.trim() 
        ? query.trim() // Just use the search query directly
        : 'wheelchair accessible';
      
      const params = {
        lat: initialRegion.latitude,
        lng: initialRegion.longitude,
        radius: 1500,
        keyword: searchKeyword
      };

      // Add type parameter only if there's a specific search query
      if (query.trim()) {
        params.type = query.trim().toLowerCase();
      }
      
      console.log('Making API request with params:', params);
      
      const response = await axios.get(`${baseUrl}/api/places`, {
        params,
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      console.log('Raw API Response:', {
        status: response.status,
        data: response.data,
        resultsCount: response.data?.results?.length || 0,
        query: searchKeyword
      });

      if (!response?.data?.results) {
        console.log('No results found');
        setPlaces([]);
        setErrorMsg('No places found');
        return;
      }

      // Log the first few results to see what we're getting
      console.log('First few results:', response.data.results.slice(0, 3).map(place => ({
        name: place.name,
        types: place.types,
        vicinity: place.vicinity
      })));

      // Filter and validate places
      const validPlaces = response.data.results.filter(place => {
        try {
          // Check if place has required data
          if (!place?.geometry?.location?.lat || !place?.geometry?.location?.lng) {
            console.log('Invalid place data:', place);
            return false;
          }

          // If there's a search query, check if place matches it
          if (query.trim()) {
            const placeName = (place.name || '').toLowerCase();
            const placeTypes = (place.types || []).map(t => t.toLowerCase());
            const searchTerms = query.toLowerCase().split(' ');
            
            const matchesSearch = searchTerms.some(term => 
              placeName.includes(term) || 
              placeTypes.some(type => type.includes(term))
            );

            if (!matchesSearch) {
              console.log('Place does not match search:', {
                name: place.name,
                types: place.types,
                searchTerms
              });
              return false;
            }
          }

          return true;
        } catch (e) {
          console.error('Error processing place:', e);
          return false;
        }
      });

      console.log('Valid places after filtering:', validPlaces.length);
      console.log('First few valid places:', validPlaces.slice(0, 3).map(place => ({
        name: place.name,
        types: place.types,
        vicinity: place.vicinity
      })));

      setPlaces(validPlaces);
      
    } catch (error) {
      console.error('Error fetching places:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setErrorMsg('Error fetching places. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []); // Remove searchQuery from dependencies since we pass it as parameter

  // Add useEffect to fetch places when component mounts
  useEffect(() => {
    fetchAccessiblePlaces();
  }, []); // Empty dependency array means this runs once on mount

  // Handle search submission
  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setErrorMsg('Please enter a search term');
      return;
    }
    console.log('Search submitted with query:', searchQuery);
    // Force a new search by incrementing mapKey
    setMapKey(prev => prev + 1);
    fetchAccessiblePlaces(searchQuery);
  }, [searchQuery, fetchAccessiblePlaces]);

  // Memoize the map component
  const renderMap = useMemo(() => {
    return (
      <View style={StyleSheet.absoluteFillObject}>
        <MapView
          key={mapKey}
          ref={setMapRef}
          provider={Platform.OS === 'android' ? 'google' : undefined}
          style={StyleSheet.absoluteFillObject}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton
          onMapReady={() => console.log('Map is ready')}
          onError={(error) => console.error('Map error:', error)}
        >
          {markers.map((marker) => (
            <Marker
              key={marker.id}
              coordinate={marker.coordinate}
              title={marker.title}
              description={marker.description}
              onPress={() => console.log('Marker pressed:', marker.title)}
            />
          ))}
        </MapView>
      </View>
    );
  }, [mapKey, markers, initialRegion]);

  // Memoize the list view
  const renderListView = useMemo(() => {
    if (!places.length) {
      return (
        <View style={styles.noResultsContainer}>
          <Text style={styles.noResultsText}>No accessible places found</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.listContainer}>
        {places.map((place) => (
          <TouchableOpacity 
            key={place.place_id} 
            style={styles.placeCard}
            onPress={() => {
              setShowList(false);
              if (mapRef) {
                const coordinate = {
                  latitude: Number(place.geometry.location.lat),
                  longitude: Number(place.geometry.location.lng),
                };
                setTimeout(() => {
                  mapRef.animateToRegion({
                    ...coordinate,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  });
                }, 100);
              }
            }}
          >
            <Text style={styles.placeName}>{place.name}</Text>
            <Text style={styles.placeVicinity}>{place.vicinity}</Text>
            {place.rating && (
              <Text style={styles.placeRating}>Rating: {place.rating} ⭐</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }, [places, mapRef]);

  // all the stuff that shows on screen
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Search nearby places..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity 
          style={styles.searchButton} 
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {errorMsg && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <TouchableOpacity 
        style={styles.toggleButton} 
        onPress={() => setShowList(!showList)}
      >
        <Text style={styles.toggleButtonText}>
          {showList ? 'Show Map' : 'Show List'}
        </Text>
      </TouchableOpacity>

      {showList ? renderListView : renderMap}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 10,
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 1,
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: 'white',
    borderRadius: 5,
    paddingHorizontal: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 5,
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 10,
    margin: 10,
    borderRadius: 5,
    position: 'absolute',
    top: 60,
    left: 10,
    right: 10,
    zIndex: 1,
  },
  errorText: {
    color: '#c62828',
    textAlign: 'center',
  },
  toggleButton: {
    position: 'absolute',
    top: 60,
    right: 10,
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    zIndex: 1,
  },
  toggleButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  listContainer: {
    flex: 1,
    marginTop: 110,
    padding: 10,
  },
  placeCard: {
    backgroundColor: 'white',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  placeName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  placeVicinity: {
    fontSize: 14,
    color: '#666',
  },
  placeRating: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  callout: {
    backgroundColor: 'white',
    borderRadius: 6,
    borderColor: '#ccc',
    borderWidth: 0.5,
    padding: 15,
    width: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  calloutTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 5,
    color: '#000',
  },
  calloutText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  loaderContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 2,
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 150,
  },
  noResultsText: {
    fontSize: 16,
    color: '#666',
  },
});

// export with memo to prevent unnecessary rerenders
export default React.memo(Map);