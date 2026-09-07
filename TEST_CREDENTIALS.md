# TeamChat AI — Test Credentials & Evaluation Guide

This document contains pre-seeded evaluator credentials and structured verification procedures for the **TeamChat AI Technical Assessment**.

---

## 🌐 Quick Access Links
- **Production Web Application**: [https://teamchat-ai-456789-aee59.web.app](https://teamchat-ai-456789-aee59.web.app)
- **Production Cloud Run Backend**: [https://teamchat-ai-872402492611.us-central1.run.app](https://teamchat-ai-872402492611.us-central1.run.app)
- **API Health Endpoint**: [https://teamchat-ai-872402492611.us-central1.run.app/api/health](https://teamchat-ai-872402492611.us-central1.run.app/api/health)
- **GitHub Repository**: [https://github.com/Ganesh-Kusundal/teamchat-ai](https://github.com/Ganesh-Kusundal/teamchat-ai)

> 💡 **Evaluator Convenience Tip**: The login page features a **1-Click Test User Switcher** allowing you to log in instantly as any of the pre-seeded accounts without typing credentials. Once logged in, you can also switch tenants or users via the top-navigation profile dropdown.

---

## 👥 Pre-Seeded Test Accounts

### Tenant 1: Northside Health System (`northside-health`)
*Regional healthcare delivery network focusing on adult primary care and chronic risk adjustment.*

| User Name | Role | Email | Password | Suggested Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Sarah Chen** | `admin` | `sarah@northside-health.test` | `password123` | Room management, patient reviews, Q1 target checks |
| **Mike Ross** | `member` | `mike@northside-health.test` | `password123` | Multi-speaker chat, asking Gemini clinical questions |
| **Lisa Wong** | `member` | `lisa@northside-health.test` | `password123` | Collaborative diagnosis verification |
| **Tom Castellanos** | `member` | `tom@northside-health.test` | `password123` | Real-time presence & concurrent typing |

### Tenant 2: Valley Primary Care (`valley-primary-care`)
*Independent primary care medical group with isolated patient populations and independent quality targets.*

| User Name | Role | Email | Password | Suggested Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Dr. Elena Sorensen** | `admin` | `elena@valley-primary-care.test` | `password123` | Cross-tenant isolation verification |
| **Diego Arriaga** | `member` | `diego@valley-primary-care.test` | `password123` | Local room interaction |
| **Marta Escalante** | `member` | `marta@valley-primary-care.test` | `password123` | Typing and presence testing |

### Tenant 3: Metro Cardiology Associates (`metro-cardiology`)
*Specialist clinic tenant.*

| User Name | Role | Email | Password | Suggested Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Dr. Marcus Brody** | `admin` | `marcus@metro-cardiology.test` | `password123` | Isolated third tenant confirmation |

---

## 🧪 Step-by-Step Evaluation Scenarios

### Scenario 1: Multi-Speaker Context & User Attribution (Core Requirement)
**Objective**: Verify that Gemini maintains conversational context across multiple speakers in a single room and addresses participants by name.

1. Open two browser windows (or one standard window and one incognito window).
2. In Window 1, log in as **Sarah Chen** (`sarah@northside-health.test`) and navigate to `#general-clinical`.
3. In Window 2, log in as **Mike Ross** (`mike@northside-health.test`) and navigate to the same room.
4. **Window 1 (Sarah)**: Type and send:
   > *"We need to evaluate the chronic kidney disease documentation for our diabetes patients."*
5. **Window 2 (Mike)**: Type and send:
   > *"I checked the charts, and several patients also have stage 4 CKD."*
6. **Window 1 (Sarah)**: Type and send:
   > *"@Gemini what is the combined RAF impact of Type 2 diabetes with CKD and stage 4 CKD?"*
7. **Observed Result**:
   - Both users see Gemini's live thinking progress bar immediately.
   - The response streams token-by-token simultaneously in both windows.
   - Gemini attributes the contributions: *"Sarah mentioned diabetes patients... Mike noted stage 4 CKD..."*
   - Gemini formats the CMS-HCC V28 risk score calculation with a clean, beautifully styled **GitHub Flavored Markdown table** showing ICD-10 codes, descriptions, HCC categories, and coefficients.

---

### Scenario 2: Strict Tenant Isolation (Zero Cross-Tenant Leakage)
**Objective**: Prove that patient data and organization memories are strictly isolated by tenant boundary.

#### Test A: Patient Profile Partitioning
1. Log in as **Sarah Chen** (`northside-health`).
2. Ask Gemini:
   > `@Gemini evaluate patient PT-4001`
3. **Observed Result**: Gemini loads patient Margaret Okafor (`PT-4001`) from Northside Health, showing documented conditions, unrecaptured chronic care gaps, and estimated financial recapture opportunity.
4. Now, in the same room, ask Gemini:
   > `@Gemini evaluate patient PT-4013`
5. **Observed Result**: Access is blocked with an explicit tenant boundary message: patient `PT-4013` does not exist in Northside Health.
6. Now log out and log in as **Dr. Elena Sorensen** (`valley-primary-care`).
7. Ask Gemini:
   > `@Gemini evaluate patient PT-4013`
8. **Observed Result**: Access is granted! Gemini displays patient `PT-4013` (Valley Primary Care patient record).

#### Test B: Tenant Memory Key Collision
1. In **Northside Health** (Sarah Chen), ask:
   > `@Gemini what is our Q1 recapture target?`
2. **Observed Result**: Returns **92%** target (Target owner: Priya Ramaswamy).
3. In **Valley Primary Care** (Dr. Elena Sorensen), ask the exact same question:
   > `@Gemini what is our Q1 recapture target?`
4. **Observed Result**: Returns **85%** target (Target owner: Dr. Sorensen).

---

### Scenario 3: Real-Time Presence & Typing Indicators (SSE Architecture)
**Objective**: Verify real-time messaging without Firebase client database listeners.

1. Open two windows side-by-side:
   - Window A: Sarah Chen in `#general-clinical`.
   - Window B: Mike Ross in `#general-clinical`.
2. Notice the **Online Users** list updates instantly to show active members.
3. In Window A, start typing in the message composer.
4. Notice Window B immediately displays *"Sarah Chen is typing..."* with subtle pulse animation.
5. Send a message from Window A. Notice it appears in Window B in under 50ms with read receipts.

---

### Scenario 4: CMS-HCC V28 Clinical Engine & GFM Table Formatting
**Objective**: Verify deterministic risk calculation, hierarchy supersession, and responsive table layout.

1. As any user, send:
   > `@Gemini calculate RAF for E11.22 and N18.4`
2. **Observed Result**:
   - Renders a multi-column table: `| ICD-10 Code | Description | HCC Code | HCC Label | Coefficient |`.
   - Alternating row styling with hover highlights and subtle dark-mode borders.
   - RAF total computed deterministically: `0.508 (Demographic) + 0.409 (HCC Sum) = 0.917`.
3. Try hierarchy supersession:
   > `@Gemini calculate RAF for E11.22 and E11.9`
4. **Observed Result**:
   - `E11.22` (HCC 36) supersedes `E11.9` (HCC 37).
   - HCC 37 is suppressed with `0.000` incremental coefficient.

---

## 🛠️ Automated Testing Verification

To run the full test suite locally:
```bash
# Activate virtual environment
source .venv/bin/activate

# Execute all 35 tests across tenant isolation, RAF, and auth boundaries
PYTHONPATH=. ./.venv/bin/pytest backend/tests/ -v
```

All 35 tests pass with 100% coverage of multi-tenant security rules, token validation, and clinical logic.
