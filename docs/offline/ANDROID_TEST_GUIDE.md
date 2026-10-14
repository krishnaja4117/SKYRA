# SKYRA Android Physical Device Field Testing Protocol

**Document Version:** 1.0.0  
**Target OS:** Android 11+ (Google Chrome / Mozilla Firefox / Microsoft Edge)  
**Applicability:** Offline-first disaster resilience verification  
**Author:** Antigravity Senior Offline-First Architect  

---

## 1. Prerequisite Setup (Local Network Wi-Fi Bridge)

To test the Progressive Web App (PWA) and Service Worker on a physical Android smartphone, the device and development machine must communicate over the local Wi-Fi network:

1. **Find Host IP**:
   Open PowerShell on your computer and run:
   ```powershell
   ipconfig
   ```
   Note your `IPv4 Address` (e.g. `192.168.1.15`).

2. **Start Development / Preview Server with Host Binding**:
   In `frontend/`:
   ```powershell
   npm run preview -- --host 0.0.0.0 --port 4173
   ```
   *(Or run `npm run dev -- --host 0.0.0.0 --port 5173`)*

3. **Port Forwarding (Recommended for Service Worker HTTPS Requirements)**:
   Modern Android Chrome requires `localhost` or HTTPS for Service Workers.
   - Connect your phone to your computer with a USB cable.
   - On phone: Enable **Developer Options** $\rightarrow$ Enable **USB Debugging**.
   - On computer: Open Google Chrome and navigate to `chrome://inspect/#devices`.
   - Click **Port forwarding...**:
     - Port: `4173` $\rightarrow$ Target: `localhost:4173` (or `5173` $\rightarrow$ `localhost:5173`).
     - Check **Enable port forwarding**.
   - On your phone: Open Chrome and browse to `http://localhost:4173`.
   *(This gives your phone full origin equivalence, allowing Service Worker registration without an SSL certificate!)*

---

## 2. 12-Step Offline Disaster Testing Matrix

Execute each test case in sequence on the phone, recording results truthfully:

| Step # | Test Phase | Action on Phone | Expected Verification Criteria | Pass / Fail |
| :---: | :--- | :--- | :--- | :---: |
| **01** | **Initial Online Load & Precache** | Open `http://localhost:4173`. Allow Location permission if prompted. Navigate across all 5 navigation tabs. | App shell loads smoothly. Service Worker registers (`[SKYRA SW] Service worker registered`). Cache storage creates `skyra-static-v1`. | [ ] |
| **02** | **PWA Installation** | Tap the Chrome three-dot menu ($\vdots$) $\rightarrow$ Tap **Add to Home screen** / **Install app**. | PWA installs as a standalone application on your Android home screen with the SKYRA logo and splash screen. | [ ] |
| **03** | **Airplane Mode Activation** | Swipe down the Android Notification Shade $\rightarrow$ Enable **Airplane Mode** (Turn off BOTH Wi-Fi and Mobile Data). | The red banner appears: `📡 Offline Mode Active: Running on local storage & on-device ML model.` | [ ] |
| **04** | **Force-Close & Cold Offline Reopen** | Swipe up from the bottom of Android to open Recent Apps $\rightarrow$ Swipe away SKYRA to force-close $\rightarrow$ Tap the SKYRA home screen icon. | The app reopens instantly without showing the standard Android dinosaur or `ERR_INTERNET_DISCONNECTED` network error. | [ ] |
| **05** | **Hard In-App Navigation** | While in Airplane Mode, tap between tabs: Dashboard $\rightarrow$ Emergency $\rightarrow$ Forecast $\rightarrow$ WeatherGPT $\rightarrow$ Risk Map. | All pages load seamlessly from the precached service worker shell without blank screens or navigation stalls. | [ ] |
| **06** | **Telemetry Freshness Labeling** | View the top indicator on Dashboard and Forecast page. | Telemetry badge displays `CACHED (Xm ago)` or `EXPIRED` with exact timestamp age. Never claims live radar/satellite data is live. | [ ] |
| **07** | **Offline GIS & Shelters** | Open **Risk Map** $\rightarrow$ Tap **📥 Offline Maps** $\rightarrow$ Activate your monitored region (e.g. Palakkad/Chittur or Chennai). Inspect map markers. | The map displays cached regional basemaps, verified emergency shelters (`🛡️`), and casualty hospitals (`🏥`). The offline limitations disclaimer banner is prominently displayed. | [ ] |
| **08** | **On-Device XGBoost ML Parity** | Observe risk score and feature attribution on Dashboard or WeatherGPT. | Local XGBoost engine evaluates on-device across 8 physical features, displaying: `Offline ML estimate evaluated on-device using SKYRA's validated XGBoost model`. | [ ] |
| **09** | **Offline WeatherGPT Guidance** | Open **WeatherGPT** $\rightarrow$ Ask: *"What should I do during a flood?"*, then *"What numbers can I call for help?"*, then *"What goes in an emergency kit?"*. | Returns official NDMA/IMD disaster safety protocols with official citations and toll-free numbers (`112`, `1078`, `1070`). Successive questions work without freezing on "Thinking...". | [ ] |
| **10** | **Offline Emergency SOS Queue** | Open **Emergency Response** $\rightarrow$ Tap **🚨 TRIGGER CRITICAL SOS**. | Button transitions to `📦 SOS QUEUED OFFLINE`. Banner states: `⚠️ Network offline. SOS is QUEUED LOCALLY - NOT DELIVERED to emergency authorities yet.` Status remains `QUEUED` in IndexedDB. | [ ] |
| **11** | **Network Reconnection & Sync** | Disable **Airplane Mode** (re-enable Wi-Fi / mobile data). Wait 5 seconds. | Indicator detects online state. Automatic replay fires. Backend confirms receipt with HTTP 200 and eventId. Button updates to `✅ SOS ACTIVE & DISPATCHED`. Queue transitions to `SYNCED`. | [ ] |
| **12** | **Duplicate Prevention Audit** | Tap **Sync Now** or refresh the page while online. | Idempotency guard prevents duplicate records. The server acknowledges the existing eventId without generating multiple alerts. | [ ] |

---

## 3. Storage Failure & Edge Case Simulations

### A. Quota Pressure Simulation
- Open Android Chrome DevTools on desktop (`chrome://inspect`).
- Navigate to **Application** $\rightarrow$ **Storage**.
- Observe total usage ($< 15$ MB total).
- Verify that `navigator.storage.persist()` reports `GRANTED`.

### B. Obsolete Cache Invalidation
- Build a new frontend version.
- Reopen the app.
- Notice that the Service Worker `activate` listener cleanly purges older cache versions while preserving active IndexedDB records.

---

## 4. Verification Sign-Off

- **Tester Name:** _______________________
- **Device Model:** ______________________
- **Android Version:** ___________________
- **Browser & Version:** _________________
- **Date Tested:** _______________________
- **Overall Result:** [ ] FULLY VERIFIED OFFLINE  /  [ ] DEFICIENCIES NOTED
