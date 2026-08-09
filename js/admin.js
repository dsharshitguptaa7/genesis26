/* =========================================================
   GENESIS'26 — ADMIN LEDGER
   Complete Admin Dashboard JavaScript
========================================================= */


/* =========================================================
   CONFIGURATION
========================================================= */

const DATA_URL = "./data/students.json";
const EXPENSES_URL = "./data/expenses.json";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "genesis26";


/* =========================================================
   GLOBAL DATA
========================================================= */

let students = [];
let expenses = [];
let filteredStudents = [];


/* =========================================================
   DOM HELPER
========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   DOM ELEMENTS
========================================================= */

const loader = $("loader");

const adminLogin = $("adminLogin");
const adminDashboard = $("adminDashboard");

const adminLoginForm = $("adminLoginForm");

const adminUsername = $("adminUsername");
const adminPassword = $("adminPassword");

const togglePassword = $("togglePassword");

const loginMessage = $("loginMessage");

const loggedInAdmin = $("loggedInAdmin");

const logoutBtn = $("logoutBtn");

const courseFilter = $("courseFilter");
const yearFilter = $("yearFilter");
const modeFilter = $("modeFilter");
const statusFilter = $("statusFilter");

const studentSearch = $("studentSearch");

const resetFilters = $("resetFilters");

const ledgerContainer = $("ledgerContainer");

const totalStudents = $("totalStudents");

const onlineCollection = $("onlineCollection");
const cashCollection = $("cashCollection");
const totalCollection = $("totalCollection");

const confirmedCount = $("confirmedCount");
const confirmedAmount = $("confirmedAmount");

const pendingCount = $("pendingCount");
const rejectedCount = $("rejectedCount");

const totalExpenses = $("totalExpenses");
const remainingBalance = $("remainingBalance");

const expenseContainer = $("expenseContainer");

const lastUpdated = $("lastUpdated");


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /*
        Always hide loader after page initialization.
    */

    setTimeout(() => {

        hideLoader();

    }, 500);


    /*
        Check existing session.
    */

    const loggedIn =
        sessionStorage.getItem("genesisAdmin");


    if (loggedIn === "true") {

        showDashboard();

    }

});


/* =========================================================
   HIDE LOADER
========================================================= */

function hideLoader() {

    if (!loader) {
        return;
    }

    loader.style.opacity = "0";

    setTimeout(() => {

        loader.style.display = "none";

    }, 300);

}


/* =========================================================
   LOGIN
========================================================= */

if (adminLoginForm) {

    adminLoginForm.addEventListener(
        "submit",
        (e) => {

            e.preventDefault();


            const username =
                adminUsername
                    ? adminUsername.value.trim()
                    : "";


            const password =
                adminPassword
                    ? adminPassword.value
                    : "";


            if (
                username === ADMIN_USERNAME &&
                password === ADMIN_PASSWORD
            ) {

                sessionStorage.setItem(
                    "genesisAdmin",
                    "true"
                );


                sessionStorage.setItem(
                    "genesisAdminName",
                    username
                );


                if (loginMessage) {

                    loginMessage.textContent = "";

                }


                showDashboard();

            }

            else {

                if (loginMessage) {

                    loginMessage.textContent =
                        "❌ Invalid Admin ID or Password.";

                    loginMessage.style.color =
                        "#b13a3a";

                }

            }

        }
    );

}


/* =========================================================
   SHOW DASHBOARD
========================================================= */

function showDashboard() {

    hideLoader();


    if (adminLogin) {

        adminLogin.style.display = "none";

    }


    if (adminDashboard) {

        adminDashboard.style.display = "block";

    }


    const adminName =
        sessionStorage.getItem(
            "genesisAdminName"
        );


    if (
        loggedInAdmin &&
        adminName
    ) {

        loggedInAdmin.textContent =
            adminName;

    }


    loadData();

}


/* =========================================================
   PASSWORD TOGGLE
========================================================= */

if (togglePassword) {

    togglePassword.addEventListener(
        "click",
        () => {

            if (!adminPassword) {
                return;
            }


            const isPassword =
                adminPassword.type === "password";


            if (isPassword) {

                adminPassword.type = "text";


                togglePassword.innerHTML =
                    '<i class="fa-solid fa-eye-slash"></i>';

            }

            else {

                adminPassword.type = "password";


                togglePassword.innerHTML =
                    '<i class="fa-solid fa-eye"></i>';

            }

        }
    );

}


