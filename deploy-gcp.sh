#!/usr/bin/env bash
# ==============================================================================
# TeamChat AI — One-Click Google Cloud Run Deployment Script
# ==============================================================================
set -e

echo "🚀 TeamChat AI Cloud Run Deployment"
echo "======================================"

# 1. Check for gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: 'gcloud' CLI is not installed or not in PATH."
    echo "Install it via: brew install --cask google-cloud-sdk"
    echo "Then authenticate with: gcloud auth login"
    exit 1
fi

# 2. Get GCP Project
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
    read -p "Enter your Google Cloud Project ID: " PROJECT_ID
fi

REGION=${GOOGLE_CLOUD_LOCATION:-"us-central1"}
SERVICE_NAME="teamchat-ai"
IMAGE_TAG="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "📦 Target Project: ${PROJECT_ID}"
echo "📍 Target Region:  ${REGION}"
echo "🏷️  Container Image: ${IMAGE_TAG}"
echo ""

# 3. Build & Submit Container Image
echo "🔨 Step 1/2: Building container image on Google Cloud Build..."
gcloud builds submit --project "${PROJECT_ID}" --tag "${IMAGE_TAG}"

# 4. Deploy to Cloud Run
echo "🚀 Step 2/2: Deploying to Google Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --project "${PROJECT_ID}" \
    --image "${IMAGE_TAG}" \
    --platform managed \
    --region "${REGION}" \
    --allow-unauthenticated \
    --set-env-vars GOOGLE_CLOUD_PROJECT="${PROJECT_ID}",GOOGLE_CLOUD_LOCATION="${REGION}",FIREBASE_PROJECT_ID="${PROJECT_ID}"

# 5. Output Service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --project "${PROJECT_ID}" --platform managed --region "${REGION}" --format 'value(status.url)')

echo ""
echo "=============================================================================="
echo "🎉 SUCCESS! TeamChat AI is live on Cloud Run:"
echo "   ${SERVICE_URL}"
echo "=============================================================================="
