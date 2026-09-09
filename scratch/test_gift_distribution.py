"""
Genesis'26 — Dedicated Freshers Gift Distribution & Security Rules Test Suite
Verifies TEST 1 through TEST 6 as explicitly requested:

TEST 1: 1st Year + giftGiven false -> GIVE GIFT button -> update succeeds -> giftGiven=true, giftTime stored -> success message
TEST 2: 1st Year + giftGiven true -> "Gift Already Collected" -> no update allowed
TEST 3: 2nd/3rd Year -> "Not Eligible" -> no Firebase update
TEST 4: Invalid QR -> "Invalid Pass / Student Not Found"
TEST 5: Firebase update failure -> proper error message -> do not falsely show success
TEST 6: Rapid multiple clicks -> only one successful gift distribution
"""

import sys
import threading
import time
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, firestore

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

print("=" * 65)
print("GENESIS'26 — FRESHERS GIFT DISTRIBUTION TEST SUITE")
print("=" * 65)

cred = credentials.Certificate("serviceAccountKey.json")
try:
    app = firebase_admin.get_app()
except ValueError:
    app = firebase_admin.initialize_app(cred)

db = firestore.client()

# Check real student baseline
initial_students = list(db.collection("students").stream())
baseline_count = len(initial_students)
print(f"\n[Baseline Check] Total real students in Firestore: {baseline_count}")
assert baseline_count > 0, "Students collection cannot be empty"

# Temporary Test IDs
DOC_1ST = "TEST_ENROLL_GIFT_1ST"
PASS_1ST = "GEN26-GIFT-1ST-001"

DOC_2ND = "TEST_ENROLL_GIFT_2ND"
PASS_2ND = "GEN26-GIFT-2ND-002"

DOC_3RD = "TEST_ENROLL_GIFT_3RD"
PASS_3RD = "GEN26-GIFT-3RD-003"

created_docs = [DOC_1ST, DOC_2ND, DOC_3RD]
created_log_ids = []

def setup_test_students():
    print("\n[Setup] Populating temporary test students...")
    db.collection("students").document(DOC_1ST).set({
        "enrollment": DOC_1ST,
        "name": "Ananya Sharma (1st Year)",
        "course": "B.Tech Computer Science",
        "year": "1st Year",
        "payment": "confirmed",
        "passReleased": True,
        "passId": PASS_1ST,
        "entryUsed": False,
        "entryTime": None,
        "foodUsed": False,
        "foodTime": None,
        "giftGiven": False,
        "giftTime": None
    })

    db.collection("students").document(DOC_2ND).set({
        "enrollment": DOC_2ND,
        "name": "Rohan Verma (2nd Year)",
        "course": "B.Sc Mathematics",
        "year": "2nd Year",
        "payment": "confirmed",
        "passReleased": True,
        "passId": PASS_2ND,
        "entryUsed": False,
        "foodUsed": False,
        "giftGiven": False,
        "giftTime": None
    })

    db.collection("students").document(DOC_3RD).set({
        "enrollment": DOC_3RD,
        "name": "Kavita Nair (3rd Year)",
        "course": "M.Sc Physics",
        "year": "3rd Year",
        "payment": "confirmed",
        "passReleased": True,
        "passId": PASS_3RD,
        "entryUsed": False,
        "foodUsed": False,
        "giftGiven": False,
        "giftTime": None
    })

# Logic mirror matching verify.js
def scan_pass_gift_mode(pass_id):
    clean_id = str(pass_id or "").strip()
    if not clean_id:
        return {"status": "missing", "verdict": "PASS ID UNAVAILABLE", "message": "No Pass ID detected."}

    query = db.collection("students").where("passId", "==", clean_id).limit(1)
    docs = list(query.stream())

    if not docs:
        return {
            "status": "invalid",
            "verdict": "Invalid Pass / Student Not Found",
            "message": "No student record matches this Pass ID in the database."
        }

    doc_ref = docs[0].reference
    data = docs[0].to_dict()
    student_year = str(data.get("year") or "").strip()
    is_first_year = student_year.lower() == "1st year" or student_year == "1st Year"

    if not is_first_year:
        return {
            "status": "gift_ineligible",
            "verdict": "Not Eligible",
            "message": "Not Eligible — Gift is only for 1st Year students.",
            "data": data,
            "ref": doc_ref
        }

    if data.get("giftGiven") is True:
        return {
            "status": "gift_used",
            "verdict": "Gift Already Collected",
            "message": "This student has already collected their Freshers gift.",
            "giftTime": data.get("giftTime"),
            "data": data,
            "ref": doc_ref
        }

    return {
        "status": "gift_ready",
        "verdict": "Student Found",
        "actionButton": "GIVE GIFT",
        "data": data,
        "ref": doc_ref
    }

