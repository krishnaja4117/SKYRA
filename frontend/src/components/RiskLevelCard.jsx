/**
 * [LEGACY PROTOTYPE] RiskLevelCard.jsx
 * Status: Phase 0 prototype component. Kept for reference and backward compatibility.
 * Replaced by inline dashboard panels in Dashboard.jsx. Scheduled for refactoring in Phase 2.
 */
function RiskLevelCard({ risk }) {
  const levelClass = risk.level.toLowerCase();

  return (
    <article className={`status-card risk-card risk-${levelClass}`}>
      <h2>Current Risk Level</h2>

      <p className={`risk-badge ${levelClass}`}>
        {risk.level}
      </p>

      <p className="risk-score">
        Risk Score {risk.score}%
      </p>

      <p className="risk-confidence">
        Confidence {risk.confidence}%
      </p>

      <p className="risk-summary">
        {risk.summary}
      </p>

      <ul className="stat-list">
        {risk.factors.map((factor) => (
          <li key={factor}>{factor}</li>
        ))}
      </ul>
    </article>
  );
}

export default RiskLevelCard;