/* =========================================================
   GENESIS'26 — STUDENT PORTAL SCRIPT
   Payment Confirmation & Pass Release Gateway
========================================================= */

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
            const response = await fetch("./data/students.json");

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const students = await response.json();

            const student = students.find(s => {
                const sEnroll = String(s.enrollment || "").trim().toLowerCase();
                const qEnroll = enrollment.toLowerCase();
                const sCourse = String(s.course || "").trim().toLowerCase();
                const qCourse = course.toLowerCase();

                const enrollMatch = sEnroll === qEnroll;
                const courseMatch = sCourse === qCourse ||
                    (qCourse.includes("environmental") && sCourse.includes("environment")) ||
                    (qCourse.includes("environment") && sCourse.includes("environmental")) ||
                    (sCourse.replace(/\s*\(hons\)/i, "") === qCourse.replace(/\s*\(hons\)/i, ""));

                return enrollMatch && courseMatch;
            });

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

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function openPass(enrollment, course) {
    const encEnrollment = encodeURIComponent(enrollment);
    const encCourse = encodeURIComponent(course);
    window.location.href = `pass.html?enrollment=${encEnrollment}&course=${encCourse}`;
}

window.openPass = openPass;