/**
 * [LEGACY PROTOTYPE] LocationMonitoringCard.jsx
 * Status: Phase 0 prototype component. Kept for reference and backward compatibility.
 * Replaced by inline dashboard panels in Dashboard.jsx. Scheduled for refactoring in Phase 2.
 */
function LocationMonitoringCard({ monitoring }) {
  return (
    <article className="status-card">
      <h2>📍 Location Monitoring</h2>
      <p className="status-pill active">{monitoring.status}</p>
      <ul className="stat-list">
        <li>
          GPS <strong>{monitoring.gps}</strong>
        </li>
        <li>
          Accuracy <strong>{monitoring.accuracy}</strong>
        </li>
        <li>
          Last ping <strong>{monitoring.lastPing}</strong>
        </li>
      </ul>
    </article>
  );
}

export default LocationMonitoringCard;
