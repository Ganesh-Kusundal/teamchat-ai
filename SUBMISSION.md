# TeamChat AI — Technical Assessment Submission

**Position**: Staff/Principal Full-Stack Engineer  
**Candidate**: Ganesh Kusundal  
**Date**: September 7, 2026  
**Evaluation Deliverables**:
- **Live Application URL**: [https://teamchat-ai-456789-aee59.web.app](https://teamchat-ai-456789-aee59.web.app)
- **Cloud Run API URL**: [https://teamchat-ai-872402492611.us-central1.run.app](https://teamchat-ai-872402492611.us-central1.run.app)
- **API Health Check**: [https://teamchat-ai-872402492611.us-central1.run.app/api/health](https://teamchat-ai-872402492611.us-central1.run.app/api/health)
- **GitHub Repository**: [https://github.com/Ganesh-Kusundal/teamchat-ai](https://github.com/Ganesh-Kusundal/teamchat-ai)

---

## 📧 Ready-to-Send Submission Email

**To**: `gonzalo.alessandrelli@doctustech.com`  
**CC**: `himadri.sharma@gmail.com`  
**Subject**: Technical Assessment Submission: Multi-Tenant Collaborative AI Chat Platform — Ganesh Kusundal

```text
Hi Gonzalo and Himadri,

I have completed the technical assessment for the Staff/Principal Full-Stack Engineer role and deployed TeamChat AI to Google Cloud.

Key Links:
• Live Application: https://teamchat-ai-456789-aee59.web.app
• Cloud Run API: https://teamchat-ai-872402492611.us-central1.run.app
• GitHub Repository: https://github.com/Ganesh-Kusundal/teamchat-ai
• Test Credentials & Evaluation Guide: https://github.com/Ganesh-Kusundal/teamchat-ai/blob/main/TEST_CREDENTIALS.md

Architecture & Highlights:
1. Multi-Speaker Context Attribution:
   When Gemini is invoked (@Gemini), it analyzes prior conversation history, identifies every active participant by name, and addresses them directly with contextual feedback.

2. Strict Multi-Tenant Isolation:
   - Evaluator accounts are pre-seeded across 3 organizations: Northside Health System, Valley Primary Care, and Metro Cardiology Associates.
   - Tenant isolation is strictly enforced at the API layer (dependency-injected RequestContext), data layer (organization-scoped Firestore collections), and tool execution boundary (LLM tool calls cannot access cross-tenant PHI or memories).

3. Real-Time Collaboration Without Direct Firebase DB Listeners:
   - In accordance with the prompt guidance, real-time messaging, typing indicators, presence, and token-by-token AI streaming are served via high-performance Server-Sent Events (SSE) orchestrated by the FastAPI backend.
   - Includes cross-instance horizontal fan-out with short-lived relay logs for Cloud Run multi-instance scale.

4. Clinical Intelligence & CMS-HCC V28 Engine:
   - Includes full 6-step Risk Adjustment Factor (RAF) calculation, demographic coefficients, and hierarchy supersession logic (e.g. HCC 36 superseding HCC 37).
   - Rich GitHub Flavored Markdown (GFM) tables with custom styling, row hovering, and responsive container formatting.
   - Resilient streaming pipeline with automatic multi-model fallback and deterministic clinical engines if cloud model quotas are exhausted.

5. Test Suite & Code Quality:
   - 35/35 automated Pytest tests passing covering tenant isolation, RAF math, auth boundaries, and room permissions.
   - Clean React 19 + TypeScript frontend with zero compilation warnings (npx tsc --noEmit passes).

Evaluation Accounts (All passwords: password123):
• Northside Health: sarah@northside-health.test (Admin), mike@northside-health.test (Member), lisa@northside-health.test (Member)
• Valley Primary Care: elena@valley-primary-care.test (Admin), diego@valley-primary-care.test (Member)
• Metro Cardiology: marcus@metro-cardiology.test (Admin)
(The login screen also features a 1-Click Evaluator Switcher for instant login without manual typing.)

Please feel free to reach out if you have any questions. I look forward to your feedback and discussing the system architecture.

Best regards,
Ganesh Kusundal
```

---

## 📋 Feature Verification Matrix

| Assessment Requirement | Implementation Details | Status |
| :--- | :--- | :--- |
| **Multi-Tenancy** | 3 pre-seeded organizations (`northside-health`, `valley-primary-care`, `metro-cardiology`). Isolated rooms, users, messages, patient PHI, and organization memories. | ✅ Complete |
| **User Attribution** | Context constructor injects `[HH:MM] Name: content` with trailing speaker prompts. Gemini explicitly addresses speakers. | ✅ Complete |
| **Real-Time Delivery** | FastAPI Server-Sent Events (SSE) with typing indicators, online presence, and token streaming. Zero Firebase client DB listeners. | ✅ Complete |
| **Gemini Integration** | Official `@google/genai` Python SDK, function declarations, CMS-HCC V28 clinical engine, multi-model candidate cascade, and deterministic fallback. | ✅ Complete |
| **User Interface** | React 19 + TypeScript, Tailwind CSS, Lucide icons, Framer Motion, thinking state progress bars, and GFM markdown tables. | ✅ Complete |
| **Deployment** | Firebase Hosting CDN (frontend) + Cloud Run auto-scaling container (backend) on Google Cloud Platform. | ✅ Complete |
| **Automated Testing** | 35 Pytest unit & integration tests covering tenant boundaries, token extraction, RAF calculations, and room guards. | ✅ Complete |
