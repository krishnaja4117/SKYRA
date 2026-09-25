import { useMemo, useState } from "react";

import Dashboard from "./components/Dashboard";
import WeatherGPT from "./components/WeatherGpt";
import ForecastHistory from "./components/ForecastHistory";
import AlertsAdvisories from "./components/AlertsAdvisories";
import EmergencyResponse from "./components/EmergencyResponse";
import Settings from "./components/Settings";
import { useGlobalAlert } from "./services/globalAlertService";

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

  // Get weather data source from global alert service
  const { cache } = useGlobalAlert();
  const weatherDataSource = cache?.dataSource || "Open-Meteo (API)";

  // currentLocation is intentionally omitted from sharedProps.
  // Each page resolves the user's GPS location independently via
  // locationService.js, so no hard-coded location is passed from here.
  // (savedLocation is kept here because it is a user-saved preference,
  //  not a live GPS position.)

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
    savedLocation,
    pages: pageNames,
    alertSoundEnabled,
    setAlertSoundEnabled,
    weatherDataSource,
  };

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

export default App;