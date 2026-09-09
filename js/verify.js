/* =========================================================
   GENESIS'26 — QR ENTRY & FOOD VERIFIER CONTROLLER
   Supports Dual Modes: 1) Gate Entry Scan, 2) Food/Meal Scan
   Atomic Firestore Transactions for Duplicate Prevention & Logs
========================================================= */

import {
    auth,
    db,
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    runTransaction,
    serverTimestamp,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "./firebase-config.js";

// Global Scanner & Session State
let html5QrCode = null;
let isScannerRunning = false;
let isProcessingScan = false;
let currentCameraFacing = "environment"; // Preferred rear camera on mobile
let currentScanPurpose = "gift"; // "gift" (default today for Freshers distribution), "entry", or "food"
let isGivingGift = false; // Latch preventing rapid duplicate clicks on [ GIVE GIFT ]

let sessionEntryCount = 0;
let sessionFoodCount = 0;
let sessionGiftCount = 0;
let sessionLogs = [];

// DOM Element References
const authCard = document.getElementById("authCard");
const dashboardCard = document.getElementById("dashboardCard");
const scannerLoginForm = document.getElementById("scannerLoginForm");
const scannerEmailInput = document.getElementById("scannerEmail");
const scannerPasswordInput = document.getElementById("scannerPassword");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const authAlert = document.getElementById("authAlert");
const loginBtn = document.getElementById("loginBtn");

const activeUserEmail = document.getElementById("activeUserEmail");
const scannedCountBadge = document.getElementById("scannedCountBadge");
const foodCountBadge = document.getElementById("foodCountBadge");
const giftCountBadge = document.getElementById("giftCountBadge");
const logoutBtn = document.getElementById("logoutBtn");

const btnPurposeGift = document.getElementById("btnPurposeGift");
const btnPurposeEntry = document.getElementById("btnPurposeEntry");
const btnPurposeFood = document.getElementById("btnPurposeFood");
const activePurposeBadge = document.getElementById("activePurposeBadge");

const tabCamera = document.getElementById("tabCamera");
const tabManual = document.getElementById("tabManual");
const cameraPanel = document.getElementById("cameraPanel");
const manualPanel = document.getElementById("manualPanel");

const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const cameraBtnIcon = document.getElementById("cameraBtnIcon");
const cameraBtnText = document.getElementById("cameraBtnText");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const cameraErrorBox = document.getElementById("cameraErrorBox");

const manualPassIdInput = document.getElementById("manualPassIdInput");
const manualVerifyBtn = document.getElementById("manualVerifyBtn");

const resultModal = document.getElementById("resultModal");
const resultCard = document.getElementById("resultCard");

const recentHeader = document.getElementById("recentHeader");
const recentScansList = document.getElementById("recentScansList");
const sessionLogCount = document.getElementById("sessionLogCount");

/* =========================================================
   1. INITIALIZATION & AUTHENTICATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initAuthListeners();
    initPurposeListeners();
    initTabListeners();
    initManualVerifyListeners();
    initRecentAccordion();
});

function initAuthListeners() {
    if (auth) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                showDashboard(user);
            } else {
                showLogin();
            }
        });
    }

    if (togglePasswordBtn && scannerPasswordInput) {
        togglePasswordBtn.addEventListener("click", () => {
            const isPassword = scannerPasswordInput.type === "password";
            scannerPasswordInput.type = isPassword ? "text" : "password";
            togglePasswordBtn.textContent = isPassword ? "🙈" : "👁️";
        });
    }

    if (scannerLoginForm) {
        scannerLoginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            clearAuthAlert();

            const email = scannerEmailInput.value.trim();
            const password = scannerPasswordInput.value;

            if (!email || !password) {
                showAuthAlert("Please enter both email and password.");
                return;
            }

            setLoginLoading(true);

            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("Scanner Login Error:", error);
                let message = "Invalid email or password. Please try again.";
                if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
                    message = "Invalid scanner credentials. Please check your email and password.";
                } else if (error.code === "auth/too-many-requests") {
                    message = "Too many failed attempts. Please wait a moment and try again.";
                } else if (error.code === "auth/network-request-failed") {
                    message = "Network error. Please check your internet connection.";
                }
                showAuthAlert(message);
            } finally {
                setLoginLoading(false);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await stopCamera();
            try {
                await signOut(auth);
            } catch (err) {
                console.error("Logout error:", err);
            }
        });
    }
}

function showLogin() {
    stopCamera();
    authCard.style.display = "block";
    dashboardCard.style.display = "none";
    clearAuthAlert();
    if (scannerPasswordInput) scannerPasswordInput.value = "";
}

function showDashboard(user) {
    authCard.style.display = "none";
    dashboardCard.style.display = "block";
    if (activeUserEmail) {
        activeUserEmail.textContent = user.email || "scanner1@genesis26.in";
    }
    updateCountersUI();
    startCamera();
}

function showAuthAlert(msg) {
    if (authAlert) {
        authAlert.textContent = msg;
        authAlert.className = "auth-alert error";
        authAlert.style.display = "block";
    }
}

function clearAuthAlert() {
    if (authAlert) {
        authAlert.textContent = "";
        authAlert.style.display = "none";
    }
}

function setLoginLoading(loading) {
    if (!loginBtn) return;
    const btnText = loginBtn.querySelector(".btn-text");
    const btnSpinner = loginBtn.querySelector(".btn-spinner");

    loginBtn.disabled = loading;
    if (btnText) btnText.textContent = loading ? "Authenticating..." : "Sign In to Scanner";
    if (btnSpinner) btnSpinner.style.display = loading ? "inline-block" : "none";
}

/* =========================================================
   2. SCAN PURPOSE SELECTOR (GIFT vs GATE ENTRY vs FOOD SCAN)
========================================================= */

function initPurposeListeners() {
    if (btnPurposeGift) {
        btnPurposeGift.addEventListener("click", () => {
            setScanPurpose("gift");
        });
    }

    if (btnPurposeEntry) {
        btnPurposeEntry.addEventListener("click", () => {
            setScanPurpose("entry");
        });
    }

    if (btnPurposeFood) {
        btnPurposeFood.addEventListener("click", () => {
            setScanPurpose("food");
        });
    }
}

function setScanPurpose(purpose) {
    currentScanPurpose = purpose;

    const buttons = [
        { btn: btnPurposeGift, key: "gift" },
        { btn: btnPurposeEntry, key: "entry" },
        { btn: btnPurposeFood, key: "food" }
    ];

    buttons.forEach(({ btn, key }) => {
        if (!btn) return;
        const isActive = (key === purpose);
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-checked", isActive ? "true" : "false");
    });

    if (activePurposeBadge) {
        if (purpose === "gift") {
            activePurposeBadge.innerHTML = `
                <span class="purpose-tag-icon">🎁</span>
                <span class="purpose-tag-text">MODE: FRESHERS GIFT SCAN</span>
            `;
        } else if (purpose === "entry") {
            activePurposeBadge.innerHTML = `
                <span class="purpose-tag-icon">🎟️</span>
                <span class="purpose-tag-text">MODE: GATE ENTRY SCAN</span>
            `;
        } else if (purpose === "food") {
            activePurposeBadge.innerHTML = `
                <span class="purpose-tag-icon">🍽️</span>
                <span class="purpose-tag-text">MODE: FOOD / MEAL SCAN</span>
            `;
        }
    }
}

function updateCountersUI() {
    if (scannedCountBadge) scannedCountBadge.textContent = `${sessionEntryCount} Entries`;
    if (foodCountBadge) foodCountBadge.textContent = `${sessionFoodCount} Meals`;
    if (giftCountBadge) giftCountBadge.textContent = `${sessionGiftCount} Gifts`;
}

/* =========================================================
   3. TAB SWITCHING (CAMERA vs. MANUAL)
========================================================= */

function initTabListeners() {
    if (tabCamera) {
        tabCamera.addEventListener("click", () => {
            tabCamera.classList.add("active");
            tabCamera.setAttribute("aria-selected", "true");
            tabManual.classList.remove("active");
            tabManual.setAttribute("aria-selected", "false");

            cameraPanel.style.display = "block";
            manualPanel.style.display = "none";

            if (!isScannerRunning) {
                startCamera();
            }
        });
    }

    if (tabManual) {
        tabManual.addEventListener("click", () => {
            tabManual.classList.add("active");
            tabManual.setAttribute("aria-selected", "true");
            tabCamera.classList.remove("active");
            tabCamera.setAttribute("aria-selected", "false");

            manualPanel.style.display = "block";
            cameraPanel.style.display = "none";

            stopCamera();
            if (manualPassIdInput) manualPassIdInput.focus();
        });
    }

    if (toggleCameraBtn) {
        toggleCameraBtn.addEventListener("click", () => {
            if (isScannerRunning) {
                stopCamera();
            } else {
                startCamera();
            }
        });
    }

    if (switchCameraBtn) {
        switchCameraBtn.addEventListener("click", async () => {
            currentCameraFacing = (currentCameraFacing === "environment") ? "user" : "environment";
            await stopCamera();
            startCamera();
        });
    }
}

/* =========================================================
   4. QR SCANNER INTEGRATION (html5-qrcode)
========================================================= */

async function startCamera() {
    if (isScannerRunning) return;
    hideCameraError();

    const readerEl = document.getElementById("reader");
    if (!readerEl) return;

    if (typeof Html5Qrcode === "undefined") {
        showCameraError("QR scanner library failed to load. Please check your internet connection.");
        return;
    }

    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        };

        await html5QrCode.start(
            { facingMode: currentCameraFacing },
            config,
            onScanSuccess,
            onScanFailure
        );

        isScannerRunning = true;
        isProcessingScan = false;
        updateCameraBtnState(true);
    } catch (err) {
        console.error("Camera Start Error:", err);
        isScannerRunning = false;
        updateCameraBtnState(false);

        let errMsg = "Unable to access device camera. Please check camera permissions in your browser.";
        if (err.name === "NotAllowedError") {
            errMsg = "Camera permission was denied. Please allow camera access or use the Manual Pass ID tab.";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            errMsg = "No camera found on this device. Please use the Manual Pass ID tab.";
        }
        showCameraError(errMsg);
    }
}

