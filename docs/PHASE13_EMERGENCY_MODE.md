# SKYRA — Phase 13: Emergency Mode & SOS Workflow Specification

**Status:** COMPLETE & VERIFIED  
**Problem Statement:** Smart India Hackathon 2026, Problem Statement 26068  
**Scope:** Production Emergency Mode, State Machine, SOS Workflow, Offline Queue, Safety Check-In, and Alert Integration  

---

## 1. Executive Summary

Phase 13 establishes the authoritative **Emergency Mode** subsystem for SKYRA. Unlike a superficial panic button, Phase 13 implements a state-machine driven, connectivity-aware emergency response infrastructure that integrates with the existing Phase 12 Alert Engine, multi-channel dispatch architecture, and official disaster protocols.

```
       NORMAL SKYRA
            │
            ▼ (Explicit User Activation)
     EMERGENCY_ACTIVE
            │
            ├─────────────────────────────────┐
            ▼ (Online SOS)                    ▼ (Offline SOS)
         SOS_SENT                        OFFLINE_PENDING / QUEUED
            │                                 │ (Network Restored)
            │◄────────────────────────────────┘
            │
            ├─────────────────────────────────┐
            ▼                                 ▼
       "I'M SAFE"                        "I NEED HELP"
         (SAFE)                          (HELP_NEEDED)
            │                                 │
            └───────────────┬─────────────────┘
                            ▼ (User Deactivates / Responder Resolves)
                         RESOLVED
                            │
                            ▼
                       NORMAL SKYRA
```

---

## 2. Emergency State Machine

### 2.1 Enumerated States
| State | Definition | Entry Conditions |
|---|---|---|
| `NORMAL` | Default operational state. Weather monitoring and normal UI active. | Default / Explicit deactivation from `RESOLVED` or `EMERGENCY_ACTIVE`. |
| `EMERGENCY_ACTIVE` | Emergency mode explicitly activated by user. | User clicks "Activate Emergency Mode" or triggers SOS / Safety Check. |
| `SOS_SENT` | Critical P1 Emergency SOS dispatched and accepted by backend. | Online SOS trigger completed with valid event ID. |
| `HELP_NEEDED` | User explicitly declared "I Need Help" during safety check. | User clicks "🆘 I Need Help" while in Emergency Mode. |
| `SAFE` | User explicitly declared "I'm Safe" during safety check. | User clicks "✅ I'm Safe" while in Emergency Mode. |
| `OFFLINE_PENDING` | Emergency action initiated while network is unavailable. | Browser offline detection (`!navigator.onLine`). |
| `QUEUED` | Action serialized into local queue waiting for network reconnection. | Offline SOS persisted in local storage. |
| `RESOLVED` | Emergency event concluded and audit trail sealed. | User clicks "Deactivate Emergency" or responder resolves event. |

### 2.2 Legal State Transitions
```
NORMAL           → [ EMERGENCY_ACTIVE ]
EMERGENCY_ACTIVE → [ SOS_SENT, HELP_NEEDED, SAFE, OFFLINE_PENDING, QUEUED, RESOLVED, NORMAL ]
SOS_SENT         → [ HELP_NEEDED, SAFE, RESOLVED, NORMAL ]
HELP_NEEDED      → [ SAFE, SOS_SENT, RESOLVED, NORMAL ]
SAFE             → [ HELP_NEEDED, SOS_SENT, RESOLVED, NORMAL ]
OFFLINE_PENDING  → [ QUEUED, SOS_SENT, SAFE, HELP_NEEDED, RESOLVED, NORMAL ]
QUEUED           → [ SOS_SENT, SAFE, HELP_NEEDED, RESOLVED, NORMAL ]
RESOLVED         → [ NORMAL, EMERGENCY_ACTIVE ]
```
*Illegal transitions (e.g. `NORMAL → SOS_SENT` without activation, or `RESOLVED → SOS_SENT`) are strictly rejected.*

---

## 3. SOS Workflow & Delivery Semantics

