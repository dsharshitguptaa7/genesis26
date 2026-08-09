const form = document.getElementById("checkForm");

form.addEventListener("submit", async (e) => {

    e.preventDefault();

    const enrollment = document
        .getElementById("enrollment")
        .value
        .trim();

    const course = document
        .getElementById("course")
        .value;

    const result = document.getElementById("result");

    try {

        const response = await fetch("./data/students.json");

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const students = await response.json();

        const student = students.find(s =>
            String(s.enrollment).trim() === enrollment &&
            String(s.course).trim() === course
        );

        if (!student) {

            result.innerHTML = `
                <p style="color:red">
                    ❌ Student Record Not Found
                </p>
            `;

            return;
        }

        if (student.payment === "confirmed") {

            result.innerHTML = `

                <h2 style="color:green">
                    ✅ Payment Confirmed
                </h2>

                <p>
                    Welcome,
                    <b>${student.name}</b>
                </p>

                <p>
                    Digital Pass will be released
                    2 days before the event.
                </p>

            `;

        } else {

            result.innerHTML = `

                <h2 style="color:orange">
                    ⏳ Payment Pending
                </h2>

                <p>
                    Please contact your coordinator.
                </p>

            `;

        }

    } catch (error) {

        console.error("Payment verification error:", error);

        result.innerHTML = `
            <p style="color:red">
                ❌ Unable to check payment status.
            </p>

            <p style="font-size:13px;">
                Please try again later.
            </p>
        `;

    }

});
