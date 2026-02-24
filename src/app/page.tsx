'use client';
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [manualLocation, setManualLocation] = useState<string>("");
  const [locationDisplay, setLocationDisplay] = useState<string>("");
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [filteredLocations, setFilteredLocations] = useState<string[]>([]);
  const [hasManualLocation, setHasManualLocation] = useState<boolean>(false);
  const [recentMessages, setRecentMessages] = useState<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const RECENT_MESSAGES_LIMIT = 5;

  const presetLocations = [
    "San Francisco, CA",
    "Detroit, MI",
    "Baltimore, MD",
    "New York City, NY",
  ];

  // ── Input handlers ──────────────────────────────────────────────────────────

  const handleInputChange = (value: string) => {
    setManualLocation(value);
    if (value.trim()) {
      const filtered = presetLocations.filter(l =>
        l.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredLocations(filtered);
      setShowDropdown(filtered.length > 0);
    } else {
      setFilteredLocations(presetLocations);
      setShowDropdown(true);
    }
  };

  const handleLocationSelect = (location: string) => {
    setManualLocation(location);
    setShowDropdown(false);
  };

  const handleInputFocus = () => {
    setFilteredLocations(
      manualLocation.trim()
        ? presetLocations.filter(l => l.toLowerCase().includes(manualLocation.toLowerCase()))
        : presetLocations
    );
    setShowDropdown(true);
  };

  const handleInputBlur = () => {
    setTimeout(() => setShowDropdown(false), 200);
  };

  // ── Geocoding ───────────────────────────────────────────────────────────────

  const geocodeLocation = async (location: string): Promise<{ latitude: number; longitude: number; locationName: string; zip?: string } | null> => {
    try {
      setIsGeocoding(true);
      const isUSZip = /^\d{5}$/.test(location.trim());

      if (isUSZip) {
        const res = await fetch(`https://api.zippopotam.us/us/${location.trim()}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.places?.length > 0) {
            const place = data.places[0];
            return {
              latitude: parseFloat(place.latitude),
              longitude: parseFloat(place.longitude),
              locationName: `${place['place name']}, ${place['state abbreviation']}`,
              zip: location.trim(), // pass zip directly — no server-side reverse geocode needed
            };
          }
        }
      } else {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location.trim())}&limit=1&addressdetails=1&countrycodes=us`,
          { headers: { 'User-Agent': 'smart-billboard-v2/1.0' } }
        );
        const data = await res.json();
        if (data?.length > 0) {
          if (data[0].address?.country_code?.toLowerCase() !== 'us') {
            setError("Please enter a US location only.");
            return null;
          }
          const a = data[0].address;
          const city = a.city || a.town || a.village || a.hamlet;
          return {
            latitude: parseFloat(data[0].lat),
            longitude: parseFloat(data[0].lon),
            locationName: `${city}, ${a.state}`,
          };
        }
      }
      return null;
    } catch (err) {
      console.error('Geocoding error:', err);
      return null;
    } finally {
      setIsGeocoding(false);
    }
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<{ displayName: string | null; zip: string | null }> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=13`,
        { headers: { 'User-Agent': 'smart-billboard-v2/1.0' } }
      );
      if (!res.ok) return { displayName: null, zip: null };
      const data = await res.json();
      const a = data.address || {};
      const city = a.city || a.town || a.village || a.county || '';
      const state = a.state || '';
      const displayName = city && state ? `${city}, ${state}` : city || state || null;
      const zip = a.postcode ? a.postcode.replace(/\s/g, '').slice(0, 5) : null;
      return { displayName, zip };
    } catch {
      return { displayName: null, zip: null };
    }
  };

  // ── Message fetch ───────────────────────────────────────────────────────────

  const fetchMessage = async (
    position?: GeolocationPosition,
    manualCoords?: { latitude: number; longitude: number; locationName?: string; zip?: string },
  ) => {
    setLoading(true);
    setError("");

    const urlParams = new URLSearchParams(window.location.search);
    const locationParam = urlParams.get('location');

    let fetchUrl = "/api/generate-message";
    let requestBody: {
      latitude?: number;
      longitude?: number;
      locationName?: string;
      zip?: string;
      recentMessages?: string[];
    } = { recentMessages: recentMessages.slice(0, RECENT_MESSAGES_LIMIT) };

    if (locationParam) {
      fetchUrl += `?location=${locationParam}`;
    } else if (manualCoords) {
      requestBody = {
        ...requestBody,
        latitude: manualCoords.latitude,
        longitude: manualCoords.longitude,
        locationName: manualCoords.locationName,
        zip: manualCoords.zip,  // forwarded when user typed a zip code directly
      };
      if (manualCoords.locationName) setLocationDisplay(manualCoords.locationName);
    } else if (position) {
      // Reverse geocode to get zip (for service area check) and display name
      // Must complete before the API call so the zip is available server-side
      const geo = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      if (geo.displayName) setLocationDisplay(geo.displayName);
      requestBody = {
        ...requestBody,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        zip: geo.zip ?? undefined,
      };
    } else {
      setError("No location available");
      setLoading(false);
      return;
    }

    fetch(fetchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(requestBody),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          const newMessage = data.message;
          setMessage(newMessage);
          setRecentMessages(prev =>
            [newMessage, ...prev].filter(m => m?.trim()).slice(0, RECENT_MESSAGES_LIMIT)
          );
        } else {
          setError(data.error || "Failed to generate message.");
        }
      })
      .catch(() => setError("Failed to connect to server."))
      .finally(() => setLoading(false));
  };

  // ── Manual location submit ──────────────────────────────────────────────────

  const handleManualLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLocation.trim()) return;
    setShowDropdown(false);

    const coords = await geocodeLocation(manualLocation.trim());
    if (coords) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('manualLocation', JSON.stringify(coords));
        setHasManualLocation(true);
      }
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      await fetchMessage(undefined, coords);
    } else {
      setError("Could not find location. Please try a different US zip code or city name with state.");
      setManualLocation("");
    }
  };

  // ── Clear manual location → use browser geolocation ────────────────────────

  const clearManualLocation = () => {
    if (typeof window !== 'undefined') localStorage.removeItem('manualLocation');
    setManualLocation("");
    setLocationDisplay("");
    setShowDropdown(false);
    setHasManualLocation(false);
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => fetchMessage(position),
        () => { setError("Unable to retrieve your location."); setLoading(false); }
      );
    } else {
      setError("Geolocation is not supported by your browser.");
      setLoading(false);
    }
  };



  // ── Boot ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const locationParam = urlParams.get('location');

    if (locationParam) {
      fetchMessage();
      return;
    }

    const savedLocation = typeof window !== 'undefined' ? localStorage.getItem('manualLocation') : null;
    if (savedLocation) {
      try {
        const coords = JSON.parse(savedLocation) as { latitude: number; longitude: number; locationName: string; zip?: string };
        setManualLocation(coords.locationName);
        setHasManualLocation(true);
        fetchMessage(undefined, coords);
        return;
      } catch {
        if (typeof window !== 'undefined') localStorage.removeItem('manualLocation');
      }
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => fetchMessage(position),
      () => { setError("Unable to retrieve your location."); setLoading(false); }
    );

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={`${styles.billboardContainer} ${styles['purple-theme']} ${error ? styles['error-theme'] : ''}`}>
        <div className={styles.billboard}>
          {loading && <p className={styles.messageBox}>Loading ICF Message...</p>}
          {error && <p className={styles.error}>{error}</p>}
          {!loading && !error && (
            <div className={styles.messageBox}>{message}</div>
          )}
        </div>

        <footer className={styles["brand-footer"]}>
          <div className={styles["brand-left"]}>
            <div className={styles["brand-info"]}>
              {locationDisplay && (
                <span>Location: {locationDisplay}</span>
              )}
            </div>
          </div>
          <div className={styles["brand-logos-vertical"]}>
            <Image
              src="/image/ICF-logo-black.png"
              alt="ICF logo"
              className={styles["brand-icf"]}
              width={100}
              height={50}
            />
          </div>
        </footer>
      </div>

      {/* Location input */}
      <div className={styles.locationInputContainer}>
        <form onSubmit={handleManualLocationSubmit} className={styles.locationForm}>
          <div className={styles.formRow}>
            <div className={styles.locationSection}>
              <label className={styles.sectionLabel}>Location</label>
              <div className={styles.inputRow}>
                <div className={styles.comboboxContainer}>
                  <input
                    type="text"
                    value={manualLocation}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    placeholder="Enter zip code or city name..."
                    className={styles.locationInput}
                    disabled={isGeocoding || loading}
                  />
                  {showDropdown && filteredLocations.length > 0 && (
                    <div className={styles.dropdown}>
                      {filteredLocations.map((location, index) => (
                        <div
                          key={index}
                          className={styles.dropdownItem}
                          onClick={() => handleLocationSelect(location)}
                        >
                          {location}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.buttonGroup}>
                  <button
                    type="submit"
                    disabled={isGeocoding || loading || !manualLocation.trim()}
                    className={styles.locationButton}
                  >
                    {isGeocoding ? 'Finding...' : 'Enter US location'}
                  </button>
                  {hasManualLocation && (
                    <button
                      type="button"
                      onClick={clearManualLocation}
                      className={styles.clearButton}
                      disabled={isGeocoding || loading}
                    >
                      Use Current Location
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