/* =========================================================
   LOAD ALL DATA
========================================================= */

async function loadData() {

    showLoadingState();


    try {

        /*
            Fetch students and expenses
            independently.
        */

        const [
            studentsResponse,
            expensesResponse
        ] = await Promise.all([

            fetch(
                DATA_URL,
                {
                    cache: "no-store"
                }
            ),

            fetch(
                EXPENSES_URL,
                {
                    cache: "no-store"
                }
            )

        ]);


        /*
            Check students response.
        */

        if (!studentsResponse.ok) {

            throw new Error(
                `Unable to load students.json. HTTP ${studentsResponse.status}`
            );

        }


        /*
            Check expenses response.
        */

        if (!expensesResponse.ok) {

            throw new Error(
                `Unable to load expenses.json. HTTP ${expensesResponse.status}`
            );

        }


        /*
            Parse JSON.
        */

        const studentsData =
            await studentsResponse.json();


        const expensesData =
            await expensesResponse.json();


        /*
            Validate students JSON.
        */

        if (!Array.isArray(studentsData)) {

            throw new Error(
                "students.json must contain an array."
            );

        }


        /*
            Validate expenses JSON.
        */

        if (!Array.isArray(expensesData)) {

            throw new Error(
                "expenses.json must contain an array."
            );

        }


        /*
            Store global data.
        */

        students = studentsData;

        expenses = expensesData;


        filteredStudents = [
            ...students
        ];


        /*
            Populate filters.
        */

        populateFilters();


        /*
            Update summary.
        */

        updateSummary(
            filteredStudents
        );


        /*
            Render student ledger.
        */

        renderLedger(
            filteredStudents
        );


        /*
            Render expenses.
        */

        renderExpenses(
            expenses
        );


        /*
            Last updated.
        */

        updateLastUpdated();


        /*
            Remove loading state.
        */

        hideLoader();

    }

    catch (error) {

        console.error(
            "Dashboard loading error:",
            error
        );


        hideLoader();

        showError(
            error.message
        );

    }

}


/* =========================================================
   LOADING STATE
========================================================= */

function showLoadingState() {

    if (!ledgerContainer) {
        return;
    }


    ledgerContainer.innerHTML = `

        <div class="empty-state">

            <i class="fa-solid fa-spinner fa-spin"></i>

            <h3>
                Loading Ledger
            </h3>

            <p>
                Fetching student and expense records...
            </p>

        </div>

    `;

}


/* =========================================================
   ERROR STATE
========================================================= */

function showError(message) {

    if (!ledgerContainer) {
        return;
    }


    ledgerContainer.innerHTML = `

        <div class="empty-state">

            <i
                class="fa-solid fa-triangle-exclamation"
                style="color:#b13a3a;"
            ></i>

            <h3>
                Unable to Load Ledger
            </h3>

            <p>
                ${escapeHTML(message)}
            </p>

            <button
                type="button"
                onclick="loadData()"
                style="
                    margin-top:15px;
                    padding:10px 18px;
                    border:none;
                    border-radius:8px;
                    cursor:pointer;
                "
            >
                Retry
            </button>

        </div>

    `;

}


/* =========================================================
   POPULATE FILTERS
========================================================= */

function populateFilters() {

    /*
        Course filter.
    */

    if (courseFilter) {

        const courses = [
            ...new Set(

                students
                    .map(
                        student =>
                            student.course
                    )
                    .filter(Boolean)

            )
        ].sort();


        courseFilter.innerHTML = `

            <option value="">
                All Courses
            </option>

        `;


        courses.forEach(course => {

            const option =
                document.createElement("option");


            option.value =
                course;


            option.textContent =
                course;


            courseFilter.appendChild(
                option
            );

        });

    }


    /*
        Year filter.
    */

    if (yearFilter) {

        const years = [
            ...new Set(

                students
                    .map(
                        student =>
                            student.year
                    )
                    .filter(Boolean)

            )
        ];


        years.sort(
            compareYears
        );


        yearFilter.innerHTML = `

            <option value="">
                All Years
            </option>

        `;


        years.forEach(year => {

            const option =
                document.createElement("option");


            option.value =
                year;


            option.textContent =
                year;


            yearFilter.appendChild(
                option
            );

        });

    }

}


/* =========================================================
   YEAR SORT
========================================================= */