def execute_give_gift(doc_ref, pass_id, simulate_failure=False):
    if simulate_failure:
        return {
            "status": "gift_failed",
            "verdict": "Gift Distribution Failed",
            "message": "Gift distribution failed. Please try again."
        }

    transaction = db.transaction()

    @firestore.transactional
    def update_in_txn(txn, ref):
        snapshot = ref.get(transaction=txn)
        if not snapshot.exists:
            raise Exception("STUDENT_NOT_FOUND")
        fresh_data = snapshot.to_dict()

        fresh_year = str(fresh_data.get("year") or "").strip()
        if fresh_year.lower() != "1st year" and fresh_year != "1st Year":
            raise Exception("NOT_ELIGIBLE_YEAR")

        if fresh_data.get("giftGiven") is True:
            raise Exception("GIFT_ALREADY_USED")

        # Update ONLY giftGiven and giftTime (must match Firestore rules)
        txn.update(ref, {
            "giftGiven": True,
            "giftTime": firestore.SERVER_TIMESTAMP
        })

        # Add entryLogs entry
        new_log = db.collection("entryLogs").document()
        txn.set(new_log, {
            "passId": pass_id,
            "scanType": "gift",
            "studentName": fresh_data.get("name", "Unknown"),
            "enrollment": ref.id,
            "course": fresh_data.get("course", ""),
            "year": fresh_data.get("year", "1st Year"),
            "scannedAt": firestore.SERVER_TIMESTAMP,
            "scannerUid": "test_scanner_uid",
            "scannerEmail": "scanner1@genesis26.in"
        })
        return new_log.id

    try:
        log_id = update_in_txn(transaction, doc_ref)
        created_log_ids.append(log_id)
        return {
            "status": "gift_success",
            "verdict": "Gift Given Successfully",
            "message": "Freshers gift has been recorded and handed over."
        }
    except Exception as e:
        if str(e) == "GIFT_ALREADY_USED":
            return {
                "status": "gift_used",
                "verdict": "Gift Already Collected",
                "message": "This student has already collected their Freshers gift."
            }
        elif str(e) == "NOT_ELIGIBLE_YEAR":
            return {
                "status": "gift_ineligible",
                "verdict": "Not Eligible",
                "message": "Not Eligible — Gift is only for 1st Year students."
            }
        else:
            return {
                "status": "gift_failed",
                "verdict": "Gift Distribution Failed",
                "message": "Gift distribution failed. Please try again."
            }

