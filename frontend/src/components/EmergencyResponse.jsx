import { useState, useEffect } from 'react';
import Header from './Header';
import {
  resolveDisplayValues,
  useGlobalAlert,
} from '../services/globalAlertService';
import {
  EMERGENCY_STATES,
  getStoredEmergencyState,
  subscribeEmergencyState,
  getOfflineQueue,
  flushOfflineQueue,
  loadEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
  apiActivateEmergency,
  apiTriggerSos,
  apiUpdateSafetyStatus,
  apiDeactivateEmergency,
} from '../services/emergencyService';

function EmergencyResponse({ onNavigate, currentLocation }) {
  const { cache, demo, demoScenario } = useGlobalAlert();
  const demoValues = resolveDisplayValues(cache, demo, demoScenario);

  // ── Emergency State Machine ───────────────────────────────────────────────
  const [emergencyState, setEmergencyState] = useState(getStoredEmergencyState);
  const [offlineQueue, setOfflineQueue] = useState(getOfflineQueue);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isBusy, setIsBusy] = useState(false);
  const [safetyNote, setSafetyNote] = useState('');
  const [actionFeedback, setActionFeedback] = useState(null);

  // ── Coordinates / Location ────────────────────────────────────────────────
  const [coordinates, setCoordinates] = useState(() => {
    if (currentLocation?.latitude && currentLocation?.longitude) {
      return {
        latitude: Number(currentLocation.latitude).toFixed(6),
        longitude: Number(currentLocation.longitude).toFixed(6),
        accuracy: null,
        label: currentLocation.name || 'Current Location',
      };
    }
    const saved = localStorage.getItem('skyraLastLocation');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [locationStatus, setLocationStatus] = useState(() => {
    if (coordinates) {
      return `GPS Location: ${coordinates.latitude}, ${coordinates.longitude}`;
    }
    return 'Location not acquired yet. Click below to detect.';
  });

  // ── Contacts ──────────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState(loadEmergencyContacts);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactError, setContactError] = useState('');

  // Subscribe to emergency state updates & network connectivity
  useEffect(() => {
    const unsub = subscribeEmergencyState((updated) => {
      setEmergencyState(updated);
      setOfflineQueue(getOfflineQueue());
    });

    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue().then(() => setOfflineQueue(getOfflineQueue())).catch(() => {});
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Geolocation Handler ───────────────────────────────────────────────────
  function handleDetectLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation is not supported by your browser.');
      return;
    }

    setLocationStatus('Acquiring precise satellite GPS fix...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        const accuracy = Math.round(pos.coords.accuracy);

        const newLoc = {
          latitude: lat,
          longitude: lon,
          accuracy,
          label: 'Browser GPS Fix',
          savedAt: new Date().toISOString(),
        };

        try {
          localStorage.setItem('skyraLastLocation', JSON.stringify(newLoc));
        } catch {}

        setCoordinates(newLoc);
        setLocationStatus(`GPS: ${lat}, ${lon} (±${accuracy}m accuracy)`);
      },
      (err) => {
        if (err.code === 1) {
          setLocationStatus('GPS permission denied. Please allow location permissions in browser settings.');
        } else if (err.code === 2) {
          setLocationStatus('GPS satellite signal unavailable. Position unknown.');
        } else if (err.code === 3) {
          setLocationStatus('GPS request timed out. Retrying recommended.');
        } else {
          setLocationStatus('Unable to determine location.');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  // ── Emergency Mode Activation / Deactivation ──────────────────────────────
  async function handleToggleEmergencyMode() {
    setIsBusy(true);
    setActionFeedback(null);
    try {
      if (emergencyState.state === EMERGENCY_STATES.NORMAL) {
        const res = await apiActivateEmergency({
          latitude: coordinates?.latitude ? Number(coordinates.latitude) : null,
          longitude: coordinates?.longitude ? Number(coordinates.longitude) : null,
          locationLabel: coordinates?.label || 'Emergency Response Page',
          accuracyMeters: coordinates?.accuracy || null,
        });
        setActionFeedback({
          type: 'success',
          text: `Emergency Mode Activated. Event ID: ${res.eventId}`,
        });
      } else {
        await apiDeactivateEmergency('User returned to Normal mode.');
        setActionFeedback({
          type: 'info',
          text: 'Emergency Mode deactivated. Returned to Normal operations.',
        });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message });
    } finally {
      setIsBusy(false);
    }
  }

  // ── SOS Trigger ───────────────────────────────────────────────────────────
  async function handleTriggerSos() {
    setIsBusy(true);
    setActionFeedback(null);

    const lat = coordinates?.latitude ? Number(coordinates.latitude) : null;
    const lon = coordinates?.longitude ? Number(coordinates.longitude) : null;

    try {
      const res = await apiTriggerSos({
        latitude: lat,
        longitude: lon,
        locationLabel: coordinates?.label || (lat && lon ? `${lat}, ${lon}` : 'Location Unavailable'),
        accuracyMeters: coordinates?.accuracy || null,
        emergencyType: 'USER_SOS',
        contacts,
        note: 'SOS triggered via Emergency Response Console.',
      });

      if (res.deliveryState === 'QUEUED') {
        setActionFeedback({
          type: 'warning',
          text: `⚠️ Network offline. SOS is safely QUEUED locally (Event: ${res.eventId}). It will dispatch automatically upon reconnection.`,
        });
      } else {
        setActionFeedback({
          type: 'danger',
          text: `🚨 EMERGENCY SOS DISPATCHED (Event: ${res.eventId}). Priority: P1 Emergency Alert Active.`,
        });
      }
    } catch (err) {
      setActionFeedback({ type: 'error', text: `SOS trigger error: ${err.message}` });
    } finally {
      setIsBusy(false);
      setOfflineQueue(getOfflineQueue());
    }
  }

  // ── Safety Status Handlers ────────────────────────────────────────────────
  async function handleSetSafety(status) {
    setIsBusy(true);
    setActionFeedback(null);

    try {
      // If emergency mode was not active, auto-activate first
      if (emergencyState.state === EMERGENCY_STATES.NORMAL) {
        await apiActivateEmergency({
          latitude: coordinates?.latitude ? Number(coordinates.latitude) : null,
          longitude: coordinates?.longitude ? Number(coordinates.longitude) : null,
          locationLabel: coordinates?.label || 'Emergency Page Check-In',
        });
      }

      const noteContent = safetyNote.trim()
        ? safetyNote.trim()
        : `User selected: ${status === 'SAFE' ? "I'm Safe" : 'I Need Help'}`;

      const res = await apiUpdateSafetyStatus({
        safetyStatus: status,
        note: noteContent,
      });

      setActionFeedback({
        type: status === 'SAFE' ? 'success' : 'danger',
        text: res.message || `Safety status updated to ${status}.`,
      });
      setSafetyNote('');
    } catch (err) {
      setActionFeedback({ type: 'error', text: err.message });
    } finally {
      setIsBusy(false);
      setOfflineQueue(getOfflineQueue());
    }
  }

  // ── Contact Form Handlers ─────────────────────────────────────────────────
  function handleAddContactSubmit(e) {
    e.preventDefault();
    setContactError('');

    const res = addEmergencyContact(contactName, contactPhone);
    if (!res.success) {
      setContactError(res.error);
      return;
    }

    setContacts(res.contacts);
    setContactName('');
    setContactPhone('');
    setShowContactForm(false);
    setActionFeedback({ type: 'success', text: `Added emergency contact: ${res.contact.name}` });
  }

  function handleDeleteContactClick(contactId) {
    const updated = deleteEmergencyContact(contactId);
    setContacts(updated);
  }

  function handleManualSync() {
    flushOfflineQueue()
      .then((res) => {
        setOfflineQueue(getOfflineQueue());
        setActionFeedback({
          type: 'info',
          text: `Sync complete: ${res.replayed} replayed, ${res.remaining} remaining.`,
        });
      })
      .catch((e) => setActionFeedback({ type: 'error', text: e.message }));
  }

  const pages = [
    'Dashboard',
    'WeatherGPT',
    'Forecast & History',
    'Alerts & Advisories',
    'Emergency Response',
    'Settings',
  ];

  const isEmergencyActive = emergencyState.state !== EMERGENCY_STATES.NORMAL;
  const isSosSent = emergencyState.state === EMERGENCY_STATES.SOS_SENT;
  const isQueued = emergencyState.state === EMERGENCY_STATES.QUEUED || emergencyState.deliveryState === 'QUEUED';
  const isSafe = emergencyState.safetyStatus === 'SAFE';
  const isHelpNeeded = emergencyState.safetyStatus === 'HELP_NEEDED';

  return (
    <main className="skyra-page emergency-page">
      <Header
        activePage="Emergency Response"
        onNavigate={onNavigate}
        currentLocation={currentLocation}
      />

      <div className="page-shell">
        <section className="emergency-response-page">
          {/* ── Connectivity & Emergency Banner ── */}
          <div
            className="panel glass-panel emergency-heading-panel"
            style={{
              borderColor: isEmergencyActive ? '#ef4444' : 'rgba(255,255,255,0.1)',
              boxShadow: isEmergencyActive ? '0 0 20px rgba(239, 68, 68, 0.25)' : 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p className="page-eyebrow">
                  {isEmergencyActive ? '🚨 PHASE 13 — EMERGENCY MODE ACTIVE' : 'RESPOND SKYRA — PHASE 13'}
                </p>
                <h2 style={{ margin: '4px 0' }}>
                  {isEmergencyActive ? '⚠️ Critical Emergency Mode' : 'Emergency Response Console'}
                </h2>
                <p style={{ margin: 0, color: '#94a3b8' }}>
                  {isEmergencyActive
                    ? `Active Event: ${emergencyState.eventId || 'Pending'} | State: ${emergencyState.state}`
                    : 'System is currently operating in Normal Mode. Activate Emergency Mode below if in danger.'}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: isOnline ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isOnline ? '#4ade80' : '#f87171',
                    border: `1px solid ${isOnline ? '#4ade80' : '#f87171'}`,
                  }}
                >
                  {isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
                </span>

                <button
                  type="button"
                  onClick={handleToggleEmergencyMode}
                  disabled={isBusy}
                  className="emergency-response-action"
                  style={{
                    background: isEmergencyActive ? '#334155' : 'linear-gradient(135deg, #ef4444, #b91c1c)',
                    borderColor: isEmergencyActive ? '#64748b' : '#ef4444',
                    color: '#fff',
                    padding: '8px 16px',
                    fontWeight: 700,
                  }}
                >
                  {isEmergencyActive ? '⏹️ Deactivate Emergency' : '⚡ Activate Emergency Mode'}
                </button>
              </div>
            </div>

            {/* Offline Queue Badge */}
            {offlineQueue.length > 0 && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid #eab308',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#fef08a', fontSize: '0.85rem' }}>
                  📦 <strong>{offlineQueue.length}</strong> action(s) queued offline. Automatic retry will fire on network restoration.
                </span>
                {isOnline && (
                  <button
                    type="button"
                    onClick={handleManualSync}
                    style={{ background: '#ca8a04', color: '#000', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Sync Now
                  </button>
                )}
              </div>
            )}

            {/* Action Feedback */}
            {actionFeedback && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background:
                    actionFeedback.type === 'danger'
                      ? 'rgba(239, 68, 68, 0.2)'
                      : actionFeedback.type === 'warning'
                      ? 'rgba(234, 179, 8, 0.2)'
                      : actionFeedback.type === 'success'
                      ? 'rgba(34, 197, 94, 0.2)'
                      : 'rgba(59, 130, 246, 0.2)',
                  color:
                    actionFeedback.type === 'danger'
                      ? '#fca5a5'
                      : actionFeedback.type === 'warning'
                      ? '#fef08a'
                      : actionFeedback.type === 'success'
                      ? '#86efac'
                      : '#93c5fd',
                  border: `1px solid currentColor`,
                }}
              >
                {actionFeedback.text}
              </div>
            )}
          </div>

          <div className="emergency-grid emergency-response-grid">
            {/* ── 1. Critical SOS Card ── */}
            <article
              className="panel glass-panel emergency-response-card"
              style={{
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.08), rgba(0, 0, 0, 0.3))',
              }}
            >
              <h2>🆘 Emergency SOS</h2>
              <p className="risk-summary">
                Instantly trigger a P1 Priority Emergency SOS across all SKYRA notification channels.
              </p>

              <div style={{ textAlign: 'center', margin: '16px 0' }}>
                <button
                  type="button"
                  id="btn-trigger-sos"
                  disabled={isBusy}
                  onClick={handleTriggerSos}
                  style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: '1.25rem',
                    fontWeight: 900,
                    letterSpacing: '1px',
                    borderRadius: '8px',
                    border: '2px solid #ef4444',
                    background: isSosSent
                      ? 'linear-gradient(135deg, #15803d, #166534)'
                      : isQueued
                      ? 'linear-gradient(135deg, #a16207, #854d0e)'
                      : 'linear-gradient(135deg, #dc2626, #991b1b)',
                    color: '#ffffff',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 15px rgba(220, 38, 38, 0.4)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isBusy
                    ? '⏳ Processing SOS...'
                    : isSosSent
                    ? '✅ SOS ACTIVE & DISPATCHED'
                    : isQueued
                    ? '📦 SOS QUEUED OFFLINE'
                    : '🚨 TRIGGER CRITICAL SOS'}
                </button>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>
                <p style={{ margin: '4px 0' }}>
                  <strong>Delivery State:</strong>{' '}
                  <span style={{ color: isSosSent ? '#4ade80' : isQueued ? '#facc15' : '#cbd5e1' }}>
                    {emergencyState.deliveryState || 'IDLE'}
                  </span>
                </p>
                {emergencyState.eventId && (
                  <p style={{ margin: '4px 0' }}>
                    <strong>Event Tracking ID:</strong> <code>{emergencyState.eventId}</code>
                  </p>
                )}
                {emergencyState.sosTriggeredAt && (
                  <p style={{ margin: '4px 0' }}>
                    <strong>Dispatched At:</strong> {new Date(emergencyState.sosTriggeredAt).toLocaleTimeString()}
                  </p>
                )}
                <p style={{ margin: '8px 0 0', color: '#fca5a5', fontSize: '0.75rem' }}>
                  ⚠️ Note: Direct telecom/radio dispatch requires local administrative integration. Always dial 112 directly if life is in danger.
                </p>
              </div>
            </article>

            {/* ── 2. Are You Safe? Check-In ── */}
            <article className="panel glass-panel emergency-response-card">
              <h2>✅ Are You Safe?</h2>
              <p className="risk-summary">
                Declare your personal safety status for responder situational awareness.
              </p>

              {demo && (
                <p style={{ fontSize: '0.75rem', color: '#fbbf24', margin: '4px 0' }}>
                  ⚠️ DEMO Mode: Simulated {demoValues.demoLabel} scenario.
                </p>
              )}

              <div style={{ marginTop: '10px' }}>
                <textarea
                  value={safetyNote}
                  onChange={(e) => setSafetyNote(e.target.value)}
                  placeholder="Optional details: household headcount, urgent medicine, floor level..."
                  rows={2}
                  style={{
                    width: '100%',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#f8fafc',
                    fontSize: '0.8rem',
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  id="btn-im-safe"
                  disabled={isBusy}
                  onClick={() => handleSetSafety('SAFE')}
                  style={{
                    flex: 1,
                    minWidth: '130px',
                    padding: '12px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: isSafe ? '2px solid #86efac' : '1px solid #16a34a',
                    background: isSafe ? 'linear-gradient(180deg, #22c55e, #15803d)' : 'rgba(34, 197, 94, 0.15)',
                    color: '#fff',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSafe ? '✅ I am Safe (Active)' : "👍 I'm Safe"}
                </button>

                <button
                  type="button"
                  id="btn-need-help"
                  disabled={isBusy}
                  onClick={() => handleSetSafety('HELP_NEEDED')}
                  style={{
                    flex: 1,
                    minWidth: '130px',
                    padding: '12px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: isHelpNeeded ? '2px solid #fca5a5' : '1px solid #dc2626',
                    background: isHelpNeeded ? 'linear-gradient(180deg, #ef4444, #b91c1c)' : 'rgba(239, 68, 68, 0.15)',
                    color: '#fff',
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isHelpNeeded ? '🆘 Need Help (Active)' : '🆘 I Need Help'}
                </button>
              </div>

              <div style={{ marginTop: '14px', fontSize: '0.82rem', color: '#94a3b8' }}>
                <p style={{ margin: '2px 0' }}>
                  <strong>Current Safety:</strong>{' '}
                  <span
                    style={{
                      fontWeight: 700,
                      color: isSafe ? '#4ade80' : isHelpNeeded ? '#f87171' : '#cbd5e1',
                    }}
                  >
                    {emergencyState.safetyStatus}
                  </span>
                </p>
                {isHelpNeeded && (
                  <p style={{ color: '#fca5a5', marginTop: '6px', fontSize: '0.78rem' }}>
                    Need urgent rescue? Move to higher ground and call 112 immediately.
                  </p>
                )}
              </div>
            </article>

            {/* ── 3. Your Location ── */}
            <article className="panel glass-panel emergency-response-card">
              <h2>📍 Current Location Status</h2>
              <p className="risk-summary">{locationStatus}</p>

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  className="emergency-response-action"
                  style={{ flex: 1 }}
                >
                  📍 Update GPS Location
                </button>

                {coordinates?.latitude && coordinates?.longitude && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `https://www.google.com/maps?q=${coordinates.latitude},${coordinates.longitude}`;
                      window.open(url, '_blank');
                    }}
                    className="emergency-response-action"
                    style={{ flex: 1 }}
                  >
                    🗺️ View on Map
                  </button>
                )}
              </div>

              <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#64748b' }}>
                🔒 Privacy Guarantee: GPS coordinates are never transmitted to unauthenticated third-party services.
              </div>
            </article>

            {/* ── 4. Emergency Contacts ── */}
            <article className="panel glass-panel emergency-response-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>👥 Emergency Contacts</h2>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: '#1e293b', padding: '2px 8px', borderRadius: '12px' }}>
                  {contacts.length} saved
                </span>
              </div>

              <p className="risk-summary">
                Contacts notified during SOS dispatch and emergency escalations.
              </p>

              {contactError && (
                <div style={{ color: '#f87171', fontSize: '0.8rem', margin: '4px 0' }}>
                  ⚠️ {contactError}
                </div>
              )}

              {showContactForm ? (
                <form className="emergency-contact-form" onSubmit={handleAddContactSubmit} style={{ marginTop: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px' }}>
                    Contact Name
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Family Member / Caretaker"
                      required
                      style={{ width: '100%', padding: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
                    />
                  </label>

                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', margin: '8px 0 4px' }}>
                    Phone Number
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="e.g. +91 9876543210"
                      required
                      style={{ width: '100%', padding: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }}
                    />
                  </label>

                  <div className="emergency-contact-actions" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button type="submit" className="emergency-response-action" style={{ flex: 1 }}>
                      Save Contact
                    </button>
                    <button
                      type="button"
                      className="emergency-response-action"
                      style={{ background: '#334155', flex: 1 }}
                      onClick={() => {
                        setShowContactForm(false);
                        setContactError('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="emergency-response-action"
                  style={{ width: '100%', marginTop: '10px' }}
                  onClick={() => setShowContactForm(true)}
                >
                  ➕ Add Trusted Contact
                </button>
              )}

              {contacts.length > 0 && (
                <div className="emergency-contact-list" style={{ marginTop: '12px' }}>
                  {contacts.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '4px',
                        marginBottom: '6px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.85rem' }}>{c.name}</strong>
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{c.phone}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <a
                          href={`tel:${c.phone}`}
                          style={{
                            background: '#16a34a',
                            color: '#fff',
                            textDecoration: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          Call
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteContactClick(c.id)}
                          style={{
                            background: '#475569',
                            color: '#fff',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            {/* ── 5. Official Emergency Services (National Helplines) ── */}
            <article className="panel glass-panel emergency-response-card">
              <h2>🚨 Official Helplines</h2>
              <p className="risk-summary">Authoritative verified Indian emergency contact channels:</p>

              <a
                href="tel:112"
                className="emergency-response-action emergency-link"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  color: '#fff',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '1rem',
                  marginBottom: '10px',
                }}
              >
                📞 Call 112 — National Emergency
              </a>

              <ul className="stat-list" style={{ fontSize: '0.85rem', lineHeight: 1.8 }}>
                <li><strong>108</strong> — Medical Ambulance</li>
                <li><strong>101</strong> — Fire &amp; Rescue Services</li>
                <li><strong>100</strong> — Police Emergency</li>
                <li><strong>1070</strong> — State Emergency Operations Centre (SEOC)</li>
                <li><strong>1077</strong> — District Emergency Operations Centre (DEOC)</li>
                <li><strong>1078</strong> — NDMA National Disaster Helpline</li>
              </ul>
            </article>

            {/* ── 6. Disaster Safety Protocol ── */}
            <article className="panel glass-panel emergency-response-card">
              <h2>🛡️ Disaster SOPs</h2>
              <ul className="stat-list" style={{ fontSize: '0.85rem', lineHeight: 1.7 }}>
                <li>Do not attempt to cross flooded roads, bridges, or culverts.</li>
                <li>Switch off primary electrical circuit breakers if flooding occurs.</li>
                <li>Store clean drinking water and non-perishable food.</li>
                <li>Keep mobile phones charged and battery-saver mode enabled.</li>
                <li>Monitor official IMD and SDMA color-coded bulletins on SKYRA.</li>
              </ul>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}

export default EmergencyResponse;