async function stopCamera() {
    if (html5QrCode && isScannerRunning) {
        try {
            await html5QrCode.stop();
        } catch (err) {
            console.warn("Camera stop warning:", err);
        }
    }
    isScannerRunning = false;
    updateCameraBtnState(false);
}

function updateCameraBtnState(running) {
    if (cameraBtnIcon) cameraBtnIcon.textContent = running ? "⏸️" : "▶️";
    if (cameraBtnText) cameraBtnText.textContent = running ? "Pause Scanner" : "Start Scanner";
}

function showCameraError(msg) {
    if (cameraErrorBox) {
        cameraErrorBox.textContent = msg;
        cameraErrorBox.style.display = "block";
    }
}

function hideCameraError() {
    if (cameraErrorBox) {
        cameraErrorBox.textContent = "";
        cameraErrorBox.style.display = "none";
    }
}

function onScanSuccess(decodedText, decodedResult) {
    if (isProcessingScan) return;
    isProcessingScan = true;

    stopCamera();

    const passId = String(decodedText || "").trim();
    verifyPass(passId);
}

function onScanFailure(error) {
    // Frame scanning noise; no-op
}

/* =========================================================
   5. MANUAL PASS ID VERIFICATION
========================================================= */

function initManualVerifyListeners() {
    if (manualVerifyBtn && manualPassIdInput) {
        manualVerifyBtn.addEventListener("click", () => {
            const passId = manualPassIdInput.value.trim();
            if (!passId) {
                showResultState("missing", null, "PASS ID UNAVAILABLE", "Please enter a valid Pass ID.");
                return;
            }
            verifyPass(passId);
        });

        manualPassIdInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                manualVerifyBtn.click();
            }
        });
    }
}

