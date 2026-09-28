import { useMemo, useState } from "react";

import Dashboard from "./components/Dashboard";
import WeatherGPT from "./components/WeatherGpt";
import ForecastHistory from "./components/ForecastHistory";
import AlertsAdvisories from "./components/AlertsAdvisories";
import EmergencyResponse from "./components/EmergencyResponse";
import Settings from "./components/Settings";
import AlertBanner from "./components/AlertBanner";
import { useGlobalAlert, runPipeline } from "./services/globalAlertService";

import "./App.css";

const pageNames = [
  "Dashboard",
  "WeatherGPT",
  "Forecast & History",
  "Alerts & Advisories",
  "Emergency Response",
  "Settings",
];

function normalizePageName(page) {
  const value = String(page ?? "").trim().toLowerCase();

  if (!value) return "Dashboard";
  if (value === "home" || value === "dashboard") return "Dashboard";
  if (value === "weathergpt" || value === "weather gpt") return "WeatherGPT";
  if (value === "forecast" || value === "forecast & history" || value === "history") {
    return "Forecast & History";
  }
  if (value === "alerts" || value === "alerts & advisories") return "Alerts & Advisories";
  if (value === "emergency" || value === "emergency response" || value === "sos") {
    return "Emergency Response";
  }
  if (value === "settings") return "Settings";
  return "Dashboard";
}

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [alertSoundEnabled, setAlertSoundEnabled] = useState(true);

  // Get active location and weather data source from global alert service
  const { cache, demo, manualLocation, error } = useGlobalAlert();
  const weatherDataSource = cache?.dataSource || "Open-Meteo (API)";

  const currentLocation = useMemo(() => {
    if (demo) {
      return {
        name: cache?.locationName || "Demo Scenario",
        area: "Simulated — DEMO mode",
        latitude: cache?.latitude ?? null,
        longitude: cache?.longitude ?? null,
      };
    }
    if (manualLocation) {
      return {
        name: manualLocation.displayName,
        area: "(Searched city)",
        latitude: manualLocation.latitude,
        longitude: manualLocation.longitude,
      };
    }
    if (!cache) {
      if (error) {
        return {
          name: "Location unavailable",
          area: "Enable GPS or search city",
          latitude: null,
          longitude: null,
        };
      }
      return {
        name: "Detecting current location…",
        area: "Awaiting GPS update",
        latitude: null,
        longitude: null,
      };
    }
    if (cache.gpsSource === "unavailable") {
      return {
        name: "Location unavailable",
        area: "Enable GPS or search city",
        latitude: null,
        longitude: null,
      };
    }
    if (cache.backendUnavailable) {
      const locName = cache.location?.displayName || cache.locationName || cache.location?.city || "Current location";
      return {
        name: locName,
        city: cache.location?.city || cache.gpsCity,
        district: cache.location?.district,
        state: cache.location?.region || cache.gpsRegion,
        area: cache.location?.region || "Detected via GPS (Backend offline)",
        latitude: cache.latitude,
        longitude: cache.longitude,
      };
    }
    const locName = cache.location?.displayName || cache.locationName || cache.location?.city || "Current location";
    return {
      name: locName,
      city: cache.location?.city || cache.gpsCity,
      district: cache.location?.district,
      state: cache.location?.region || cache.gpsRegion,
      area: cache.location?.region || "Detected via GPS",
      latitude: cache.latitude,
      longitude: cache.longitude,
    };
  }, [cache, demo, manualLocation, error]);

  const savedLocation = useMemo(
    () => ({
      name: "Saved Home",
      address: "Coimbatore, Tamil Nadu",
    }),
    []
  );

  function handleNavigate(page) {
    setActivePage(normalizePageName(page));
  }

  const sharedProps = {
    activePage,
    onNavigate: handleNavigate,
    currentLocation,
    savedLocation,
    pages: pageNames,
    alertSoundEnabled,
    setAlertSoundEnabled,
    weatherDataSource,
  };

  function renderPage() {
    if (activePage === "WeatherGPT") {
      return <WeatherGPT {...sharedProps} />;
    }
    if (activePage === "Forecast & History") {
      return <ForecastHistory {...sharedProps} />;
    }
    if (activePage === "Alerts & Advisories") {
      return <AlertsAdvisories {...sharedProps} />;
    }
    if (activePage === "Emergency Response") {
      return <EmergencyResponse {...sharedProps} />;
    }
    if (activePage === "Settings") {
      return <Settings {...sharedProps} />;
    }
    return <Dashboard {...sharedProps} />;
  }

  return (
    <div className="skyra-app-root">
      <AlertBanner
        activeAlert={cache?.alerts?.activeAlert}
        onNavigate={handleNavigate}
        onAlertAcknowledged={() => runPipeline()}
      />
      {renderPage()}
    </div>
  );
}

export default App;