function compareYears(a, b) {

    const order = {

        "1st Year": 1,
        "2nd Year": 2,
        "3rd Year": 3,
        "4th Year": 4

    };


    if (
        order[a] !== undefined &&
        order[b] !== undefined
    ) {

        return order[a] - order[b];

    }


    return String(a)
        .localeCompare(
            String(b)
        );

}


/* =========================================================
   FILTER EVENTS
========================================================= */

if (courseFilter) {

    courseFilter.addEventListener(
        "change",
        applyFilters
    );

}


if (yearFilter) {

    yearFilter.addEventListener(
        "change",
        applyFilters
    );

}


if (modeFilter) {

    modeFilter.addEventListener(
        "change",
        applyFilters
    );

}


if (statusFilter) {

    statusFilter.addEventListener(
        "change",
        applyFilters
    );

}


if (studentSearch) {

    studentSearch.addEventListener(
        "input",
        applyFilters
    );

}


/* =========================================================
   APPLY FILTERS
========================================================= */

function applyFilters() {

    const selectedCourse =
        courseFilter
            ? courseFilter.value
            : "";


    const selectedYear =
        yearFilter
            ? yearFilter.value
            : "";


    const selectedMode =
        modeFilter
            ? modeFilter.value
            : "";


    const selectedStatus =
        statusFilter
            ? statusFilter.value
            : "";


    const search =
        studentSearch
            ? studentSearch.value
                .trim()
                .toLowerCase()
            : "";


    filteredStudents =
        students.filter(student => {


            /*
                Course.
            */

            if (
                selectedCourse &&
                student.course !== selectedCourse
            ) {

                return false;

            }


            /*
                Year.
            */

            if (
                selectedYear &&
                student.year !== selectedYear
            ) {

                return false;

            }


            /*
                Mode.
            */

            if (
                selectedMode &&
                String(
                    student.mode || ""
                ).toLowerCase()
                !==
                selectedMode.toLowerCase()
            ) {

                return false;

            }


            /*
                Status.
            */

            const status =
                getStudentStatus(
                    student
                );


            if (
                selectedStatus &&
                status !==
                selectedStatus.toLowerCase()
            ) {

                return false;

            }


            /*
                Search.
            */

            if (search) {

                const name =
                    String(
                        student.name || ""
                    ).toLowerCase();


                const enrollment =
                    String(
                        student.enrollment || ""
                    ).toLowerCase();


                if (
                    !name.includes(search) &&
                    !enrollment.includes(search)
                ) {

                    return false;

                }

            }


            return true;

        });


    /*
        Render.
    */

    renderLedger(
        filteredStudents
    );


    /*
        Update summary.
    */

    updateSummary(
        filteredStudents
    );

}


/* =========================================================
   RESET FILTERS
========================================================= */

if (resetFilters) {

    resetFilters.addEventListener(
        "click",
        () => {

            if (courseFilter) {
                courseFilter.value = "";
            }


            if (yearFilter) {
                yearFilter.value = "";
            }


            if (modeFilter) {
                modeFilter.value = "";
            }


            if (statusFilter) {
                statusFilter.value = "";
            }


            if (studentSearch) {
                studentSearch.value = "";
            }


            filteredStudents = [
                ...students
            ];


            renderLedger(
                filteredStudents
            );


            updateSummary(
                filteredStudents
            );

        }
    );

}


/* =========================================================
   STUDENT STATUS
========================================================= */

function getStudentStatus(student) {

    if (student.status) {

        return String(
            student.status
        ).toLowerCase();

    }


    if (student.payment) {

        return String(
            student.payment
        ).toLowerCase();

    }


    return "pending";

}


/* =========================================================
   UPDATE SUMMARY
========================================================= */

