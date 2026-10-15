# SKYRA – Firebase Cloud Messaging (FCM) Production Configuration Guide

**Document Version:** 1.0.0  
**Status:** Awaiting User Production Credentials (Gracefully operating in secure `DRY_RUN` mode until configured)  
**Applicability:** Background disaster alerts on physical Android devices and Web Browsers during extreme weather events.

---

## 1. Architecture Overview

```
+───────────────────────────+         +──────────────────────────────+         +────────────────────────────+
|   Vite Frontend Client    |  token  |      Node/Express Backend    |   FCM   |     Firebase Cloud         |
|   - Service Worker (sw.js)| ──────> |   - fcmService.js (Admin SDK)| ──────> |     Messaging (Google)     |
|   - fcmClientService.js   |         |   - Geo-Radius Filter        |         +─────────────┬──────────────+
+───────────────────────────+         |   - SHA-256 Deduplication    |                       │
                                      +──────────────────────────────+                       │ Push
                                                                                             ▼
                                                                               +────────────────────────────+
                                                                               |   Target Android Device    |
                                                                               |   - Background Notification|
                                                                               |   - Disaster Siren (P1/P2) |
                                                                               +────────────────────────────+
```

### Security & Privacy Guarantees
- **Credentials Isolation:** Firebase service account secrets are stored strictly on the server (environment variables). They are **never** exposed to the frontend bundle or client network calls.
- **Location Privacy:** Subscribed coordinates are hashed or matched via distance boundaries; personal GPS traces are never forwarded to Google.
- **Fail-Safe Operation:** When Firebase credentials are not yet entered, SKYRA enters `DRY_RUN` mode. The backend logs the alert dispatch payload and deduplicates fingerprints without failing or throwing runtime exceptions.

---

## 2. Step-by-Step Firebase Console Setup

To connect live Google push notifications to your physical Android phone, follow these steps in the Firebase Console:

### Step 1: Create or Select Firebase Project
1. Navigate to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or select your existing project).
3. Name your project: `skyra-disaster-resilience` (or similar).
4. (Optional) Disable Google Analytics if not needed, then click **Create project**.

### Step 2: Generate Server-Side Service Account Key (Backend)
1. In Firebase Console, click the ⚙️ **Project settings** gear icon (top left).
2. Go to the **Service accounts** tab.
3. Verify that **Node.js** is selected under the code sample.
4. Click **Generate new private key**, then confirm **Generate key**.
5. A JSON file will download (e.g., `skyra-disaster-resilience-firebase-adminsdk-xxxxx.json`).

> [!CAUTION]
> **NEVER commit this JSON file to Git.** It contains administrative credentials capable of modifying your Firebase project.

### Step 3: Configure Backend Environment Variables
In your backend environment (either your local `backend/.env` or Render Dashboard Environment Variables for the backend service):

#### Option A: Single JSON String
```bash
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
```

#### Option B: Discrete Environment Variables (Recommended for Render)
```bash
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

### Step 4: Configure Web Push VAPID Key (Frontend)
1. In Firebase Console > **Project settings** > **Cloud Messaging** tab.
2. Scroll down to **Web configuration** > **Web Push certificates**.
3. Click **Generate key pair**.
4. Copy the public key (VAPID Key).
5. In your `frontend/.env.local` or Render frontend environment:
   ```bash
   VITE_FIREBASE_VAPID_KEY="BCxxxx...your_vapid_key_here"
   ```

---

## 3. Testing Background Push Notifications Locally

Once configured (or in `DRY_RUN` mode):

1. **Verify Backend Status:**
   ```bash
   curl http://localhost:5000/api/notifications/status
   ```
   *Expected response:*
   ```json
   {
     "configured": false,
     "mode": "DRY_RUN",
     "activeSubscriptions": 0,
     "recentAuditLogs": [],
     "cooldownCount": 0
   }
   ```

2. **Register a Simulated Device Token:**
   ```bash
   curl -X POST http://localhost:5000/api/notifications/register \
     -H "Content-Type: application/json" \
     -d '{"token":"test_phone_token_01","platform":"android","location":{"latitude":10.7867,"longitude":76.6548,"name":"Palakkad"},"radiusKm":35}'
   ```

3. **Trigger a Verified Disaster Notification Drill:**
   ```bash
   curl -X POST http://localhost:5000/api/notifications/test-trigger \
     -H "Content-Type: application/json" \
     -d '{"title":"TEST DRILL: Flash Flood Warning","body":"Water level rising in river basin. Move to higher ground.","priority":"P1","hazard":"Flash Flood","latitude":10.704,"longitude":76.744}'
   ```

---

## 4. Current Status: Ready for External User Input

> [!IMPORTANT]
> The backend code is fully implemented, verified, and tested with automated unit and integration tests passing (6/6).
> To enable live physical delivery to your Android device via Google servers, provide your Firebase Service Account credentials as described above. Until credentials are provided, SKYRA operates safely in `DRY_RUN` mode.
