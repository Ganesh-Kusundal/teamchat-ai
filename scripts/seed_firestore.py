"""Seed the production Firestore database from the versioned local fixtures.

Usage:
  GOOGLE_CLOUD_PROJECT=my-project FIREBASE_PROJECT_ID=my-project \
    python scripts/seed_firestore.py --seed-auth

The command is idempotent: document IDs are stable for seed records and writes are
upserts. It never deletes existing production data.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Keep importing seed constants from instantiating the Firestore singleton.
os.environ["STORAGE_BACKEND"] = "memory"
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from google.cloud import firestore  # noqa: E402

from backend.app.config import settings  # noqa: E402
from backend.app.services.chat_store import (  # noqa: E402
    SEED_MESSAGES,
    SEED_ORGANIZATIONS,
    SEED_ROOMS,
    SEED_USERS,
)


def write_seed(db) -> dict[str, int]:
    counts = {"organizations": 0, "users": 0, "rooms": 0, "members": 0, "messages": 0, "memories": 0}
    batch = db.batch()

    for organization in SEED_ORGANIZATIONS:
        org_ref = db.collection("organizations").document(organization.slug)
        batch.set(org_ref, organization.model_dump())
        counts["organizations"] += 1

    for user in SEED_USERS:
        user_ref = db.collection("organizations").document(user.orgSlug).collection("users").document(user.id)
        batch.set(user_ref, user.model_dump(exclude={"passwordHash"}))
        counts["users"] += 1

    for room in SEED_ROOMS:
        room_ref = db.collection("organizations").document(room.orgSlug).collection("rooms").document(room.id)
        batch.set(room_ref, room.model_dump())
        counts["rooms"] += 1
        for user_id in room.memberIds:
            member_ref = room_ref.collection("members").document(user_id)
            batch.set(member_ref, {
                "uid": user_id,
                "orgId": room.orgSlug,
                "roomId": room.id,
                "joinedAt": room.createdAt,
                "addedBy": room.createdBy,
            })
            counts["members"] += 1

    for message in SEED_MESSAGES:
        message_ref = (
            db.collection("organizations").document(message.orgSlug)
            .collection("rooms").document(message.roomId)
            .collection("messages").document(message.id)
        )
        batch.set(message_ref, message.model_dump())
        counts["messages"] += 1

    memory_path = settings.DATA_DIR / "team_memory_seed.json"
    with memory_path.open("r", encoding="utf-8") as handle:
        memories = json.load(handle).get("memories", [])
    for raw_memory in memories:
        memory_ref = (
            db.collection("organizations").document(raw_memory["org_slug"])
            .collection("memories").document(raw_memory["memory_id"])
        )
        batch.set(memory_ref, raw_memory)
        counts["memories"] += 1

    batch.commit()
    return counts


def seed_auth_users(project_id: str) -> int:
    try:
        import firebase_admin
        from firebase_admin import auth, credentials
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.ApplicationDefault(), {"projectId": project_id})
    except ImportError as exc:
        raise RuntimeError("firebase-admin is required for --seed-auth") from exc

    created = 0
    for user in SEED_USERS:
        try:
            firebase_user = auth.get_user_by_email(user.email)
            auth.update_user(firebase_user.uid, password=user.passwordHash or "password123", display_name=user.name)
        except auth.UserNotFoundError:
            firebase_user = auth.create_user(
                email=user.email,
                password=user.passwordHash or "password123",
                display_name=user.name,
            )
            created += 1
        auth.set_custom_user_claims(firebase_user.uid, {
            "orgId": user.orgSlug,
            "role": user.role,
        })
    return created


def main() -> None:
    parser = argparse.ArgumentParser(description="Upsert TeamChat AI seed data into Firestore")
    parser.add_argument("--seed-auth", action="store_true", help="Create/update the Firebase Auth test users and claims")
    args = parser.parse_args()

    if not settings.GOOGLE_CLOUD_PROJECT:
        raise SystemExit("GOOGLE_CLOUD_PROJECT is required")
    db = firestore.Client(project=settings.GOOGLE_CLOUD_PROJECT, database=settings.FIRESTORE_DATABASE)
    counts = write_seed(db)
    print("Firestore seed complete:", counts)

    if args.seed_auth:
        created = seed_auth_users(settings.FIREBASE_PROJECT_ID or settings.GOOGLE_CLOUD_PROJECT)
        print(f"Firebase Auth seed complete: {created} users created; existing users updated")


if __name__ == "__main__":
    main()
