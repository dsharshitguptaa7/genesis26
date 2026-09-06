"""
Genesis'26 — Safe, Idempotent Food Fields Initialization Migration
Initializes `foodUsed: False` and `foodTime: None` on Firestore student documents.

Safety guarantees:
1. Dry-run capable: Run with `--dry-run` to preview changes without modifying anything.
2. Idempotent: Running multiple times causes no additional writes once initialized.
3. Non-destructive: Uses selective updates; never overwrites existing fields (payment, passId, entryUsed, etc.).
4. Preserves claims: Never resets or touches documents where `foodUsed: True`.
"""

import sys
import argparse
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, firestore

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SERVICE_ACCOUNT_FILE = Path("serviceAccountKey.json")
COLLECTION_NAME = "students"

def initialize_firebase():
    if not SERVICE_ACCOUNT_FILE.exists():
        print(f"\n❌ Service account file not found: {SERVICE_ACCOUNT_FILE}")
        sys.exit(1)

    try:
        app = firebase_admin.get_app()
    except ValueError:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT_FILE))
        app = firebase_admin.initialize_app(cred)

    return firestore.client()

def main():
    parser = argparse.ArgumentParser(description="Initialize foodUsed and foodTime fields in Firestore students collection.")
    parser.add_argument("--execute", action="store_true", help="Perform actual writes. Without this flag, runs in dry-run mode.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run mode (default).")
    args = parser.parse_args()

    is_dry_run = not args.execute

    print("=" * 65)
    print("GENESIS'26 — FOOD FIELDS INITIALIZATION MIGRATION")
    print("=" * 65)
    print(f"Mode: {'🔍 DRY RUN (Preview only, no writes)' if is_dry_run else '⚡ EXECUTE (Applying non-destructive updates)'}")
    print(f"Target Collection: {COLLECTION_NAME}\n")

    db = initialize_firebase()

    print("Fetching student records from Firestore...")
    docs = list(db.collection(COLLECTION_NAME).stream())
    total_docs = len(docs)
    print(f"Total student records retrieved: {total_docs}\n")

    already_claimed = []
    already_initialized = []
    needing_init = []

    for d in docs:
        data = d.to_dict()
        enrollment = d.id

        if data.get("foodUsed") is True:
            already_claimed.append((enrollment, data.get("name"), data.get("passId")))
        elif data.get("foodUsed") is False:
            already_initialized.append(enrollment)
        else:
            # foodUsed is missing or None
            needing_init.append((enrollment, data.get("name"), data.get("passId")))

    print("-" * 65)
    print("AUDIT SUMMARY:")
    print(f"  • Total student records        : {total_docs}")
    print(f"  • Food already claimed (True)  : {len(already_claimed)} (will NOT be touched)")
    print(f"  • Food already initialized     : {len(already_initialized)} (will NOT be touched)")
    print(f"  • Needing initialization       : {len(needing_init)}")
    print("-" * 65)

    if already_claimed:
        print("\nSample already claimed records:")
        for enr, name, pid in already_claimed[:3]:
            print(f"  - {enr} | {name} | {pid} (foodUsed=True)")

    if needing_init:
        print("\nSample records needing initialization:")
        for enr, name, pid in needing_init[:5]:
            print(f"  - {enr} | {name} | {pid} -> will set foodUsed=False, foodTime=None")

    if not needing_init:
        print("\n✅ All student records are already properly initialized with food fields. Nothing to do!")
        return

    if is_dry_run:
        print("\n" + "=" * 65)
        print(f"DRY RUN COMPLETE: {len(needing_init)} records need initialization.")
        print("To apply changes to Firestore, re-run with:")
        print("    python initialize_food_fields.py --execute")
        print("=" * 65)
        return

    # Execute Phase
    print(f"\n⚡ Applying updates to {len(needing_init)} documents in batches of 450...")
    batch = db.batch()
    batch_count = 0
    updated_count = 0

    for enr, _, _ in needing_init:
        doc_ref = db.collection(COLLECTION_NAME).document(enr)
        # Non-destructive update: only sets foodUsed and foodTime
        batch.update(doc_ref, {
            "foodUsed": False,
            "foodTime": None
        })
        batch_count += 1
        updated_count += 1

        if batch_count >= 450:
            batch.commit()
            print(f"  • Committed {updated_count}/{len(needing_init)} records...")
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()
        print(f"  • Committed {updated_count}/{len(needing_init)} records...")

    print("\n" + "=" * 65)
    print(f"🎉 SUCCESS: Successfully initialized {updated_count} student records with:")
    print("    foodUsed: False")
    print("    foodTime: None")
    print("=" * 65)

    # Verification check
    print("\nRunning post-migration verification...")
    post_docs = list(db.collection(COLLECTION_NAME).stream())
    post_needing = sum(1 for d in post_docs if d.to_dict().get("foodUsed") is None and "foodUsed" not in d.to_dict())
    post_false = sum(1 for d in post_docs if d.to_dict().get("foodUsed") is False)
    post_true = sum(1 for d in post_docs if d.to_dict().get("foodUsed") is True)

    print(f"Post-migration check: Total={len(post_docs)}, foodUsed=False: {post_false}, foodUsed=True: {post_true}, Missing: {post_needing}")
    assert post_needing == 0, f"Error: {post_needing} documents still missing foodUsed!"
    assert len(post_docs) == total_docs, f"Error: Total document count changed from {total_docs} to {len(post_docs)}!"
    print("✅ All integrity checks passed. Migration is verified safe and complete.")

if __name__ == "__main__":
    main()
