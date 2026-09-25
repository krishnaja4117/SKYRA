import { useState } from 'react';
import {
  resolveDisplayValues,
  useGlobalAlert,
} from '../services/globalAlertService';

function loadEmergencyContacts() {
  try {
    const savedContacts = JSON.parse(
      localStorage.getItem('skyraEmergencyContacts') || '[]'
    );

    return Array.isArray(savedContacts) ? savedContacts : [];
  } catch (error) {
    console.error('SKYRA emergency contacts error:', error);
    return [];
  }
}

function EmergencyResponse({ onNavigate }) {
  const { cache, demo, demoScenario } = useGlobalAlert();
  const demoValues = resolveDisplayValues(cache, demo, demoScenario);
  const savedLocation = JSON.parse(
    localStorage.getItem('skyraLastLocation') || 'null'
  );

  const [locationStatus, setLocationStatus] = useState(
    savedLocation
      ? `Last known location: ${savedLocation.latitude}, ${savedLocation.longitude}`
      : 'No location saved yet'
  );

  const [coordinates, setCoordinates] = useState(
    savedLocation
      ? {
          latitude: savedLocation.latitude,
          longitude: savedLocation.longitude,
        }
      : null
  );

  const [contacts, setContacts] = useState(loadEmergencyContacts);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // ── Are You Safe? state machine ──────────────────────────────────────────
  // States: "idle" | "prompted" | "safe" | "help"
  const [safetyStatus, setSafetyStatus] = useState('idle');
  const [safetyTimestamp, setSafetyTimestamp] = useState(null);

  function handleSafetyPrompt() {
    setSafetyStatus('prompted');
    setSafetyTimestamp(null);
  }

  function handleIAmSafe() {
    setSafetyStatus('safe');
    setSafetyTimestamp(new Date().toLocaleTimeString());
  }

  function handleNeedHelp() {
    setSafetyStatus('help');
    setSafetyTimestamp(new Date().toLocaleTimeString());
  }

  function handleSafetyReset() {
    setSafetyStatus('idle');
    setSafetyTimestamp(null);
  }

  function saveContacts(updatedContacts) {
    localStorage.setItem(
      'skyraEmergencyContacts',
      JSON.stringify(updatedContacts)
    );

    setContacts(updatedContacts);
  }

  function handleSaveContact(event) {
    event.preventDefault();

    const contact = {
      id: `contact-${Date.now()}`,
      name: contactName.trim(),
      phone: contactPhone.trim(),
    };

    saveContacts([...contacts, contact]);
    setContactName('');
    setContactPhone('');
    setShowContactForm(false);
  }

  function handleDeleteContact(contactId) {
    saveContacts(
      contacts.filter((contact) => contact.id !== contactId)
    );
  }

  function handleCancelContact() {
    setContactName('');
    setContactPhone('');
    setShowContactForm(false);
  }

  function handleLocation() {
    if (!navigator.geolocation) {
      setLocationStatus(
        'Location services are not supported by this browser.'
      );
      return;
    }

    setLocationStatus('Getting your current location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);

        const newLocation = {
          latitude,
          longitude,
          savedAt: new Date().toISOString(),
        };

        localStorage.setItem(
          'skyraLastLocation',
          JSON.stringify(newLocation)
        );

        setCoordinates({
          latitude,
          longitude,
        });

        setLocationStatus(
          `Current location: ${latitude}, ${longitude}`
        );
      },
      (error) => {
        if (error.code === 1) {
          setLocationStatus(
            'Location permission was denied. Please allow location access for localhost.'
          );
        } else if (error.code === 2) {
          setLocationStatus(
            'Location is currently unavailable. Using last known location.'
          );
        } else if (error.code === 3) {
          setLocationStatus(
            'Location request timed out. Using last known location.'
          );
        } else {
          setLocationStatus(
            'Unable to get current location. Using last known location.'
          );
        }

        console.error('SKYRA GPS error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  function handleViewMap() {
    if (!coordinates) {
      return;
    }

    const mapUrl =
      `https://www.google.com/maps?q=` +
      `${coordinates.latitude},${coordinates.longitude}`;

    window.open(mapUrl, '_blank');
  }

  const pages = [
    'Dashboard',
    'WeatherGPT',
    'Forecast & History',
    'Alerts & Advisories',
    'Emergency Response',
    'Settings',
  ];

  return (
    <div className="dashboard emergency-page">
      <header className="skyra-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            S
          </div>

          <div>
            <h1>SKYRA</h1>
            <p className="brand-tagline">
              Smart Disaster Awareness
            </p>
          </div>
        </div>

        <nav className="skyra-nav" aria-label="Main navigation">
          {pages.map((page) => (
            <button
              key={page}
              type="button"
              className={
                page === 'Emergency Response'
                  ? 'nav-button active'
                  : 'nav-button'
              }
              onClick={() => onNavigate(page)}
            >
              {page}
            </button>
          ))}
        </nav>
      </header>

      <main className="dashboard-main emergency-main">
        <section className="emergency-response-page">
          <div className="panel glass-panel emergency-heading-panel">
            <p className="page-eyebrow">RESPOND SKYRA</p>

            <h2>Emergency Response</h2>

            <p>
              Quick access to emergency assistance, location,
              contacts, and disaster safety guidance.
            </p>
          </div>

          <div className="emergency-grid emergency-response-grid">
            {/* ── Are You Safe? ── */}
            <article className="panel glass-panel emergency-response-card">
              <h2>✅ Are You Safe?</h2>

              {demo && (
                <p className="risk-summary">
                  ⚠️ DEMO — simulated {demoValues.demoLabel} alert. This safety check is for demonstration only.
                </p>
              )}

              {safetyStatus === 'idle' && (
                <>
                  <p className="risk-summary">
                    Let SKYRA know your current safety status.
                  </p>
                  <button
                    type="button"
                    className="emergency-response-action"
                    onClick={handleSafetyPrompt}
                  >
                    Check In Now
                  </button>
                </>
              )}

              {safetyStatus === 'prompted' && (
                <>
                  <p className="risk-summary" style={{ fontWeight: 700, fontSize: '1rem' }}>
                    Are you safe right now?
                  </p>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="emergency-response-action"
                      style={{ background: 'linear-gradient(180deg,#4ade80,#16a34a)', color: '#fff', borderColor: '#86efac', flex: 1 }}
                      onClick={handleIAmSafe}
                    >
                      ✅ I&apos;m Safe
                    </button>
                    <button
                      type="button"
                      className="emergency-response-action emergency-link"
                      style={{ flex: 1 }}
                      onClick={handleNeedHelp}
                    >
                      🆘 Need Help
                    </button>
                  </div>
                </>
              )}

              {safetyStatus === 'safe' && (
                <>
                  <p className="risk-summary" style={{ color: '#4ade80', fontWeight: 700 }}>
                    ✅ Status: Safe
                  </p>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 12px' }}>
                    Checked in at {safetyTimestamp}.
                  </p>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 12px' }}>
                    Stay aware of your surroundings and continue monitoring SKYRA for updates.
                  </p>
                  <button
                    type="button"
                    className="emergency-response-action"
                    onClick={handleSafetyReset}
                  >
                    Update Status
                  </button>
                </>
              )}

              {safetyStatus === 'help' && (
                <>
                  <p className="risk-summary" style={{ color: '#f87171', fontWeight: 700 }}>
                    🆘 Help Requested
                  </p>
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 12px' }}>
                    Triggered at {safetyTimestamp}.
                  </p>
                  <p style={{ fontSize: '0.85rem', color: '#fca5a5', margin: '0 0 8px' }}>
                    ⚠️ This is a PROTOTYPE — SKYRA does not yet connect to live emergency services. Call 112 immediately for real emergencies.
                  </p>
                  <a
                    href="tel:112"
                    className="emergency-response-action emergency-link"
                    style={{ display: 'block', textAlign: 'center', marginBottom: '8px' }}
                  >
                    📞 Call 112 Now
                  </a>
                  <button
                    type="button"
                    className="emergency-response-action"
                    onClick={handleSafetyReset}
                  >
                    Update Status
                  </button>
                </>
              )}
            </article>

            <article className="panel glass-panel emergency-response-card">
              <h2>🚨 Emergency Services</h2>

              <p className="risk-summary">
                Need immediate emergency assistance?
              </p>

              <a
                href="tel:112"
                className="emergency-response-action emergency-link"
              >
                📞 Call 112 — All Emergencies
              </a>

              <ul className="stat-list" style={{ marginTop: '12px', fontSize: '0.88rem' }}>
                <li><strong>108</strong> — Ambulance</li>
                <li><strong>101</strong> — Fire &amp; Rescue</li>
                <li><strong>100</strong> — Police</li>
                <li><strong>1070 / 1079</strong> — Kerala State Emergency Operations Centre</li>
                <li><strong>1077</strong> — District Emergency Operations Centre</li>
              </ul>
            </article>

            <article className="panel glass-panel emergency-response-card">
              <h2>📍 Your Location</h2>

              <p className="risk-summary">
                {locationStatus}
              </p>

              <button
                type="button"
                onClick={handleLocation}
                className="emergency-response-action"
              >
                📍 Get Current Location
              </button>

              {coordinates && (
                <button
                  type="button"
                  onClick={handleViewMap}
                  className="emergency-response-action"
                >
                  🗺️ View on Map
                </button>
              )}
            </article>

            <article className="panel glass-panel emergency-response-card">
              <h2>👥 Emergency Contacts</h2>

              <p className="risk-summary">
                Keep trusted contacts ready during an emergency.
              </p>

              <p>
                Trusted contacts can be added in the SKYRA settings
                section.
              </p>

              {showContactForm ? (
                <form
                  className="emergency-contact-form"
                  onSubmit={handleSaveContact}
                >
                  <label>
                    Name
                    <input
                      type="text"
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                      required
                    />
                  </label>

                  <label>
                    Phone Number
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                      required
                    />
                  </label>

                  <div className="emergency-contact-actions">
                    <button
                      type="submit"
                      className="emergency-response-action"
                    >
                      Save
                    </button>

                    <button
                      type="button"
                      className="emergency-response-action emergency-contact-cancel"
                      onClick={handleCancelContact}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="emergency-response-action emergency-contact-add"
                  onClick={() => setShowContactForm(true)}
                >
                  Add Emergency Contact
                </button>
              )}

              {contacts.length > 0 && (
                <div className="emergency-contact-list">
                  {contacts.map((contact) => (
                    <div className="emergency-contact-item" key={contact.id}>
                      <div>
                        <strong>{contact.name}</strong>
                        <span>{contact.phone}</span>
                      </div>

                      <div className="emergency-contact-actions">
                        <a
                          href={`tel:${contact.phone}`}
                          className="emergency-response-action"
                        >
                          Call
                        </a>

                        <button
                          type="button"
                          className="emergency-response-action emergency-contact-delete"
                          onClick={() => handleDeleteContact(contact.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="panel glass-panel emergency-response-card">
              <h2>🛡️ Safety Guidance</h2>

              <ul className="stat-list">
                <li>Stay calm and move to a safer location.</li>
                <li>Follow official disaster advisories.</li>
                <li>Avoid flooded roads and unsafe structures.</li>
                <li>Keep your phone charged when possible.</li>
              </ul>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}

export default EmergencyResponse;
