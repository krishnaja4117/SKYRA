import { useState } from "react";
import { formatDashboardTopRightLocation } from "../services/locationService";

export { formatDashboardTopRightLocation };

function Header({
  currentLocation,
  savedLocation,
  activePage = "Dashboard",
  onNavigate,
  pages = [
    "Dashboard",
    "WeatherGPT",
    "Forecast & History",
    "Alerts & Advisories",
    "Emergency Response",
    "Settings",
  ],
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const formattedLocationName = formatDashboardTopRightLocation(currentLocation);

  return (
    <header className="skyra-header">
      <div className="brand-row">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>

          <div>
            <h1>SKYRA</h1>
            <p className="brand-tagline">Smart Disaster Awareness</p>
          </div>
        </div>

        <button
          type="button"
          className="menu-toggle"
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ☰
        </button>
      </div>

      <div className={`header-controls ${menuOpen ? "open" : ""}`}>
        <nav className="skyra-nav" aria-label="Main navigation">
          {pages.map((page) => (
            <button
              key={page}
              type="button"
              className={activePage === page ? "nav-button active" : "nav-button"}
              onClick={() => {
                onNavigate?.(page);
                setMenuOpen(false);
              }}
            >
              {page}
            </button>
          ))}
        </nav>

        <div className="location-block">
          <div className="location-item">
            <span className="location-label">Current location</span>
            <strong title={formattedLocationName}>{formattedLocationName}</strong>
            <span className="location-meta">{currentLocation?.area ?? "Awaiting update"}</span>
          </div>

          <div className="location-divider" />

          <div className="location-item">
            <span className="location-label">Saved location</span>
            <strong>{savedLocation?.name ?? "Home"}</strong>
            <span className="location-meta">{savedLocation?.address ?? "Not saved"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;