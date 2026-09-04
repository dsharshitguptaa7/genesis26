/* =========================================================
   GENESIS'26 — STUDENT PORTAL SCRIPT
   Payment Confirmation & Pass Release Gateway
   Firestore-First with JSON Fallback Architecture
========================================================= */

import { db, doc, getDoc } from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("checkForm");
    const result = document.getElementById("result");

    if (!form || !result) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const enrollment = document.getElementById("enrollment").value.trim();
        const course = document.getElementById("course").value.trim();

        if (!enrollment || !course) {
            result.innerHTML = `
                <div class="status-card error">
                    <h3>⚠️ Incomplete Input</h3>
                    <p>Please enter your Enrollment ID and select your Course.</p>
                </div>
            `;
            return;
        }

        result.innerHTML = `
            <div class="status-card" style="color: #6D1F2A;">
                <p>Verifying details with database...</p>
            </div>
        `;

        try {
            let student = null;

            // 1. Primary Source: Cloud Firestore Lookup
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
                // Unauthenticated visitor or offline network
                console.warn("Firestore lookup restricted or offline, using backup dataset:", firestoreErr);
            }

            // 2. Backup / Reference Dataset: students.json
            if (!student) {
                const response = await fetch("./data/students.json");
                if (response.ok) {
                    const students = await response.json();
                    student = students.find(s => {
                        const sEnroll = String(s.enrollment || "").trim().toLowerCase();
                        const qEnroll = enrollment.toLowerCase();
                        return sEnroll === qEnroll && isCourseMatch(s.course, course);
                    });
                }
            }

            // 3. Handle States
            if (!student) {
                result.innerHTML = `
                    <div class="status-card error">
                        <h3>❌ Student Record Not Found</h3>
                        <p>Please check your Enrollment ID and Course selection.</p>
                    </div>
                `;
                return;
            }

            const isPaymentConfirmed = String(student.payment || student.status || "").toLowerCase() === "confirmed";
            const isPassReleased = Boolean(student.passReleased) && Boolean(student.passId && String(student.passId).trim());

            if (!isPaymentConfirmed) {
                // Case A — Payment Pending
                result.innerHTML = `
                    <div class="status-card pending">
                        <h3>⏳ Payment Pending</h3>
                        <p>Your payment is currently under verification.</p>
                        <p style="margin-top: 12px; font-size: 0.9rem; color: #7A5428;">
                            If you have already made the payment,<br>please contact your coordinator.
                        </p>
                    </div>
                `;
            } else if (isPaymentConfirmed && !isPassReleased) {
                // Case B — Payment Confirmed but Pass Not Released
                result.innerHTML = `
                    <div class="status-card confirmed">
                        <h3>✅ Payment Confirmed</h3>
                        <p class="student-greeting">Welcome, <strong>${escapeHtml(student.name)}</strong>!</p>
                        <p>Your payment has been successfully verified.</p>
                        <div class="pass-notice">
                            <h4>🎫 Digital Pass</h4>
                            <p>Your pass has not been released yet.</p>
                            <p style="margin-top: 6px;">Passes will be released 2 days before the event.</p>
                            <p style="margin-top: 6px; font-size: 0.85rem; color: #8A7565;">Please visit this portal again after the pass release.</p>
                        </div>
                    </div>
                `;
            } else if (isPaymentConfirmed && isPassReleased) {
                // Case C — Payment Confirmed + Pass Released
                result.innerHTML = `
                    <div class="status-card confirmed">
                        <h3>✅ Payment Confirmed</h3>
                        <p class="student-greeting">Welcome, <strong>${escapeHtml(student.name)}</strong>!</p>
                        <div class="pass-ready-badge">
                            🎫 Your Digital Entry Pass is Ready.
                        </div>
                        <button type="button" class="btn-view-pass" id="viewPassBtn">
                            🎫 View Entry Pass
                        </button>
                    </div>
                `;

                const viewPassBtn = document.getElementById("viewPassBtn");
                if (viewPassBtn) {
                    viewPassBtn.addEventListener("click", () => {
                        openPass(student.enrollment, student.course);
                    });
                }
            }

        } catch (error) {
            console.error("Payment verification error:", error);
            result.innerHTML = `
                <div class="status-card error">
                    <h3>❌ Unable to check payment status</h3>
                    <p style="font-size: 0.9rem; color: #8B2635;">Please try again later.</p>
                </div>
            `;
        }
    });
});

function isCourseMatch(studentCourse, queryCourse) {
    const sCourse = String(studentCourse || "").trim().toLowerCase();
    const qCourse = String(queryCourse || "").trim().toLowerCase();

    return sCourse === qCourse ||
        (qCourse.includes("environmental") && sCourse.includes("environment")) ||
        (qCourse.includes("environment") && sCourse.includes("environmental")) ||
        (sCourse.replace(/\s*\(hons\)/i, "") === qCourse.replace(/\s*\(hons\)/i, ""));
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

export function openPass(enrollment, course) {
    const encEnrollment = encodeURIComponent(enrollment);
    const encCourse = encodeURIComponent(course);
    window.location.href = `pass.html?enrollment=${encEnrollment}&course=${encCourse}`;
}

window.openPass = openPass;