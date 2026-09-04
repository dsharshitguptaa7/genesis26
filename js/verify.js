/* =========================================================
   GENESIS'26 — QR ENTRY VERIFIER & SCANNER CONTROLLER
   Authentication, html5-qrcode Camera, and Atomic Firestore Transactions
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

// Global Scanner State
let html5QrCode = null;
let isScannerRunning = false;
let isProcessingScan = false;
let currentCameraFacing = "environment"; // Preferred rear camera on mobile
let sessionScannedCount = 0;
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
const logoutBtn = document.getElementById("logoutBtn");

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
   1. AUTHENTICATION & SESSION MANAGEMENT
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initAuthListeners();
    initTabListeners();
    initManualVerifyListeners();
    initRecentAccordion();
});

function initAuthListeners() {
    // Listen for Firebase Auth State Changes
    if (auth) {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is authenticated
                showDashboard(user);
            } else {
                // User is signed out
                showLogin();
            }
        });
    }

    // Toggle Password Visibility
    if (togglePasswordBtn && scannerPasswordInput) {
        togglePasswordBtn.addEventListener("click", () => {
            const isPassword = scannerPasswordInput.type === "password";
            scannerPasswordInput.type = isPassword ? "text" : "password";
            togglePasswordBtn.textContent = isPassword ? "🙈" : "👁️";
        });
    }

    // Handle Login Form Submit
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
                // Auth state change listener will show the dashboard
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

    // Handle Logout
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
    // Start camera automatically when dashboard opens
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
   2. TAB SWITCHING (CAMERA vs. MANUAL)
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
   3. QR SCANNER INTEGRATION (html5-qrcode)
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
    if (isProcessingScan) return; // Prevent repeated triggers
    isProcessingScan = true;

    // Immediately pause/stop camera after detection
    stopCamera();

    // Process the QR result as passId only
    const passId = String(decodedText || "").trim();
    verifyPass(passId);
}

function onScanFailure(error) {
    // Normal frame-by-frame scanning noise; no-op
}

/* =========================================================
   4. MANUAL PASS ID VERIFICATION
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
   5. FIRESTORE PASS VERIFICATION & DUPLICATE PREVENTION
========================================================= */

/**
 * verifyPass(passId)
 * Core central verification function.
 * Validates existence, payment, release status, and entry status.
 * Executes atomic Firestore transaction to prevent duplicate entry.
 */