function updateSummary(data) {

    let onlineTotal = 0;
    let cashTotal = 0;

    let confirmed = 0;
    let confirmedTotal = 0;

    let pending = 0;
    let rejected = 0;


    /* =========================================
       FILTERED STUDENT SUMMARY
    ========================================= */

    data.forEach(student => {

        const amount =
            Number(student.amount) || 0;

        const status =
            getStudentStatus(student);

        const mode =
            String(student.mode || "")
                .toLowerCase();


        if (status === "confirmed") {

            confirmed++;

            confirmedTotal += amount;


            if (mode === "online") {

                onlineTotal += amount;

            }


            if (mode === "cash") {

                cashTotal += amount;

            }

        }


        if (status === "pending") {

            pending++;

        }


        if (status === "rejected") {

            rejected++;

        }

    });


    /* =========================================
       OVERALL FINANCIAL CALCULATION
       
       IMPORTANT:
       Finance section should NOT use filtered
       student data.

       It should always show the complete
       event ledger.
    ========================================= */

    const totalReceived =
        totalStudentCollection();


    const totalExpense =
        calculateExpenseTotal();


    const balance =
        totalReceived - totalExpense;


    /* =========================================
       EXISTING DASHBOARD CARDS
    ========================================= */

    setText(
        totalStudents,
        data.length
    );


    setText(
        onlineCollection,
        formatCurrency(
            onlineTotal
        )
    );


    setText(
        cashCollection,
        formatCurrency(
            cashTotal
        )
    );


    setText(
        totalCollection,
        formatCurrency(
            confirmedTotal
        )
    );


    setText(
        confirmedCount,
        confirmed
    );


    setText(
        confirmedAmount,
        formatCurrency(
            confirmedTotal
        )
    );


    setText(
        pendingCount,
        pending
    );


    setText(
        rejectedCount,
        rejected
    );


    /* =========================================
       FINANCE SECTION
    ========================================= */

    setText(
        financeTotalReceived,
        formatCurrency(
            totalReceived
        )
    );


    setText(
        totalExpenses,
        formatCurrency(
            totalExpense
        )
    );


    setText(
        remainingBalance,
        formatCurrency(
            balance
        )
    );


    /* =========================================
       EXPENSE REGISTER TOTAL
    ========================================= */

    setText(
        expenseTableTotal,
        formatCurrency(
            totalExpense
        )
    );


    /* =========================================
       BALANCE CALCULATION BOX
    ========================================= */

    setText(
        balanceReceived,
        formatCurrency(
            totalReceived
        )
    );


    setText(
        balanceExpenses,
        formatCurrency(
            totalExpense
        )
    );


    setText(
        balanceRemaining,
        formatCurrency(
            balance
        )
    );


    /* =========================================
       BALANCE COLOR
    ========================================= */

    if (remainingBalance) {

        remainingBalance.classList.remove(
            "balance-positive",
            "balance-negative"
        );


        if (balance >= 0) {

            remainingBalance.classList.add(
                "balance-positive"
            );

        } else {

            remainingBalance.classList.add(
                "balance-negative"
            );

        }

    }

}


/* =========================================================
   TOTAL STUDENT COLLECTION
========================================================= */

function totalStudentCollection() {

    return students.reduce(
        (total, student) => {

            const status =
                getStudentStatus(
                    student
                );


            if (
                status !== "confirmed"
            ) {

                return total;

            }


            return total +
                (
                    Number(
                        student.amount
                    ) || 0
                );

        },
        0
    );

}


/* =========================================================
   EXPENSE TOTAL
========================================================= */

function calculateExpenseTotal() {

    return expenses.reduce(
        (total, expense) => {

            return total +
                (
                    Number(
                        expense.amount
                    ) || 0
                );

        },
        0
    );

}


/* =========================================================
   RENDER LEDGER
========================================================= */

function renderLedger(data) {

    if (!ledgerContainer) {
        return;
    }


    if (!data.length) {

        ledgerContainer.innerHTML = `

            <div class="empty-state">

                <i
                    class="fa-solid fa-magnifying-glass"
                ></i>

                <h3>
                    No Records Found
                </h3>

                <p>
                    Try changing your filters
                    or search query.
                </p>

            </div>

        `;

        return;

    }


    /*
        Group by course.
    */

    const courseGroups =
        groupBy(
            data,
            "course"
        );


    let html = "";


    Object.keys(courseGroups)
        .sort()
        .forEach(course => {


            const courseStudents =
                courseGroups[course];


            /*
                Course collection.
            */

            const courseTotal =
                courseStudents.reduce(
                    (sum, student) => {

                        if (
                            getStudentStatus(
                                student
                            )
                            === "confirmed"
                        ) {

                            return sum +
                                (
                                    Number(
                                        student.amount
                                    ) || 0
                                );

                        }


                        return sum;

                    },
                    0
                );


            /*
                Course in-charge.
            */

            const inCharge =
                getInCharge(
                    courseStudents
                );


            /*
                Group by year.
            */

            const yearGroups =
                groupBy(
                    courseStudents,
                    "year"
                );


            html += `

                <div class="course-block">

                    <div class="course-header">

                        <div>

                            <div class="course-title">
                                ${escapeHTML(
                                    course ||
                                    "Course Not Specified"
                                )}
                            </div>

                            <div class="course-incharge">

                                In-charge:

                                <strong>
                                    ${escapeHTML(
                                        inCharge
                                    )}
                                </strong>

                            </div>

                        </div>


                        <div class="course-total">

                            <span>
                                Confirmed Collection
                            </span>

                            <strong>
                                ${formatCurrency(
                                    courseTotal
                                )}
                            </strong>

                        </div>

                    </div>

            `;


            Object.keys(yearGroups)
                .sort(compareYears)
                .forEach(year => {

                    html += renderYear(
                        year,
                        yearGroups[year]
                    );

                });


            html += `

                </div>

            `;

        });


    ledgerContainer.innerHTML =
        html;

}


