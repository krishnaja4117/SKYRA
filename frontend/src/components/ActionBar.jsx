/**
 * [LEGACY PROTOTYPE] ActionBar.jsx
 * Status: Phase 0 prototype component. Kept for reference and backward compatibility.
 * Scheduled for review/refactoring in Phase 2.
 */
function ActionBar() {
  return (
    <nav className="action-bar" aria-label="Quick access">
      <button type="button" className="action-btn ask">
        🤖 Ask Skyra
      </button>
      <button type="button" className="action-btn voice">
        🎤 Voice
      </button>
      <button type="button" className="action-btn sos">
        🆘 SOS
      </button>
    </nav>
  );
}

export default ActionBar;
