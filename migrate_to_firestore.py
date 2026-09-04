import json
import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


# ============================================================
# CONFIGURATION
# ============================================================

JSON_FILE = Path("data/students.json")
SERVICE_ACCOUNT_FILE = Path("serviceAccountKey.json")

COLLECTION_NAME = "students"

# Safety:
# True  -> only validate, DO NOT upload
# False -> actually upload to Firestore
DRY_RUN = False


# ============================================================
# INITIALIZE FIREBASE
# ============================================================

def initialize_firebase():
    if not SERVICE_ACCOUNT_FILE.exists():
        print(f"\n❌ Service account file not found:")
        print(f"   {SERVICE_ACCOUNT_FILE}")
        print("\nDownload your Firebase service account key and place it")
        print("in the project root with this exact name:")
        print("   serviceAccountKey.json")
        sys.exit(1)

    try:
        firebase_admin.get_app()
    except ValueError:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT_FILE))
        firebase_admin.initialize_app(cred)

    return firestore.client()


# ============================================================
# LOAD JSON
# ============================================================

def load_students():
    if not JSON_FILE.exists():
        print(f"\n❌ JSON file not found:")
        print(f"   {JSON_FILE}")
        sys.exit(1)

    try:
        with open(JSON_FILE, "r", encoding="utf-8") as file:
            data = json.load(file)
    except json.JSONDecodeError as error:
        print(f"\n❌ Invalid JSON file:")
        print(error)
        sys.exit(1)

    if not isinstance(data, list):
        print("\n❌ Expected students.json to contain a list of students.")
        sys.exit(1)

    return data


# ============================================================
# VALIDATE DATA
# ============================================================

def validate_students(students):
    required_fields = [
        "enrollment",
        "name",
        "course",
        "year",
        "formNo",
        "mode",
        "amount",
        "inCharge",
        "payment",
        "status",
        "passReleased",
        "passId",
    ]

    enrollments = {}
    pass_ids = {}

    errors = []

    for index, student in enumerate(students, start=1):

        if not isinstance(student, dict):
            errors.append(
                f"Record #{index}: student record is not an object"
            )
            continue

        # Required fields
        for field in required_fields:
            if field not in student:
                errors.append(
                    f"Record #{index}: missing field '{field}'"
                )

        enrollment = student.get("enrollment")

        if not enrollment:
            errors.append(
                f"Record #{index}: enrollment is empty"
            )
        else:
            enrollment = str(enrollment).strip()

            if enrollment in enrollments:
                errors.append(
                    f"Duplicate enrollment '{enrollment}' "
                    f"(records #{enrollments[enrollment]} and #{index})"
                )
            else:
                enrollments[enrollment] = index

        # Check pass ID duplicates only when a pass ID exists
        pass_id = student.get("passId")

        if pass_id:
            pass_id = str(pass_id).strip()

            if pass_id in pass_ids:
                errors.append(
                    f"Duplicate passId '{pass_id}' "
                    f"(records #{pass_ids[pass_id]} and #{index})"
                )
            else:
                pass_ids[pass_id] = index

    return errors


# ============================================================
# PREPARE FIRESTORE DOCUMENT
# ============================================================

def prepare_student(student):
    """
    Preserve the existing JSON schema and add entry-control fields.
    """

    data = dict(student)

    # Normalize enrollment to string
    data["enrollment"] = str(data["enrollment"]).strip()

    # Normalize pass ID
    if data.get("passId"):
        data["passId"] = str(data["passId"]).strip()

    # Entry control fields
    if "entryUsed" not in data:
        data["entryUsed"] = False

    if "entryTime" not in data:
        data["entryTime"] = None

    return data


# ============================================================
# SHOW SUMMARY
# ============================================================

def print_summary(students):
    confirmed = 0
    pending = 0
    released = 0

    for student in students:
        if student.get("payment") == "confirmed":
            confirmed += 1

        if student.get("payment") == "pending":
            pending += 1

        if student.get("passReleased") is True:
            released += 1

    print("\n" + "=" * 60)
    print("GENESIS'26 FIRESTORE MIGRATION")
    print("=" * 60)

    print(f"Total students       : {len(students)}")
    print(f"Payment confirmed    : {confirmed}")
    print(f"Payment pending      : {pending}")
    print(f"Pass released        : {released}")
    print(f"Collection           : {COLLECTION_NAME}")

    print("=" * 60)


# ============================================================
# MIGRATE
# ============================================================

def migrate_students(db, students):

    collection_ref = db.collection(COLLECTION_NAME)

    # Firestore batch limit is 500 operations.
    batch = db.batch()
    operation_count = 0
    migrated_count = 0

    for student in students:

        data = prepare_student(student)

        enrollment = data["enrollment"]

        # Enrollment is used as Firestore document ID
        doc_ref = collection_ref.document(enrollment)

        batch.set(doc_ref, data)

        operation_count += 1
        migrated_count += 1

        # Commit every 450 operations for safety
        if operation_count >= 450:
            batch.commit()

            print(
                f"✅ Uploaded {migrated_count}/{len(students)} students"
            )

            batch = db.batch()
            operation_count = 0

    # Commit remaining records
    if operation_count > 0:
        batch.commit()

    print("\n🎉 Migration completed successfully!")
    print(f"Total uploaded: {migrated_count}")


# ============================================================
# MAIN
# ============================================================

def main():

    students = load_students()

    print_summary(students)

    print("\n🔍 Validating data...")

    errors = validate_students(students)

    if errors:
        print("\n❌ Validation failed.\n")

        for error in errors:
            print(" -", error)

        print(
            f"\nTotal validation errors: {len(errors)}"
        )

        print(
            "\nFix these errors before running the migration."
        )

        sys.exit(1)

    print("✅ Validation successful.")
    print("✅ No duplicate enrollments found.")
    print("✅ No duplicate pass IDs found.")

    # --------------------------------------------------------
    # DRY RUN
    # --------------------------------------------------------

    if DRY_RUN:
        print("\n" + "=" * 60)
        print("DRY RUN MODE")
        print("=" * 60)
        print("No data has been uploaded to Firestore.")
        print("\nIf everything looks correct:")
        print("1. Open migrate_to_firestore.py")
        print("2. Change:")
        print("      DRY_RUN = True")
        print("   to:")
        print("      DRY_RUN = False")
        print("3. Run the script again.")
        print("=" * 60)

        return

    # --------------------------------------------------------
    # FIREBASE
    # --------------------------------------------------------

    print("\n🔥 Connecting to Firebase...")

    db = initialize_firebase()

    print("✅ Firebase connected.")

    # --------------------------------------------------------
    # CONFIRMATION
    # --------------------------------------------------------

    print("\n⚠️ WARNING")
    print(
        "This will write student records to Firestore collection:"
    )
    print(f"   /{COLLECTION_NAME}")

    confirmation = input(
        "\nType MIGRATE to continue: "
    ).strip()

    if confirmation != "MIGRATE":
        print("\n❌ Migration cancelled.")
        return

    # --------------------------------------------------------
    # UPLOAD
    # --------------------------------------------------------

    migrate_students(db, students)


if __name__ == "__main__":
    main()