/* =========================================================
   RENDER YEAR
========================================================= */

function renderYear(
    year,
    data
) {

    const confirmedCount =
        data.filter(
            student =>
                getStudentStatus(
                    student
                ) === "confirmed"
        ).length;


    let html = `

        <div class="year-block">

            <div class="year-header">

                <h4>
                    ${escapeHTML(
                        year ||
                        "Year Not Specified"
                    )}
                </h4>

                <span class="year-count">

                    ${confirmedCount}
                    confirmed

                </span>

            </div>


            <div class="table-wrapper">

                <table class="ledger-table">

                    <thead>

                        <tr>

                            <th>#</th>

                            <th>
                                Student
                            </th>

                            <th>
                                Enrollment
                            </th>

                            <th>
                                Form No.
                            </th>

                            <th>
                                Mode
                            </th>

                            <th>
                                Amount
                            </th>

                            <th>
                                Status
                            </th>

                        </tr>

                    </thead>

                    <tbody>

    `;


    data.forEach(
        (student, index) => {


            const status =
                getStudentStatus(
                    student
                );


            const mode =
                String(
                    student.mode ||
                    "—"
                );


            const amount =
                Number(
                    student.amount
                ) || 0;


            const modeClass =
                mode.toLowerCase()
                    === "online"
                    ? "mode-online"
                    : mode.toLowerCase()
                        === "cash"
                        ? "mode-cash"
                        : "";


            const statusClass =
                getStatusClass(
                    status
                );


            html += `

                <tr>

                    <td>
                        ${index + 1}
                    </td>


                    <td>

                        <span class="student-name">

                            ${escapeHTML(
                                student.name ||
                                "—"
                            )}

                        </span>

                    </td>


                    <td>

                        <span
                            class="enrollment-number"
                        >

                            ${escapeHTML(
                                student.enrollment ||
                                "—"
                            )}

                        </span>

                    </td>


                    <td>

                        ${escapeHTML(
                            String(
                                student.formNo ??
                                "—"
                            )
                        )}

                    </td>


                    <td>

                        <span
                            class="
                                mode-badge
                                ${modeClass}
                            "
                        >

                            ${escapeHTML(
                                mode
                            )}

                        </span>

                    </td>


                    <td>

                        <strong>

                            ${formatCurrency(
                                amount
                            )}

                        </strong>

                    </td>


                    <td>

                        <span
                            class="
                                status-badge
                                ${statusClass}
                            "
                        >

                            ${capitalize(
                                status
                            )}

                        </span>

                    </td>

                </tr>

            `;

        }
    );


    html += `

                    </tbody>

                </table>

            </div>

        </div>

    `;


    return html;

}


/* =========================================================
   RENDER EXPENSES
========================================================= */

