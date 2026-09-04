/* =========================================================
   GENESIS'26 — DIGITAL ENTRY PASS CONTROLLER
   Firestore-First with Backup Fallback, Validation, and QR Generator
========================================================= */

import { db, doc, getDoc } from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
    loadPass();
});

async function loadPass() {
    const params = new URLSearchParams(window.location.search);
    const rawEnrollment = params.get("enrollment");
    const rawCourse = params.get("course");

    // 1. Validate Query Parameters
    if (!rawEnrollment || !rawCourse) {
        showError(
            "Invalid Pass Request",
            "Please access your pass through the official student portal."
        );
        return;
    }

    const enrollment = rawEnrollment.trim();
    const course = rawCourse.trim();

    try {
        let student = null;

        // 2. Primary Source: Cloud Firestore Lookup
        try {
            if (db) {
                const docRef = doc(db, "students", enrollment);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (isCourseMatch(data.course, course)) {
                        student = data;
                    }
                }
            }
        } catch (firestoreErr) {
            console.warn("Firestore pass lookup restricted or offline, using backup dataset:", firestoreErr);
        }

        // 3. Backup / Reference Dataset: students.json
        if (!student) {
            const response = await fetch("./data/students.json");
            if (!response.ok) {
                throw new Error(`Database error: HTTP ${response.status}`);
            }
            const students = await response.json();

            student = students.find(s => {
                const sEnroll = String(s.enrollment || "").trim().toLowerCase();
                const qEnroll = enrollment.toLowerCase();
                return sEnroll === qEnroll && isCourseMatch(s.course, course);
            });
        }

        // 4. Verify Record Existence
        if (!student) {
            showError(
                "Student Record Not Found",
                "Please check your enrollment details and try again."
            );
            return;
        }

        // 5. Verify Payment Status
        const isPaymentConfirmed = String(student.payment || student.status || "").toLowerCase() === "confirmed";
        if (!isPaymentConfirmed) {
            showError(
                "Payment Not Confirmed",
                "Your payment is currently under verification. Please contact your coordinator."
            );
            return;
        }

        // 6. Verify Pass Release Status
        if (!student.passReleased) {
            showError(
                "Digital Pass Not Released Yet",
                "Passes will be released 2 days before the event. Please visit this portal again after the pass release."
            );
            return;
        }

        // 7. Verify Pass ID Availability
        if (!student.passId || !String(student.passId).trim()) {
            showError(
                "Pass ID Unavailable",
                "Please contact the event organizing committee."
            );
            return;
        }

        // 8. Render Pass Information
        renderPassData(student);

    } catch (error) {
        console.error("Pass Loading Error:", error);
        showError(
            "Service Unavailable",
            "Unable to verify pass details at this time. Please try again later."
        );
    }
}

function isCourseMatch(studentCourse, queryCourse) {
    const sCourse = String(studentCourse || "").trim().toLowerCase();
    const qCourse = String(queryCourse || "").trim().toLowerCase();

    return sCourse === qCourse ||
        (qCourse.includes("environmental") && sCourse.includes("environment")) ||
        (qCourse.includes("environment") && sCourse.includes("environmental")) ||
        (sCourse.replace(/\s*\(hons\)/i, "") === qCourse.replace(/\s*\(hons\)/i, ""));
}

function renderPassData(student) {
    const nameEl = document.getElementById("studentName");
    const enrollEl = document.getElementById("studentEnrollment");
    const courseEl = document.getElementById("studentCourse");
    const passIdEl = document.getElementById("studentPassId");

    if (nameEl) nameEl.textContent = student.name;
    if (enrollEl) enrollEl.textContent = student.enrollment;
    if (courseEl) courseEl.textContent = student.course;
    if (passIdEl) passIdEl.textContent = student.passId;

    // Generate QR with ONLY student.passId (no sensitive data)
    generateQR(student.passId);

    // Setup Download / Print handler
    setupDownload();
}

function generateQR(passId) {
    const qrContainer = document.getElementById("entryQR");
    if (!qrContainer) return;

    qrContainer.innerHTML = "";

    if (typeof QRCode === "undefined") {
        console.warn("QRCode library loading delayed, retrying...");
        setTimeout(() => generateQR(passId), 150);
        return;
    }

    try {
        new QRCode(qrContainer, {
            text: String(passId).trim(),
            width: 150,
            height: 150,
            colorDark: "#1F140E",
            colorLight: "#FFFFFF",
            correctLevel: QRCode.CorrectLevel.H
        });
    } catch (err) {
        console.error("QR Generation Error:", err);
        qrContainer.innerHTML = `<p style="color: #6D1F2A; font-size: 12px; font-weight: 600;">QR Generation Failed</p>`;
    }
}

function setupDownload() {
    const downloadBtn = document.getElementById("downloadBtn");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
            window.print();
        });
    }
}

function showError(title, message) {
    const passCard = document.getElementById("passCard");
    if (!passCard) return;

    passCard.innerHTML = `
        <div class="error-card">
            <div class="error-header">
                <h1>GENESIS'26</h1>
            </div>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(message)}</p>
            <a href="index.html" class="btn-error-return">
                ← Return to Portal
            </a>
        </div>
    `;
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