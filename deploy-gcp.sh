#!/usr/bin/env bash
# ==============================================================================
# TeamChat AI — Google Cloud Run + Firebase Hosting deployment
# ==============================================================================
set -euo pipefail

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI is required: https://cloud.google.com/sdk/docs/install" >&2
  exit 1
fi
if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI is required: https://firebase.google.com/docs/cli" >&2
  exit 1
fi

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  read -r -p "Enter your Google Cloud project ID: " PROJECT_ID
fi
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-teamchat-ai}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/teamchat/${SERVICE_NAME}:latest"
FIREBASE_WEB_API_KEY="${FIREBASE_WEB_API_KEY:-}"
CORS_ORIGINS="${CORS_ORIGINS:-}"

if [[ -z "${FIREBASE_WEB_API_KEY}" ]]; then
  read -r -p "Enter the Firebase Web API key (Firebase console > Project settings): " FIREBASE_WEB_API_KEY
fi
if [[ -z "${CORS_ORIGINS}" ]]; then
  read -r -p "Enter the production frontend origin (for example https://PROJECT.web.app): " CORS_ORIGINS
fi

GCLOUD_ARGS=(--project "${PROJECT_ID}")

echo "Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  aiplatform.googleapis.com \
  identitytoolkit.googleapis.com \
  --project "${PROJECT_ID}"

echo "Creating Firestore database if it does not exist..."
if ! gcloud firestore databases describe --database='(default)' "${GCLOUD_ARGS[@]}" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database='(default)' \
    --location="${REGION}" \
    --type=firestore-native \
    "${GCLOUD_ARGS[@]}"
fi

echo "Creating Artifact Registry repository if it does not exist..."
if ! gcloud artifacts repositories describe teamchat "${GCLOUD_ARGS[@]}" --location="${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create teamchat \
    --repository-format=docker \
    --location="${REGION}" \
    --description="TeamChat AI container images" \
    "${GCLOUD_ARGS[@]}"
fi

echo "Building ${IMAGE}..."
gcloud builds submit --tag "${IMAGE}" "${GCLOUD_ARGS[@]}"

echo "Deploying Cloud Run service..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --min 1 \
  --max 10 \
  --timeout 3600 \
  --concurrency 80 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},FIREBASE_PROJECT_ID=${PROJECT_ID},FIREBASE_WEB_API_KEY=${FIREBASE_WEB_API_KEY},STORAGE_BACKEND=firestore,FIRESTORE_DATABASE=(default),CORS_ORIGINS=${CORS_ORIGINS}" \
  "${GCLOUD_ARGS[@]}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" "${GCLOUD_ARGS[@]}" --region "${REGION}" --format='value(status.url)')"
echo "Cloud Run URL: ${SERVICE_URL}"

echo "Seeding Firestore and Firebase Auth users..."
SEED_PYTHON="python3"
if [[ -x .venv/bin/python ]]; then SEED_PYTHON=".venv/bin/python"; fi
GOOGLE_CLOUD_PROJECT="${PROJECT_ID}" \
FIREBASE_PROJECT_ID="${PROJECT_ID}" \
STORAGE_BACKEND=memory \
  "${SEED_PYTHON}" scripts/seed_firestore.py --seed-auth

echo "Deploying Firebase Hosting..."
firebase use "${PROJECT_ID}"
npm run build
firebase deploy --only hosting --project "${PROJECT_ID}"

echo "Deployment complete. Verify ${SERVICE_URL}/api/health and the Firebase Hosting URL."