function renderExpenses(data) {

    if (!expenseContainer) {
        return;
    }


    if (!data.length) {

        expenseContainer.innerHTML = `

            <div class="empty-state">

                <i class="fa-solid fa-receipt"></i>

                <h3>
                    No Expenses Recorded
                </h3>

                <p>
                    No expense entries are available.
                </p>

            </div>

        `;

        return;

    }


    /*
        Sort latest expense first.
    */

    const sortedExpenses = [
        ...data
    ].sort(
        (a, b) => {

            return String(
                b.date || ""
            ).localeCompare(
                String(
                    a.date || ""
                )
            );

        }
    );


    let html = `

        <div class="table-wrapper">

            <table class="ledger-table expense-table">

                <thead>

                    <tr>

                        <th>#</th>

                        <th>
                            Date
                        </th>

                        <th>
                            Purpose
                        </th>

                        <th>
                            Paid To
                        </th>

                        <th>
                            Mode
                        </th>

                        <th>
                            Amount
                        </th>

                    </tr>

                </thead>

                <tbody>

    `;


    sortedExpenses.forEach(
        (expense, index) => {


            const mode =
                String(
                    expense.mode ||
                    "—"
                );


            const amount =
                Number(
                    expense.amount
                ) || 0;


            const modeClass =
                mode.toLowerCase()
                    === "online"
                    ? "mode-online"
                    : mode.toLowerCase()
                        === "cash"
                        ? "mode-cash"
                        : "";


            html += `

                <tr>

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        ${formatDate(
                            expense.date
                        )}
                    </td>

                    <td>

                        <strong>
                            ${escapeHTML(
                                expense.purpose ||
                                "—"
                            )}
                        </strong>

                    </td>

                    <td>

                        ${escapeHTML(
                            expense.paidTo ||
                            "—"
                        )}

                    </td>

                    <td>

                        <span
                            class="
                                mode-badge
                                ${modeClass}
                            "
                        >

                            ${escapeHTML(
                                mode
                            )}

                        </span>

                    </td>

                    <td>

                        <strong>
                            ${formatCurrency(
                                amount
                            )}
                        </strong>

                    </td>

                </tr>

            `;

        }
    );


    html += `

                </tbody>

            </table>

        </div>

    `;


    expenseContainer.innerHTML =
        html;

}


/* =========================================================
   FIND IN-CHARGE
========================================================= */

function getInCharge(data) {

    const person =
        data.find(
            student =>

                student.inCharge ||
                student.incharge ||
                student.coordinator
        );


    if (!person) {

        return "Not specified";

    }


    return (
        person.inCharge ||
        person.incharge ||
        person.coordinator
    );

}


/* =========================================================
   GROUP BY
========================================================= */

function groupBy(
    array,
    key
) {

    return array.reduce(
        (
            groups,
            item
        ) => {

            const value =
                item[key] ||
                "Not Specified";


            if (!groups[value]) {

                groups[value] = [];

            }


            groups[value].push(
                item
            );


            return groups;

        },
        {}
    );

}


/* =========================================================
   STATUS CLASS
========================================================= */

function getStatusClass(
    status
) {

    switch (
        String(
            status
        ).toLowerCase()
    ) {

        case "confirmed":
            return "status-confirmed";

        case "pending":
            return "status-pending";

        case "rejected":
            return "status-rejected";

        default:
            return "status-pending";

    }

}


/* =========================================================
   FORMAT CURRENCY
========================================================= */

function formatCurrency(
    amount
) {

    return new Intl.NumberFormat(
        "en-IN",
        {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0
        }
    ).format(
        Number(amount) || 0
    );

}


/* =========================================================
   FORMAT DATE
========================================================= */

function formatDate(
    date
) {

    if (!date) {
        return "—";
    }


    const parsed =
        new Date(date);


    if (
        Number.isNaN(
            parsed.getTime()
        )
    ) {

        return escapeHTML(
            date
        );

    }


    return parsed.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


/* =========================================================
   CAPITALIZE
========================================================= */

function capitalize(
    text
) {

    if (!text) {
        return "";
    }


    return (
        text.charAt(0).toUpperCase() +
        text.slice(1)
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(
    value
) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   SAFE TEXT SETTER
========================================================= */

function setText(
    element,
    value
) {

    if (element) {

        element.textContent =
            value;

    }

}


/* =========================================================
   LAST UPDATED
========================================================= */

function updateLastUpdated() {

    if (!lastUpdated) {
        return;
    }


    const now =
        new Date();


    lastUpdated.textContent =
        now.toLocaleString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
        );

}


/* =========================================================
   LOGOUT
========================================================= */

if (logoutBtn) {

    logoutBtn.addEventListener(
        "click",
        () => {

            sessionStorage.removeItem(
                "genesisAdmin"
            );


            sessionStorage.removeItem(
                "genesisAdminName"
            );


            if (adminDashboard) {

                adminDashboard.style.display =
                    "none";

            }


            if (adminLogin) {

                adminLogin.style.display =
                    "flex";

            }


            if (adminLoginForm) {

                adminLoginForm.reset();

            }


            if (loginMessage) {

                loginMessage.textContent =
                    "";

            }

        }
    );

}