async function verifyPass(passId) {
    if (!passId || !String(passId).trim()) {
        showResultState("missing", null, "PASS ID UNAVAILABLE", "No Pass ID detected.");
        return;
    }

    const cleanPassId = String(passId).trim();

    // Ensure database is initialized
    if (!db) {
        showResultState("invalid", { passId: cleanPassId }, "SYSTEM UNAVAILABLE", "Database connection not initialized. Check internet.");
        return;
    }

    try {
        // 1. Find the student using passId in Firestore
        const studentsCol = collection(db, "students");
        const q = query(studentsCol, where("passId", "==", cleanPassId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            showResultState("invalid", { passId: cleanPassId }, "INVALID QR CODE — ENTRY DENIED", "No student record matches this Pass ID in the database.");
            return;
        }

        const studentDoc = snapshot.docs[0];
        const studentRef = doc(db, "students", studentDoc.id);
        const studentData = studentDoc.data();

        // 2. Verify payment status === "confirmed"
        const isPaymentConfirmed = String(studentData.payment || studentData.status || "").toLowerCase() === "confirmed";
        if (!isPaymentConfirmed) {
            showResultState("pending", studentData, "PAYMENT NOT CONFIRMED — ENTRY DENIED", "This student's payment is not verified. Please direct them to the coordinator desk.");
            return;
        }

        // 3. Verify passReleased === true
        if (!studentData.passReleased) {
            showResultState("unreleased", studentData, "PASS NOT RELEASED — ENTRY DENIED", "This entry pass has not been officially released yet.");
            return;
        }

        // 4. Pre-check: entryUsed === false
        if (studentData.entryUsed === true) {
            showResultState("used", studentData, "PASS ALREADY USED — ENTRY DENIED", "This pass has already been scanned and used for entry.");
            return;
        }

        // 5. ATOMIC FIRESTORE TRANSACTION FOR DUPLICATE PREVENTION & ENTRY LOG
        let committedEntryTime = new Date();

        await runTransaction(db, async (transaction) => {
            const freshDoc = await transaction.get(studentRef);
            if (!freshDoc.exists()) {
                throw new Error("STUDENT_NOT_FOUND");
            }

            const freshData = freshDoc.data();

            // Guard: check if another scanner marked it used in the meantime
            if (freshData.entryUsed === true) {
                const err = new Error("ALREADY_USED");
                err.previousTime = freshData.entryTime;
                throw err;
            }

            // Atomic update on student document:
            // Notice: existing Firestore security rules require affectedKeys().hasOnly(['entryUsed', 'entryTime'])
            transaction.update(studentRef, {
                entryUsed: true,
                entryTime: serverTimestamp()
            });

            // Atomic creation of entry log:
            const logsCol = collection(db, "entryLogs");
            const newLogRef = doc(logsCol);
            transaction.set(newLogRef, {
                passId: cleanPassId,
                studentName: studentData.name || "Unknown",
                enrollment: studentData.enrollment || studentDoc.id,
                course: studentData.course || "",
                scannedAt: serverTimestamp(),
                scannerUid: auth.currentUser ? auth.currentUser.uid : "unknown",
                scannerEmail: auth.currentUser ? auth.currentUser.email : "scanner1@genesis26.in"
            });
        });

        // 6. If transaction committed successfully -> ENTRY ALLOWED
        showResultState("valid", studentData, "ENTRY VERIFIED — ENTRY ALLOWED", "Pass verified successfully. Student is cleared for event entry.", committedEntryTime);

        // Update session counters
        sessionScannedCount++;
        if (scannedCountBadge) scannedCountBadge.textContent = `${sessionScannedCount} Verified`;
        addSessionLog(studentData, committedEntryTime);

    } catch (err) {
        if (err.message === "ALREADY_USED") {
            const usedData = { ...studentData, entryTime: err.previousTime || studentData.entryTime };
            showResultState("used", usedData, "PASS ALREADY USED — ENTRY DENIED", "This pass was already scanned. Duplicate entry is strictly prohibited.");
        } else {
            console.error("Firestore Transaction Error:", err);
            let userMsg = "Verification error. Please try scanning again.";
            if (err.code === "permission-denied") {
                userMsg = "Permission denied. Please ensure you are logged in as an authorized scanner.";
            }
            showResultState("invalid", { passId: cleanPassId }, "VERIFICATION ERROR", userMsg);
        }
    }
}

/* =========================================================
   6. VERIFICATION RESULT MODAL RENDERING
========================================================= */

function showResultState(state, data, title, message, entryTimeDate) {
    if (!resultModal || !resultCard) return;

    let icon = "❌";
    let stateClass = "state-invalid";
    let statusSubtitle = "ENTRY DENIED";

    if (state === "valid") {
        icon = "✓";
        stateClass = "state-valid";
        statusSubtitle = "ENTRY ALLOWED";
    } else if (state === "used") {
        icon = "⚠️";
        stateClass = "state-used";
        statusSubtitle = "ENTRY DENIED";
    } else if (state === "pending" || state === "unreleased") {
        icon = "⏳";
        stateClass = (state === "pending") ? "state-pending" : "state-unreleased";
        statusSubtitle = "ENTRY DENIED";
    } else if (state === "missing") {
        icon = "❓";
        stateClass = "state-invalid";
        statusSubtitle = "INPUT ERROR";
    }

    const name = data && data.name ? escapeHtml(data.name) : (data && data.studentName ? escapeHtml(data.studentName) : null);
    const enrollment = data && data.enrollment ? escapeHtml(data.enrollment) : null;
    const course = data && data.course ? escapeHtml(data.course) : null;
    const passId = data && data.passId ? escapeHtml(data.passId) : "";

    // Determine timestamp display
    let timestampHtml = "";
    if (state === "valid") {
        const timeStr = formatTimestamp(entryTimeDate || new Date());
        timestampHtml = `
            <div class="timestamp-box">
                <span>⏱️ Verified at: <strong>${timeStr}</strong></span>
            </div>
        `;
    } else if (state === "used") {
        const prevTimeStr = formatTimestamp(data && data.entryTime ? data.entryTime : null);
        timestampHtml = `
            <div class="timestamp-box warning">
                <span>⚠️ Previously entered at: <strong>${prevTimeStr}</strong></span>
            </div>
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

                ${course ? `
                    <div class="detail-item full-width">
                        <span class="item-label">COURSE</span>
                        <strong class="item-val">${course}</strong>
                    </div>
                ` : ""}
            </div>

            ${timestampHtml}

            ${message ? `<p style="font-size: 13px; color: #6F5A4B; margin-bottom: 18px; text-align: center;">${escapeHtml(message)}</p>` : ""}

            <button type="button" id="btnScanNext" class="btn-scan-next">
                📷 Scan Next Pass
            </button>
        </div>
    `;

    resultModal.style.display = "flex";

    // Bind "Scan Next Pass" button
    const btnScanNext = document.getElementById("btnScanNext");
    if (btnScanNext) {
        btnScanNext.addEventListener("click", () => {
            closeResultModal();
        });
    }
}

function closeResultModal() {
    if (resultModal) {
        resultModal.style.display = "none";
    }
    isProcessingScan = false;

    // Reset manual input
    if (manualPassIdInput) {
        manualPassIdInput.value = "";
    }

    // If Camera tab is active, re-activate camera
    if (tabCamera && tabCamera.classList.contains("active")) {
        startCamera();
    }
}

/* =========================================================
   7. RECENT SCANS SESSION LOGS
========================================================= */

function addSessionLog(student, entryDate) {
    const name = student.name || "Student";
    const timeStr = formatTimestamp(entryDate);

    sessionLogs.unshift({ name, timeStr, passId: student.passId });

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

    recentScansList.innerHTML = sessionLogs.slice(0, 10).map(item => `
        <div class="recent-item">
            <span class="recent-name">✓ ${escapeHtml(item.name)} <small style="color: #D4AF37; margin-left: 6px;">(${escapeHtml(item.passId)})</small></span>
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
   8. UTILITIES
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