### 3.1 Delivery States
- **`SENT`**: The backend accepted the event and created a live P1 Emergency Alert.
- **`QUEUED`**: The device is offline; event is safely stored in local queue with idempotency key.
- **`FAILED`**: Explicit delivery error encountered (never disguised as success).
- **`UNAVAILABLE`**: Required external gateway (e.g., government telecom SMS) is unconfigured.

### 3.2 Idempotency Protection
Every emergency session generates a unique, cryptographically distinct tracking identifier (`EMG-<timestamp>-<randomHex>`).
- If a user double-clicks SOS or retries a queued event, the backend verifies the `eventId`.
- Existing records are returned with `isDuplicate: true`.
- Zero duplicate P1 alerts or redundant database entries are created.

### 3.3 Alert Integration
When SOS is triggered online, it integrates with the Phase 12 Alert Subsystem:
- Generates a **P1 Priority Alert** with `sourceAuthority: "EMERGENCY_SYSTEM"`.
- Dispatches across all channels via [`alertDispatchService.js`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/backend/src/services/alertDispatchService.js):
  - In-App notification
  - Browser notification
  - Web Audio 3-second modulated emergency siren (600–1200 Hz sawtooth)
  - Emergency Webhook (if `ALERT_WEBHOOK_URL` is set)
  - OASIS CAP v1.2 XML syndication feed ([`GET /api/alerts/cap`](file:///c:/Users/krish/OneDrive/Desktop/SKYRA/backend/src/controllers/alertController.js))

---

## 4. API Endpoints

### `POST /api/emergency/activate`
Activates Emergency Mode.
- **Request:** `{ "eventId"?: string, "latitude"?: number, "longitude"?: number, "locationLabel"?: string, "accuracyMeters"?: number }`
- **Response:** `{ "status": "SUCCESS", "eventId": string, "state": "EMERGENCY_ACTIVE", "deliveryState": "SENT", "event": Object }`

### `POST /api/emergency/sos`
Triggers Critical SOS.
- **Request:** `{ "eventId"?: string, "latitude"?: number, "longitude"?: number, "locationLabel"?: string, "emergencyType"?: string, "contacts"?: Array, "isOffline"?: boolean, "note"?: string }`
- **Response:** `{ "status": "SUCCESS", "eventId": string, "state": "SOS_SENT"|"QUEUED", "deliveryState": "SENT"|"QUEUED", "alertId": string|null, "dispatchReceipts": Object, "event": Object }`

### `POST /api/emergency/status`
Updates "Are You Safe?" status.
- **Request:** `{ "eventId": string, "safetyStatus": "SAFE"|"HELP_NEEDED", "note"?: string }`
- **Response:** `{ "status": "SUCCESS", "eventId": string, "state": "SAFE"|"HELP_NEEDED", "safetyStatus": string, "event": Object }`

### `GET /api/emergency/status/:eventId`
Retrieves full auditable emergency record.
- **Response:** `{ "status": "SUCCESS", "eventId": string, "event": Object }`

### `POST /api/emergency/deactivate`
Concludes emergency session.
- **Request:** `{ "eventId": string, "note"?: string }`
- **Response:** `{ "status": "SUCCESS", "eventId": string, "state": "RESOLVED" }`

---

## 5. Security & Privacy Guarantees

1. **Zero Silent Fallback**: If GPS coordinates are unavailable, `locationAvailable: false` is recorded. The system never substitutes Bhubaneswar (20.2961, 85.8245) or any default city.
2. **Phone Number Masking**: Contact telephone numbers stored on the server or returned in status feeds are masked (e.g. `+91 ******* 3210`) to prevent credential leakage.
3. **No Unauthenticated Leaks**: Emergency contacts are strictly scoped to the emergency module and never queried by public weather or RAG endpoints.
4. **Resilient Offline Fallback**: All persistence operations check `mongoose.connection.readyState === 1`, seamlessly utilizing an in-memory audit store when MongoDB is disconnected.