/* =========================================================
   6. FIRESTORE PASS VERIFICATION & GIFT DISTRIBUTION
========================================================= */

/**
 * verifyPass(passId)
 * Central verification controller supporting:
 * - currentScanPurpose === "gift" (Freshers 1st Year Gift Distribution)
 * - currentScanPurpose === "entry" (Gate Entry Scan)
 * - currentScanPurpose === "food" (Food / Meal Scan)
 * Enforces atomic Firestore duplicate-entry, duplicate-meal, and duplicate-gift prevention.
 */
async function verifyPass(passId) {
    if (!passId || !String(passId).trim()) {
        showResultState("missing", null, "PASS ID UNAVAILABLE", "No Pass ID detected.");
        return;
    }

    const cleanPassId = String(passId).trim();
    const mode = currentScanPurpose; // "gift", "entry", or "food"

    if (!db) {
        showResultState("invalid", { passId: cleanPassId }, "SYSTEM UNAVAILABLE", "Database connection not initialized. Check internet.");
        return;
    }

    try {
        // 1. Look up student by passId
        const studentsCol = collection(db, "students");
        const q = query(studentsCol, where("passId", "==", cleanPassId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            showResultState("invalid", { passId: cleanPassId }, "Invalid Pass / Student Not Found", "No student record matches this Pass ID in the database.");
            return;
        }

        const studentDoc = snapshot.docs[0];
        const studentRef = doc(db, "students", studentDoc.id);
        const studentData = studentDoc.data();
        studentData.enrollment = studentData.enrollment || studentDoc.id;

        // =========================================================
        // MODE A: FRESHERS GIFT DISTRIBUTION (1st Year Only)
        // =========================================================
        if (mode === "gift") {
            const rawYear = String(studentData.year || "").trim();
            const isFirstYear = rawYear.toLowerCase() === "1st year" || rawYear === "1st Year";

            // Edge Case 2: Student is not 1st Year
            if (!isFirstYear) {
                showResultState("gift_ineligible", studentData, "Not Eligible", "Not Eligible — Gift is only for 1st Year students.");
                return;
            }

            // Edge Case 3: Student already received gift
            if (studentData.giftGiven === true) {
                showResultState("gift_used", studentData, "Gift Already Collected", "This student has already collected their Freshers gift.", studentData.giftTime);
                return;
            }

            // Edge Case 7 & Normal Flow: 1st Year + giftGiven === false (or uninitialized)
            // DO NOT automatically mark as given; display student details and [ GIVE GIFT ] button
            showResultState("gift_ready", studentData, "Student Found", "Please verify student identity and click below to distribute gift.", null, () => {
                executeGiftDistribution(studentData, studentRef, cleanPassId);
            });
            return;
        }

        // =========================================================
        // MODE B & C: GATE ENTRY & FOOD/MEAL SCAN
        // =========================================================

        // Validate Payment
        const isPaymentConfirmed = String(studentData.payment || studentData.status || "").toLowerCase() === "confirmed";
        if (!isPaymentConfirmed) {
            showResultState("pending", studentData, "PAYMENT NOT CONFIRMED — DENIED", "This student's payment is not verified. Please direct them to the coordinator desk.");
            return;
        }

        // Validate Pass Release
        if (!studentData.passReleased) {
            showResultState("unreleased", studentData, "PASS NOT RELEASED — DENIED", "This entry pass has not been officially released yet.");
            return;
        }

        // Mode-specific Pre-checks
        if (mode === "entry") {
            if (studentData.entryUsed === true) {
                showResultState("used", studentData, "PASS ALREADY USED — ENTRY DENIED", "This pass has already been scanned and used for gate entry.");
                return;
            }
        } else if (mode === "food") {
            if (studentData.foodUsed === true) {
                showResultState("food_used", studentData, "MEAL ALREADY CLAIMED — DENIED", "This student has already collected their food / refreshment meal.");
                return;
            }
        }

        // Atomic Transaction (Duplicate Prevention & Audit Log for Entry & Food)
        let committedTimestamp = new Date();

        await runTransaction(db, async (transaction) => {
            const freshDoc = await transaction.get(studentRef);
            if (!freshDoc.exists()) {
                throw new Error("STUDENT_NOT_FOUND");
            }

            const freshData = freshDoc.data();

            if (mode === "entry") {
                if (freshData.entryUsed === true) {
                    const err = new Error("ALREADY_USED");
                    err.previousTime = freshData.entryTime;
                    throw err;
                }

                transaction.update(studentRef, {
                    entryUsed: true,
                    entryTime: serverTimestamp()
                });
            } else {
                // mode === "food"
                if (freshData.foodUsed === true) {
                    const err = new Error("FOOD_ALREADY_USED");
                    err.previousTime = freshData.foodTime;
                    throw err;
                }

                transaction.update(studentRef, {
                    foodUsed: true,
                    foodTime: serverTimestamp()
                });
            }

            // Write unified scan log to entryLogs
            const logsCol = collection(db, "entryLogs");
            const newLogRef = doc(logsCol);
            transaction.set(newLogRef, {
                passId: cleanPassId,
                scanType: mode, // "entry" or "food"
                studentName: studentData.name || "Unknown",
                enrollment: studentData.enrollment || studentDoc.id,
                course: studentData.course || "",
                year: studentData.year || "",
                scannedAt: serverTimestamp(),
                scannerUid: auth.currentUser ? auth.currentUser.uid : "unknown",
                scannerEmail: auth.currentUser ? auth.currentUser.email : "scanner1@genesis26.in"
            });
        });

        // Success State Handling
        if (mode === "entry") {
            studentData.entryUsed = true;
            studentData.entryTime = committedTimestamp;
            sessionEntryCount++;
            showResultState("valid", studentData, "ENTRY VERIFIED — ENTRY ALLOWED", "Pass verified successfully. Student is cleared for event entry.", committedTimestamp);
        } else {
            studentData.foodUsed = true;
            studentData.foodTime = committedTimestamp;
            sessionFoodCount++;
            showResultState("food_valid", studentData, "MEAL VERIFIED — MEAL ALLOWED", "Meal coupon redeemed successfully. Provide refreshment packet.", committedTimestamp);
        }

        updateCountersUI();
        addSessionLog(studentData, committedTimestamp, mode);

    } catch (err) {
        if (err.message === "ALREADY_USED") {
            const usedData = { ...studentData, entryTime: err.previousTime || studentData.entryTime };
            showResultState("used", usedData, "PASS ALREADY USED — ENTRY DENIED", "This pass was already scanned for gate entry. Duplicate entry is strictly prohibited.");
        } else if (err.message === "FOOD_ALREADY_USED") {
            const usedData = { ...studentData, foodTime: err.previousTime || studentData.foodTime };
            showResultState("food_used", usedData, "MEAL ALREADY CLAIMED — DENIED", "This pass was already scanned for meals. Duplicate food claim is prohibited.");
        } else {
            console.error("Firestore Transaction Error:", err);
            let userMsg = "Verification error. Please try scanning again.";
            if (err.code === "permission-denied") {
                userMsg = "Terminal access denied. Please ensure you are logged in as an authorized scanner.";
            }
            showResultState("invalid", { passId: cleanPassId }, "VERIFICATION FAILED", userMsg);
        }
    }
}

/**
 * executeGiftDistribution(studentData, studentRef, cleanPassId)
 * Triggered ONLY when operator explicitly clicks [ GIVE GIFT ].
 * Enforces:
 * 1. Rapid click / double-click protection (isGivingGift latch)
 * 2. Atomic Firestore transaction updating ONLY giftGiven & giftTime
 * 3. In-transaction duplicate gift prevention
 * 4. Audit logging to entryLogs with scanType: "gift"
 * 5. Immediate UI refresh to reflect giftGiven = true
 */
async function executeGiftDistribution(studentData, studentRef, cleanPassId) {
    if (isGivingGift) return;
    isGivingGift = true;

    const btnGiveGift = document.getElementById("btnGiveGift");
    if (btnGiveGift) {
        btnGiveGift.disabled = true;
        const btnText = btnGiveGift.querySelector(".gift-btn-text");
        const btnSpinner = btnGiveGift.querySelector(".gift-btn-spinner");
        if (btnText) btnText.textContent = "Distributing Gift...";
        if (btnSpinner) btnSpinner.style.display = "inline-block";
    }

    let committedTimestamp = new Date();

    try {
        await runTransaction(db, async (transaction) => {
            const freshDoc = await transaction.get(studentRef);
            if (!freshDoc.exists()) {
                throw new Error("STUDENT_NOT_FOUND");
            }

            const freshData = freshDoc.data();

            // 1. Strict Year Verification
            const freshYear = String(freshData.year || "").trim();
            if (freshYear.toLowerCase() !== "1st year" && freshYear !== "1st Year") {
                throw new Error("NOT_ELIGIBLE_YEAR");
            }

            // 2. Strict Duplicate Check
            if (freshData.giftGiven === true) {
                const err = new Error("GIFT_ALREADY_USED");
                err.previousTime = freshData.giftTime;
                throw err;
            }

            // 3. Update ONLY giftGiven and giftTime (matches Firestore security rules exactly)
            transaction.update(studentRef, {
                giftGiven: true,
                giftTime: serverTimestamp()
            });

            // 4. Log to entryLogs subcollection
            const logsCol = collection(db, "entryLogs");
            const newLogRef = doc(logsCol);
            transaction.set(newLogRef, {
                passId: cleanPassId,
                scanType: "gift",
                studentName: studentData.name || "Unknown",
                enrollment: studentData.enrollment || studentRef.id,
                course: studentData.course || "",
                year: studentData.year || "1st Year",
                scannedAt: serverTimestamp(),
                scannerUid: auth.currentUser ? auth.currentUser.uid : "unknown",
                scannerEmail: auth.currentUser ? auth.currentUser.email : "scanner1@genesis26.in"
            });
        });

        // 5. Update local record so UI re-render reflects giftGiven = true
        studentData.giftGiven = true;
        studentData.giftTime = committedTimestamp;
        sessionGiftCount++;

        updateCountersUI();
        addSessionLog(studentData, committedTimestamp, "gift");

        // Show Success Result State
        showResultState("gift_success", studentData, "Gift Given Successfully", "Freshers gift has been recorded and handed over.", committedTimestamp);

    } catch (err) {
        console.error("Gift Distribution Error:", err);
        if (err.message === "GIFT_ALREADY_USED") {
            const usedData = { ...studentData, giftTime: err.previousTime || studentData.giftTime };
            showResultState("gift_used", usedData, "Gift Already Collected", "This student has already collected their Freshers gift.", usedData.giftTime);
        } else if (err.message === "NOT_ELIGIBLE_YEAR") {
            showResultState("gift_ineligible", studentData, "Not Eligible", "Not Eligible — Gift is only for 1st Year students.");
        } else {
            // Edge Case 4: Firebase update fails -> show proper error message, do NOT show success
            showResultState("gift_failed", studentData, "Gift Distribution Failed", "Gift distribution failed. Please try again.", null, () => {
                executeGiftDistribution(studentData, studentRef, cleanPassId);
            });
        }
    } finally {
        isGivingGift = false;
    }
}

/* =========================================================
   7. VERIFICATION RESULT MODAL RENDERING
========================================================= */

function showResultState(state, data, title, message, actionTimestamp, onAction) {
    if (!resultModal || !resultCard) return;

    let icon = "❌";
    let stateClass = "state-invalid";
    let statusSubtitle = "ENTRY DENIED";

    if (state === "valid") {
        icon = "✓";
        stateClass = "state-valid";
        statusSubtitle = "ENTRY ALLOWED";
    } else if (state === "food_valid") {
        icon = "🍽️";
        stateClass = "state-food-valid";
        statusSubtitle = "MEAL ALLOWED";
    } else if (state === "used") {
        icon = "⚠️";
        stateClass = "state-used";
        statusSubtitle = "ENTRY DENIED";
    } else if (state === "food_used") {
        icon = "⚠️";
        stateClass = "state-food-used";
        statusSubtitle = "MEAL DENIED";
    } else if (state === "gift_ready") {
        icon = "🎁";
        stateClass = "state-gift-ready";
        statusSubtitle = "ELIGIBLE FOR GIFT";
    } else if (state === "gift_success") {
        icon = "🎁";
        stateClass = "state-gift-success";
        statusSubtitle = "GIFT DISTRIBUTED";
    } else if (state === "gift_used") {
        icon = "⚠️";
        stateClass = "state-gift-used";
        statusSubtitle = "ALREADY CLAIMED";
    } else if (state === "gift_ineligible") {
        icon = "❌";
        stateClass = "state-gift-ineligible";
        statusSubtitle = "NOT ELIGIBLE";
    } else if (state === "gift_failed") {
        icon = "❌";
        stateClass = "state-invalid";
        statusSubtitle = "UPDATE FAILED";
    } else if (state === "pending" || state === "unreleased") {
        icon = "⏳";
        stateClass = (state === "pending") ? "state-pending" : "state-unreleased";
        statusSubtitle = "DENIED";
    } else if (state === "missing") {
        icon = "❓";
        stateClass = "state-invalid";
        statusSubtitle = "INPUT ERROR";
    }

    const name = data && data.name ? escapeHtml(data.name) : (data && data.studentName ? escapeHtml(data.studentName) : null);
    const enrollment = data && data.enrollment ? escapeHtml(data.enrollment) : null;
    const course = data && data.course ? escapeHtml(data.course) : null;
    const passId = data && data.passId ? escapeHtml(data.passId) : "";
    const rawYear = data && data.year ? String(data.year).trim() : null;
    const isFirstYear = rawYear && (rawYear.toLowerCase() === "1st year" || rawYear === "1st Year");

    // Status Pills (Gate Entry + Food + Gift Status)
    let statusPillsHtml = "";
    if (data && (data.entryUsed !== undefined || data.foodUsed !== undefined || data.giftGiven !== undefined)) {
        const isEntryDone = Boolean(data.entryUsed);
        const isFoodDone = Boolean(data.foodUsed);
        const isGiftDone = Boolean(data.giftGiven);

        const entryTimeText = isEntryDone ? formatTimestamp(data.entryTime || (state === "valid" ? actionTimestamp : null)) : "Pending";
        const foodTimeText = isFoodDone ? formatTimestamp(data.foodTime || (state === "food_valid" ? actionTimestamp : null)) : "Unclaimed";
        const giftTimeText = isGiftDone ? formatTimestamp(data.giftTime || (state === "gift_success" ? actionTimestamp : null)) : "Not Given";

        statusPillsHtml = `
            <div class="event-statuses-row">
                <div class="status-mini-pill ${isEntryDone ? 'done' : 'pending'}" title="Gate Entry Status">
                    <span>🎟️ Entry: <strong>${isEntryDone ? '✓ ' + entryTimeText : '⏳ Pending'}</strong></span>
                </div>
                <div class="status-mini-pill ${isFoodDone ? 'done' : 'pending'}" title="Food Refreshment Status">
                    <span>🍽️ Meal: <strong>${isFoodDone ? '✓ ' + foodTimeText : '🍽️ Unclaimed'}</strong></span>
                </div>
                <div class="status-mini-pill ${isGiftDone ? 'done' : 'pending'}" title="Freshers Gift Status">
                    <span>🎁 Gift: <strong>${isGiftDone ? '✓ ' + giftTimeText : '🎁 Not Given'}</strong></span>
                </div>
            </div>
        `;
    }

    // Timestamp Box
    let timestampHtml = "";
    if (state === "valid" || state === "food_valid" || state === "gift_success") {
        let actionLabel = "Entry verified at";
        if (state === "food_valid") actionLabel = "Meal claimed at";
        else if (state === "gift_success") actionLabel = "Gift collected at";
        const timeStr = formatTimestamp(actionTimestamp || new Date());
        timestampHtml = `
            <div class="timestamp-box">
                <span>⏱️ ${actionLabel}: <strong>${timeStr}</strong></span>
            </div>
        `;
    } else if (state === "used") {
        const prevTimeStr = formatTimestamp(data && data.entryTime ? data.entryTime : null);
        timestampHtml = `
            <div class="timestamp-box warning">
                <span>⚠️ Gate entry was already recorded at: <strong>${prevTimeStr}</strong></span>
            </div>
        `;
    } else if (state === "food_used") {
        const prevTimeStr = formatTimestamp(data && data.foodTime ? data.foodTime : null);
        timestampHtml = `
            <div class="timestamp-box warning">
                <span>⚠️ Meal was already claimed at: <strong>${prevTimeStr}</strong></span>
            </div>
        `;
    } else if (state === "gift_used") {
        const prevTimeStr = formatTimestamp(data && data.giftTime ? data.giftTime : actionTimestamp);
        timestampHtml = `
            <div class="timestamp-box warning">
                <span>⚠️ Gift was already collected at: <strong>${prevTimeStr}</strong></span>
            </div>
        `;
    }

    // Action button(s)
    let actionButtonsHtml = "";
    if (state === "gift_ready") {
        actionButtonsHtml = `
            <button type="button" id="btnGiveGift" class="btn-give-gift">
                <span class="gift-btn-icon">🎁</span>
                <span class="gift-btn-text">GIVE GIFT</span>
                <span class="gift-btn-spinner" style="display: none;"></span>
            </button>
            <button type="button" id="btnScanNext" class="btn-scan-next" style="background: rgba(0,0,0,0.06); color: #6F5A4B;">
                Cancel / Scan Next
            </button>
        `;
    } else if (state === "gift_failed" && typeof onAction === "function") {
        actionButtonsHtml = `
            <button type="button" id="btnRetryGift" class="btn-give-gift" style="background: linear-gradient(135deg, #DC2626, #B91C1C); color: #fff;">
                <span class="gift-btn-icon">🔄</span>
                <span class="gift-btn-text">Retry Give Gift</span>
            </button>
            <button type="button" id="btnScanNext" class="btn-scan-next">
                📷 Scan Next Pass
            </button>
        `;
    } else {
        actionButtonsHtml = `
            <button type="button" id="btnScanNext" class="btn-scan-next">
                📷 Scan Next Pass
            </button>
        `;
    }

    resultCard.className = `result-card ${stateClass}`;
    resultCard.innerHTML = `
        <div class="result-status-banner">
            <div class="result-icon-wrap">
                <span>${icon}</span>
            </div>
            <p class="result-verdict">${statusSubtitle}</p>
            <h2 class="result-title">${escapeHtml(title)}</h2>
        </div>

        <div class="result-body">
            ${name ? `<h3 class="result-student-name">${name}</h3>` : ""}

            ${statusPillsHtml}

            <div class="result-details-grid">
                ${enrollment ? `
                    <div class="detail-item">
                        <span class="item-label">ENROLLMENT ID</span>
                        <strong class="item-val">${enrollment}</strong>
                    </div>
                ` : ""}

                ${passId ? `
                    <div class="detail-item">
                        <span class="item-label">PASS ID</span>
                        <strong class="item-val">${passId}</strong>
                    </div>
                ` : ""}

                ${rawYear ? `
                    <div class="detail-item">
                        <span class="item-label">STUDENT YEAR</span>
                        <strong class="item-val ${isFirstYear ? 'year-pill-highlight' : 'year-pill-ineligible'}">${rawYear}</strong>
                    </div>
                ` : ""}

                ${course ? `
                    <div class="detail-item ${rawYear ? '' : 'full-width'}">
                        <span class="item-label">COURSE</span>
                        <strong class="item-val">${course}</strong>
                    </div>
                ` : ""}
            </div>

            ${timestampHtml}

            ${message ? `<p style="font-size: 13px; color: #6F5A4B; margin-bottom: 18px; text-align: center;">${escapeHtml(message)}</p>` : ""}

            ${actionButtonsHtml}
        </div>
    `;

    resultModal.style.display = "flex";

    const btnScanNext = document.getElementById("btnScanNext");
    if (btnScanNext) {
        btnScanNext.addEventListener("click", () => {
            closeResultModal();
        });
    }

    const btnGiveGift = document.getElementById("btnGiveGift");
    if (btnGiveGift && typeof onAction === "function") {
        btnGiveGift.addEventListener("click", onAction);
    }

    const btnRetryGift = document.getElementById("btnRetryGift");
    if (btnRetryGift && typeof onAction === "function") {
        btnRetryGift.addEventListener("click", onAction);
    }
}

function closeResultModal() {
    if (resultModal) {
        resultModal.style.display = "none";
    }
    isProcessingScan = false;
    isGivingGift = false;

    if (manualPassIdInput) {
        manualPassIdInput.value = "";
    }

    if (tabCamera && tabCamera.classList.contains("active")) {
        startCamera();
    }
}

/* =========================================================
   8. RECENT SCANS SESSION LOGS
========================================================= */

function addSessionLog(student, scanDate, mode) {
    const name = student.name || "Student";
    const timeStr = formatTimestamp(scanDate);
    let badge = "🎟️ Entry";
    if (mode === "food") badge = "🍽️ Food";
    else if (mode === "gift") badge = "🎁 Gift";

    sessionLogs.unshift({ name, timeStr, passId: student.passId, badge });

    if (sessionLogCount) {
        sessionLogCount.textContent = sessionLogs.length;
    }

    renderRecentScans();
}

function renderRecentScans() {
    if (!recentScansList) return;

    if (sessionLogs.length === 0) {
        recentScansList.innerHTML = `<p class="empty-list-note">No passes scanned yet in this terminal session.</p>`;
        return;
    }

    recentScansList.innerHTML = sessionLogs.slice(0, 15).map(item => `
        <div class="recent-item">
            <span class="recent-name">${item.badge} • ${escapeHtml(item.name)} <small style="color: #D4AF37; margin-left: 4px;">(${escapeHtml(item.passId)})</small></span>
            <span class="recent-time">${escapeHtml(item.timeStr)}</span>
        </div>
    `).join("");
}

function initRecentAccordion() {
    if (recentHeader && recentScansList) {
        recentHeader.addEventListener("click", () => {
            const isHidden = recentScansList.style.display === "none";
            recentScansList.style.display = isHidden ? "flex" : "none";
            const arrow = recentHeader.querySelector(".accordion-arrow");
            if (arrow) arrow.textContent = isHidden ? "▴" : "▾";
        });
    }
}

/* =========================================================
   9. UTILITIES
========================================================= */

function formatTimestamp(ts) {
    if (!ts) return "Earlier";

    let date = null;
    if (ts instanceof Date) {
        date = ts;
    } else if (typeof ts.toDate === "function") {
        date = ts.toDate();
    } else if (typeof ts === "string" || typeof ts === "number") {
        date = new Date(ts);
    } else if (ts.seconds) {
        date = new Date(ts.seconds * 1000);
    } else {
        date = new Date();
    }

    if (isNaN(date.getTime())) return "Recorded";

    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
