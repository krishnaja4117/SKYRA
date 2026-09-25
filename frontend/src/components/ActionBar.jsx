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
