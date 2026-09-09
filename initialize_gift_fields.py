"""
Genesis'26 — Safe, Idempotent Freshers Gift Fields Initialization Migration
Initializes `giftGiven: False` and `giftTime: None` on Firestore student documents.

Safety guarantees:
1. Dry-run capable: Run with `--dry-run` to preview changes without modifying anything.
2. Idempotent: Running multiple times causes no additional writes once initialized.
3. Non-destructive: Uses selective updates; never overwrites existing fields (payment, passId, entryUsed, foodUsed, etc.).
4. Preserves claims: Never resets or touches documents where `giftGiven: True`.
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
    parser = argparse.ArgumentParser(description="Initialize giftGiven and giftTime fields in Firestore students collection.")
    parser.add_argument("--execute", action="store_true", help="Perform actual writes. Without this flag, runs in dry-run mode.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run mode (default).")
    args = parser.parse_args()

    is_dry_run = not args.execute

    print("=" * 65)
    print("GENESIS'26 — FRESHERS GIFT FIELDS INITIALIZATION MIGRATION")
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
        doc_data = d.to_dict()
        doc_id = d.id

        gift_given = doc_data.get("giftGiven")

        if gift_given is True:
            already_claimed.append((doc_id, doc_data.get("name", "Unknown"), doc_data.get("giftTime")))
        elif gift_given is False:
            already_initialized.append((doc_id, doc_data.get("name", "Unknown")))
        else:
            needing_init.append((doc_id, doc_data.get("name", "Unknown"), doc_data.get("year", "Unknown")))

    print("--- AUDIT SUMMARY ---")
    print(f"Total documents inspected:               {total_docs}")
    print(f"Documents with gift already claimed (True): {len(already_claimed)}")
    print(f"Documents already initialized (False):      {len(already_initialized)}")
    print(f"Documents needing initialization:           {len(needing_init)}")
    print("-" * 65)

    if not needing_init:
        print("\n✔ All student documents are already properly initialized. No action needed.")
        return

    if is_dry_run:
        print(f"\n[DRY RUN PREVIEW] {len(needing_init)} documents would be updated with:")
        print("  - giftGiven: False")
        print("  - giftTime: None")
        print("\nSample records to be initialized (first 5):")
        for doc_id, name, year in needing_init[:5]:
            print(f"  • ID: {doc_id} | Name: {name} | Year: {year}")
        print(f"\nTo apply these updates to Firestore, run:\n  python {sys.argv[0]} --execute")
        return

    # Execute batched updates in chunks of 450 (Firestore limit is 500 ops per batch)
    print(f"\nApplying non-destructive updates to {len(needing_init)} documents in Firestore...")
    batch_size = 450
    total_updated = 0

    for i in range(0, len(needing_init), batch_size):
        batch = db.batch()
        chunk = needing_init[i:i + batch_size]

        for doc_id, _, _ in chunk:
            doc_ref = db.collection(COLLECTION_NAME).document(doc_id)
            batch.update(doc_ref, {
                "giftGiven": False,
                "giftTime": None
            })

        batch.commit()
        total_updated += len(chunk)
        print(f"  Committed batch {i // batch_size + 1}: {len(chunk)} documents updated (Progress: {total_updated}/{len(needing_init)})")

    print("\n" + "=" * 65)
    print("✔ MIGRATION COMPLETE!")
    print(f"Successfully initialized {total_updated} student documents with giftGiven=False and giftTime=None.")
    print("All existing fields (payment, entryUsed, foodUsed, passId, etc.) were left completely untouched.")
    print("=" * 65)

if __name__ == "__main__":
    main()
