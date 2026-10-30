// RMD help search: the list of jobs people may want to do, and where to go for each.
// EDIT THIS FILE to add, change or remove a job. Nothing else needs touching.
//
// Review twice a year (March and September). When you have checked the list, change "reviewed" to today's date.
// Directors see a small "review due" note on the menu once the date is more than 6 months old.
//
// Each job:
//   t   = the job, in plain words (shown as the result title)
//   k   = other words people might type (spaces between words, no need for punctuation)
//   href= the page to open (must be a real file in this site; the link check script tests this)
//   p   = short name of that page (shown under the title)
//   who = who sees this result:
//         all      everyone who can sign in
//         notma    everyone except people a Director has marked as "menu assessors"
//         faculty  Directors, Faculty and Assessor Faculty
//         dirsf    Directors, Student Faculty and Senior Faculty
//         dirsenior Directors and Senior Faculty
//         dir      Directors only
//         sfr      Directors, and Senior Faculty while the review is open (1 April to 1 July)
window.RMD_HELP = {
  reviewed: "2026-10-29",
  reviewEveryMonths: 6,
  tasks: [
    // ── Evening courses: running the night ──
    { t: "Run the Monday night (register, assessments, retests, results)", k: "monday night hub assessment night register check in evening course", href: "phase1.html", p: "Monday Night Hub", who: "all" },
    { t: "Mark someone present or absent", k: "register attendance tick present absent here not here", href: "phase1.html", p: "Monday Night Hub", who: "all" },
    { t: "Mark a candidate late", k: "late arrived late", href: "phase1.html", p: "Monday Night Hub", who: "all" },
    { t: "Put back a candidate marked absent by mistake", k: "put back undo absent wrongly marked", href: "phase1.html", p: "Monday Night Hub", who: "all" },
    { t: "Set up or start a retest", k: "retest resit retake second attempt third attempt", href: "phase1.html", p: "Monday Night Hub", who: "all" },
    { t: "Practise on the test course", k: "test course practise try it out training", href: "admin-stage1-testcourse.html", p: "Test Course", who: "dir" },
    { t: "Show the live register on a big screen", k: "register screen live register projector display", href: "register-live.html", p: "Register live screen", who: "all" },
    { t: "Show the assessment night flow on a screen", k: "flow screen who is where rooms on screen display", href: "assessment-flow.html", p: "Assessment night flow screen", who: "all" },
    { t: "Show the live assessment screen", k: "assessment live screen display", href: "assessment-live.html", p: "Assessment night live screen", who: "all" },
    { t: "Check the night is ready before it starts", k: "readiness ready checklist before the night preflight", href: "admin-stage1-readiness.html", p: "Assessment Night Readiness", who: "dir" },
    { t: "Read who does what on assessment night", k: "roles who does what runner assessor duties assessment evening guide", href: "resources/instructor-guide/2-assessment-evening-roles.html", p: "Assessment night guide", who: "all" },
    { t: "See pass rates and who has passed", k: "results pass rate passed failed outcomes", href: "assessment-results.html", p: "Assessment results", who: "dirsf" },
    { t: "Read assessor comments", k: "assessor comments feedback on candidate", href: "assessment-results.html", p: "Assessment results", who: "dirsf" },
    { t: "Score a candidate I taught (OPIS)", k: "opis rate candidate rating score communication attitude feedback punctuality", href: "opis-rating.html", p: "OPIS candidate rating", who: "notma" },
    { t: "Review OPIS scores", k: "opis review scores ratings", href: "admin-instructor-applications.html", p: "Instructor application review", who: "dirsenior" },

    // ── Courses, candidates and rooms ──
    { t: "See who is in which room and which instructors are teaching", k: "roster room who is in my room instructor team course list", href: "course-roster-view.html", p: "Evening Course Rosters", who: "all" },
    { t: "Find a candidate by name", k: "find candidate search person where is look up", href: "course-roster-view.html", p: "Evening Course Rosters", who: "all" },
    { t: "Edit rooms and instructor teams for the current course", k: "edit roster change room move instructor manage current course", href: "course-roster-edit.html", p: "Manage Current Course", who: "dirsf" },
    { t: "Move a candidate to a different course", k: "move change course new course swap reallocate allocation slot", href: "course-allocation.html", p: "Course allocation", who: "dir" },
    { t: "Book a candidate into an assessment slot", k: "assessment slot book assessment allocate slot", href: "course-allocation.html", p: "Course allocation", who: "dir" },
    { t: "Email people after they are moved", k: "reallocation email tell them they moved email about the change", href: "course-allocation.html", p: "Course allocation", who: "dir" },
    { t: "Check a candidate is eligible for assessment, or override", k: "eligible eligibility override allowed to assess", href: "course-allocation.html", p: "Course allocation", who: "dir" },
    { t: "Deal with a candidate repeating a course", k: "repeat repeating second time resit course", href: "course-allocation.html", p: "Course allocation", who: "dir" },
    { t: "Add a new or late first year candidate", k: "add candidate new candidate late joiner late addition", href: "admin-stage1-candidates.html", p: "First year candidates", who: "dir" },
    { t: "Edit a candidate record (name, email, course)", k: "edit candidate correct details fix name wrong email", href: "admin-stage1-candidates.html", p: "First year candidates", who: "dir" },
    { t: "Remove a candidate who has left", k: "leaver left withdrawn remove candidate delete", href: "admin-stage1-candidates.html", p: "First year candidates", who: "dir" },
    { t: "Put candidates and instructors into teaching rooms", k: "room allocation teaching rooms instructor teams course room", href: "admin-course-room-allocation.html", p: "Course Room and Instructor Allocation", who: "dir" },
    { t: "Change Stage 1 settings (course dates, switches)", k: "settings stage 1 settings course dates", href: "admin-stage1-settings.html", p: "Stage 1 Settings", who: "dir" },

    // ── Email and contact ──
    { t: "Email a group (candidates, assessors, instructors, faculty)", k: "email comms message bulk email send to all mail", href: "admin-comms.html", p: "Comms", who: "dirsf" },
    { t: "Email only the first year candidates on one course", k: "email candidates email a course message candidates", href: "admin-comms.html", p: "Comms", who: "dirsf" },
    { t: "Chase people who have not set up their account", k: "reminders not signed in chase account reminder", href: "admin-reminder-hub.html", p: "Reminder Hub", who: "dir" },
    { t: "Find out why someone cannot sign in", k: "cannot sign in cant log in locked out why cant they password reset forgot password", href: "admin-account-check.html", p: "Why Can't They", who: "dir" },
    { t: "Reset my password or fix a sign-in problem", k: "forgot password reset password cant log in locked out sign in problem", href: "reset-password.html", p: "Reset password", who: "all" },
    { t: "Contact RMD Birmingham", k: "contact enquiries general email help", href: "mailto:colmds-c-rmdbirmingham@adf.bham.ac.uk", p: "General enquiries email", who: "all" },

    // ── Absences and concerns ──
    { t: "Tell RMD I cannot teach on an evening", k: "absent cant make it sick ill cannot teach report absence off", href: "instructor-absence.html", p: "Report an absence", who: "all" },
    { t: "See who cannot teach and which rooms need cover", k: "absences cover who is off short staffed", href: "admin-absences.html", p: "Instructor absences", who: "dirsf" },
    { t: "Flag a concern about an instructor", k: "concern flag worried about instructor escalate", href: "admin-priority-issues.html#flag", p: "Flag a concern", who: "dirsf" },
    { t: "See issues that need a decision", k: "priority issues urgent needs decision high priority", href: "admin-priority-issues.html", p: "High priority issues", who: "dirsf" },
    { t: "Escalate a concern about a candidate", k: "escalate candidate worried about student concern", href: "resources/instructor-guide/5-faqs.html", p: "Instructor guide FAQs", who: "all" },

    // ── People, roles and instructor selection ──
    { t: "Find a faculty member", k: "directory who is faculty list contact faculty", href: "faculty.html?group=student&from=members", p: "Faculty directory", who: "all" },
    { t: "Change someone's role or access", k: "role access make director give access permissions", href: "admin-roles-access.html", p: "Roles and access", who: "dir" },
    { t: "See someone's role history", k: "role history previous roles", href: "admin-roles-access.html#history", p: "Roles and access", who: "dir" },
    { t: "Fix an instructor who cannot see what they should", k: "fix access instructor cannot see missing menu", href: "admin-fix-instructor-access.html", p: "Fix Instructor Access", who: "dir" },
    { t: "Hide or show the OPIS card for an assessor", k: "menu assessor hide opis assessors", href: "admin-menu-assessors.html", p: "Menu Assessors", who: "dir" },
    { t: "Review instructor applications (expressions of interest)", k: "eoi expression of interest applications apply to instruct", href: "admin-instructor-applications.html", p: "Instructor application review", who: "dirsenior" },
    { t: "See the overall instructor ranking and select next year's instructors", k: "ranking rank select instructors shortlist choose", href: "admin-instructor-applications.html", p: "Instructor application review", who: "dirsenior" },
    { t: "Fill in Instructor Potential (IP) forms", k: "ip form instructor potential rcuk form", href: "admin-ip-forms.html", p: "Instructor Potential Forms", who: "dir" },
    { t: "Open or close the instructor expression of interest form", k: "open eoi close eoi eoi dates", href: "admin-global-tools.html", p: "Global admin tools", who: "dir" },
    { t: "Do my Senior Faculty review", k: "senior faculty review annual reflection future plans", href: "senior-faculty-review.html", p: "Senior Faculty review", who: "sfr" },
    { t: "Clean up duplicate people", k: "duplicate dedupe same person twice", href: "admin-dedupe-people.html", p: "Duplicate People", who: "dir" },
    { t: "Add or edit the faculty roster in bulk", k: "faculty roster whos who bulk replace", href: "admin-faculty-roster.html", p: "Faculty Roster", who: "dir" },
    { t: "Create accounts for lots of people", k: "bulk accounts create accounts new users", href: "admin-bulk-users.html", p: "Bulk User Setup", who: "dir" },

    // ── Me ──
    { t: "Change my name (preferred or passport)", k: "my name preferred name passport name known as", href: "my-account.html", p: "My account", who: "all" },
    { t: "Do my Memorandum of Understanding", k: "mou memorandum of understanding", href: "mou-form.html", p: "MOU", who: "all" },
    { t: "Tell RMD something is broken, awkward or missing on the site", k: "feedback bug broken suggestion problem with site", href: "feedback.html", p: "Site feedback", who: "all" },
    { t: "Read the site feedback people have sent", k: "feedback inbox read feedback", href: "admin-feedback.html", p: "Site feedback inbox", who: "dir" },

    // ── Resources and guides ──
    { t: "Find teaching resources, guidelines, videos and the QCPR app", k: "resources guidelines videos qcpr rcuk lifesaver slides", href: "member-resources.html", p: "Resources", who: "all" },
    { t: "Find the instructor guide (timeline and teaching structure)", k: "instructor guide timeline structure term dates", href: "resources/instructor-guide/1-timeline-teaching-structure.html", p: "Instructor guide", who: "all" },
    { t: "Read the instructor admin guide (Worklink, expenses)", k: "admin guide worklink expenses pay", href: "resources/instructor-guide/3-admin-guide.html", p: "Instructor guide: admin", who: "all" },
    { t: "Support and development for instructors", k: "support development progress to senior", href: "resources/instructor-guide/4-support-and-development.html", p: "Instructor guide: support", who: "all" },
    { t: "Answers to common questions (fail policy, manikin clicker, Canvas, socials)", k: "faq questions fail policy clicker canvas worklink social", href: "resources/instructor-guide/5-faqs.html", p: "Instructor guide FAQs", who: "all" },
    { t: "Provider course materials", k: "provider course provider", href: "member-resources.html", p: "Resources", who: "all" },
    { t: "Assessor guidance and grey areas", k: "assessor course grey areas assessing guidance", href: "resources/assessor-grey-areas.html", p: "Assessor grey areas", who: "all" },

    // ── Instructor Weekend ──
    { t: "Course Director dashboard (registrations, rooms, assessments)", k: "cd dashboard course director iw dashboard instructor weekend", href: "cd-dashboard.html", p: "Course Director dashboard", who: "dir" },
    { t: "Open the Instructor Weekend timetable", k: "timetable weekend timetable schedule", href: "timetable.html", p: "Timetable", who: "all" },
    { t: "Shift the timetable times on the day", k: "time shift running late delay shift times", href: "time-shift.html", p: "Time Shift", who: "dir" },
    { t: "Open the organiser board for the weekend", k: "organiser board organiser checklist weekend", href: "organiser-board.html", p: "Organiser Board", who: "dir" },
    { t: "Print name badges", k: "badges name badge print badge", href: "iw-badges.html", p: "Badge templates", who: "faculty" },
    { t: "Show the check-in poster (QR code)", k: "check in poster qr self check in", href: "iw-checkin-poster.html", p: "Check-in poster", who: "faculty" },
    { t: "See weekend registrations, meals and accommodation", k: "iw registrations meals dietary accommodation", href: "admin-iw-registrations.html", p: "IW Registrations", who: "dir" },
    { t: "Allocate rooms for the weekend", k: "iw rooms room allocation weekend", href: "admin-room-allocation.html", p: "Room Allocation (weekend)", who: "dir" },
    { t: "Allocate lectures for the weekend", k: "lecture allocation lectures", href: "admin-lecture-allocation.html", p: "Lecture Allocation", who: "dir" },
    { t: "Manage groups for the weekend", k: "groups group management", href: "admin-groups.html", p: "Group Management", who: "dir" },
    { t: "Sign off the gateway or confirm passes", k: "gateway sign off pass confirmation confirm pass", href: "admin-gateway-signoff.html", p: "Gateway Sign-off", who: "dir" },
    { t: "Print paper sheets for the weekend", k: "paper sheets printouts print", href: "admin-iw-paper-sheets.html", p: "Paper Sheets", who: "dir" },
    { t: "Export weekend data", k: "export iw export download data", href: "admin-iw-export.html", p: "Weekend data export", who: "dir" },
    { t: "Check accounts before the weekend", k: "preflight accounts check pre weekend", href: "admin-iw-preflight.html", p: "Account Preflight", who: "dir" },
    { t: "See faculty replies to the weekend form", k: "faculty responses who replied faculty form", href: "admin-faculty-responses.html", p: "Faculty Responses", who: "dir" },
    { t: "Weekend course info and session guides", k: "course info session guides site info", href: "site-info.html?role=director", p: "Instructor Weekend", who: "dir" },

    // ── Global admin ──
    { t: "See who has submitted their MOU", k: "mou dashboard mou status", href: "admin-mou-dashboard.html", p: "MOU Dashboard", who: "dir" },
    { t: "Export the visitor request for the university", k: "visitor request visiting personnel export", href: "admin-visitor-request-export.html", p: "Visitor Request Export", who: "dir" },
    { t: "ERC export", k: "erc export", href: "admin-erc-export.html", p: "ERC Export", who: "dir" },
    { t: "Open the global admin tools", k: "global tools admin tools", href: "admin-global-tools.html", p: "Global admin tools", who: "dir" },
    { t: "Turn the Senior Faculty review on or off", k: "sfr gate senior faculty window", href: "admin-global-tools.html", p: "Global admin tools", who: "dir" },
    { t: "CPD certificates", k: "cpd certificate", href: "admin-global-tools.html", p: "Global admin tools", who: "dir" },
    { t: "Summer meeting dietary responses", k: "summer meeting dietary", href: "admin-summer-meeting-dietary.html", p: "Summer meeting dietary", who: "dir" }
  ]
};