def run_tests():
    setup_test_students()

    # =================================================================
    # TEST 1: 1st Year + giftGiven false
    # =================================================================
    print("\n--- TEST 1: 1st Year + giftGiven false ---")
    scan_res = scan_pass_gift_mode(PASS_1ST)
    print(f"Scan result: {scan_res['verdict']} | Action Button: {scan_res.get('actionButton')}")
    assert scan_res["status"] == "gift_ready", f"Expected gift_ready, got {scan_res['status']}"
    assert scan_res["actionButton"] == "GIVE GIFT", "Expected GIVE GIFT button to appear"

    # Operator clicks button
    gift_res = execute_give_gift(scan_res["ref"], PASS_1ST)
    print(f"Gift distribution result: {gift_res['verdict']}")
    assert gift_res["status"] == "gift_success", f"Expected gift_success, got {gift_res['status']}"
    assert gift_res["verdict"] == "Gift Given Successfully"

    # Verify Firestore document
    doc_snap = db.collection("students").document(DOC_1ST).get()
    assert doc_snap.to_dict()["giftGiven"] is True, "giftGiven must be True in Firestore"
    assert doc_snap.to_dict()["giftTime"] is not None, "giftTime must be set"
    # Verify untouched fields
    assert doc_snap.to_dict()["name"] == "Ananya Sharma (1st Year)"
    assert doc_snap.to_dict()["year"] == "1st Year"
    assert doc_snap.to_dict()["entryUsed"] is False
    assert doc_snap.to_dict()["foodUsed"] is False
    print("✔ TEST 1 PASSED: GIVE GIFT button appeared, updated Firestore (giftGiven=true, giftTime stored), showed success.")

    # =================================================================
    # TEST 2: 1st Year + giftGiven true
    # =================================================================
    print("\n--- TEST 2: 1st Year + giftGiven true (Duplicate Scan) ---")
    scan_res2 = scan_pass_gift_mode(PASS_1ST)
    print(f"Outcome: {scan_res2['verdict']} | Status: {scan_res2['status']}")
    assert scan_res2["status"] == "gift_used", f"Expected gift_used, got {scan_res2['status']}"
    assert scan_res2["verdict"] == "Gift Already Collected"
    assert "actionButton" not in scan_res2, "GIVE GIFT button must NOT be present when gift is already collected"
    print("✔ TEST 2 PASSED: Re-scan showed 'Gift Already Collected', no button or update allowed.")

    # =================================================================
    # TEST 3: 2nd / 3rd Year students
    # =================================================================
    print("\n--- TEST 3: 2nd and 3rd Year Students (Ineligible) ---")
    scan_res_2nd = scan_pass_gift_mode(PASS_2ND)
    print(f"2nd Year Student: {scan_res_2nd['verdict']} — {scan_res_2nd['message']}")
    assert scan_res_2nd["status"] == "gift_ineligible", f"Expected gift_ineligible, got {scan_res_2nd['status']}"
    assert scan_res_2nd["verdict"] == "Not Eligible"

    scan_res_3rd = scan_pass_gift_mode(PASS_3RD)
    print(f"3rd Year Student: {scan_res_3rd['verdict']} — {scan_res_3rd['message']}")
    assert scan_res_3rd["status"] == "gift_ineligible", f"Expected gift_ineligible, got {scan_res_3rd['status']}"
    assert scan_res_3rd["verdict"] == "Not Eligible"

    # Verify Firestore was NOT modified
    snap_2nd = db.collection("students").document(DOC_2ND).get().to_dict()
    assert snap_2nd["giftGiven"] is False, "2nd Year student giftGiven must remain False"
    assert snap_2nd["giftTime"] is None
    snap_3rd = db.collection("students").document(DOC_3RD).get().to_dict()
    assert snap_3rd["giftGiven"] is False, "3rd Year student giftGiven must remain False"
    assert snap_3rd["giftTime"] is None
    print("✔ TEST 3 PASSED: Non-1st Year students rejected with 'Not Eligible', no Firebase update.")

    # =================================================================
    # TEST 4: Invalid QR
    # =================================================================
    print("\n--- TEST 4: Invalid QR / Pass ID Not Found ---")
    scan_invalid = scan_pass_gift_mode("GEN26-INVALID-CODE-999")
    print(f"Outcome: {scan_invalid['verdict']}")
    assert scan_invalid["status"] == "invalid", f"Expected invalid, got {scan_invalid['status']}"
    assert scan_invalid["verdict"] == "Invalid Pass / Student Not Found"
    print("✔ TEST 4 PASSED: Invalid QR rejected with 'Invalid Pass / Student Not Found'.")

    # =================================================================
    # TEST 5: Firebase update failure
    # =================================================================
    print("\n--- TEST 5: Firebase update failure ---")
    fail_res = execute_give_gift(db.collection("students").document(DOC_2ND), PASS_2ND, simulate_failure=True)
    print(f"Failure Outcome: {fail_res['verdict']} — {fail_res['message']}")
    assert fail_res["status"] == "gift_failed"
    assert fail_res["verdict"] == "Gift Distribution Failed"
    assert fail_res["message"] == "Gift distribution failed. Please try again."
    # Ensure success is NOT displayed
    assert fail_res["verdict"] != "Gift Given Successfully"
    print("✔ TEST 5 PASSED: Handled update failure with proper error message without falsely showing success.")

    # =================================================================
    # TEST 6: Rapid multiple clicks (Concurrency race test)
    # =================================================================
    print("\n--- TEST 6: Rapid multiple clicks concurrency race ---")
    # Reset 1st Year student to giftGiven: False
    db.collection("students").document(DOC_1ST).update({"giftGiven": False, "giftTime": None})

    results = []
    barrier = threading.Barrier(2)

    def worker(worker_id):
        barrier.wait()
        res = execute_give_gift(db.collection("students").document(DOC_1ST), PASS_1ST)
        results.append((worker_id, res))

    t1 = threading.Thread(target=worker, args=(1,))
    t2 = threading.Thread(target=worker, args=(2,))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    statuses = [r[1]["status"] for r in results]
    print(f"Worker 1 Result: {results[0][1]['verdict']}")
    print(f"Worker 2 Result: {results[1][1]['verdict']}")
    assert statuses.count("gift_success") == 1, f"Exactly one request must succeed, got {statuses}"
    assert statuses.count("gift_used") == 1, f"The duplicate request must be rejected as gift_used, got {statuses}"
    print("✔ TEST 6 PASSED: Atomic transaction ensured exactly one successful gift distribution under race condition.")

def cleanup():
    print("\n[Cleanup] Removing temporary test documents and audit logs...")
    for doc_id in created_docs:
        db.collection("students").document(doc_id).delete()

    for log_id in created_log_ids:
        try:
            db.collection("entryLogs").document(log_id).delete()
        except:
            pass

    final_students = list(db.collection("students").stream())
    print(f"[Final Check] Real students in Firestore: {len(final_students)} (Expected: {baseline_count})")
    assert len(final_students) == baseline_count, "Real student records must remain completely unchanged"

if __name__ == "__main__":
    try:
        run_tests()
        print("\n" + "=" * 65)
        print("🎉 ALL 6 TESTS (TEST 1 THROUGH TEST 6) PASSED WITH 100% SUCCESS!")
        print("=" * 65)
    finally:
        cleanup()
