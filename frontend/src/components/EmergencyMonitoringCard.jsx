function EmergencyMonitoringCard({ emergency }) {
  return (
    <article className="status-card">
      <h2>🚨 Emergency Monitoring</h2>
      <p className="status-pill safe">{emergency.safetyStatus}</p>
      <ul className="stat-list">
        <li>
          Active alerts <strong>{emergency.alertCount}</strong>
        </li>
        <li>
          Nearest shelter <strong>{emergency.nearestShelter}</strong>
        </li>
        <li>
          Emergency hotline <strong>{emergency.hotline}</strong>
        </li>
      </ul>
    </article>
  );
}

export default EmergencyMonitoringCard;
