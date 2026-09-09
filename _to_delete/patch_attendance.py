import re

path = "attendance.html"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. State: add iwAssignments map
old = 'let allPeople    = [];\nlet attendance   = {};   // { personId: { arrivedAt (timestamp) } }\nlet currentTab   = "all";'
new = 'let allPeople    = [];\nlet attendance   = {};   // { personId: { arrivedAt (timestamp) } }\nlet iwAssignments = {};  // { uid: function }  -- this year\'s IW job, from iw_assignments; falls back to people.role when absent\nlet currentTab   = "all";'
assert content.count(old) == 1, "state block not found"
content = content.replace(old, new)

# 2. Boot: load iw assignments alongside people/attendance
old = "    await Promise.all([loadPeople(), loadAttendance()]);\n    renderList();\n    subscribeAttendance();"
new = "    await Promise.all([loadPeople(), loadAttendance(), loadIwAssignments()]);\n    renderList();\n    subscribeAttendance();"
assert content.count(old) == 1, "boot block not found"
content = content.replace(old, new)

# 3. New loadIwAssignments() function + effectiveRole() helper, inserted after loadPeople()
old = '''async function loadPeople() {
  try {
    const snap = await db.collection(COLLECTIONS.people).orderBy("name").get();
    allPeople = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Demo data
    allPeople = [
      { id: "c1", name: "Alice Tan",      role: "instructor", group: "Group 1" },
      { id: "c2", name: "Ben Osei",       role: "instructor", group: "Group 1" },
      { id: "c3", name: "Cara Patel",     role: "assessor",   group: "Group 2" },
      { id: "c4", name: "Dan Williams",   role: "instructor", group: "Group 2" },
      { id: "c5", name: "Elena Kowalski", role: "instructor", group: "Group 3" },
      { id: "c6", name: "Finn Murray",    role: "assessor",   group: "Group 3" },
      { id: "i1", name: "Dr Emma Singh",  role: "itc",        group: "" },
      { id: "f1", name: "Dr James Liu",   role: "faculty",    group: "Group 1" },
      { id: "f2", name: "Dr Yemi Addo",   role: "full-instructor", group: "Group 2" }
    ];
  }
}'''
new = '''async function loadPeople() {
  try {
    const snap = await db.collection(COLLECTIONS.people).orderBy("name").get();
    allPeople = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Demo data
    allPeople = [
      { id: "c1", name: "Alice Tan",      role: "instructor", group: "Group 1" },
      { id: "c2", name: "Ben Osei",       role: "instructor", group: "Group 1" },
      { id: "c3", name: "Cara Patel",     role: "assessor",   group: "Group 2" },
      { id: "c4", name: "Dan Williams",   role: "instructor", group: "Group 2" },
      { id: "c5", name: "Elena Kowalski", role: "instructor", group: "Group 3" },
      { id: "c6", name: "Finn Murray",    role: "assessor",   group: "Group 3" },
      { id: "i1", name: "Dr Emma Singh",  role: "itc",        group: "" },
      { id: "f1", name: "Dr James Liu",   role: "faculty",    group: "Group 1" },
      { id: "f2", name: "Dr Yemi Addo",   role: "full-instructor", group: "Group 2" }
    ];
  }
}

// Layered access, step 4 (read side): this year's IW job now lives in
// iw_assignments, kept separate from permanent standing on the person doc.
// One bulk read per page load rather than one per person. If it fails or
// a person has no assignment doc yet, effectiveRole() falls back to
// people.role exactly as before -- nothing here can break the page.
async function loadIwAssignments() {
  try {
    const snap = await db.collection(COLLECTIONS.iwAssignments)
      .where("year", "==", CURRENT_IW_YEAR).get();
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.uid && data.function) iwAssignments[data.uid] = data.function;
    });
  } catch (e) {
    // Collection missing, empty, or unreadable -- fall back to people.role.
  }
}

function effectiveRole(p) {
  return iwAssignments[p.id] || p.role;
}'''
assert content.count(old) == 1, "loadPeople block not found"
content = content.replace(old, new)

# 4. Grouping: candidates/faculty split now uses effectiveRole()
old = '  const candidates = people.filter(p => ["instructor","assessor"].includes(p.role));\n  const faculty    = people.filter(p => ["faculty","full-instructor","itc","director","assessor-faculty"].includes(p.role));'
new = '  const candidates = people.filter(p => ["instructor","assessor"].includes(effectiveRole(p)));\n  const faculty    = people.filter(p => ["faculty","full-instructor","itc","director","assessor-faculty"].includes(effectiveRole(p)));'
assert content.count(old) == 1, "grouping block not found"
content = content.replace(old, new)

# 5. Row rendering: colour/label now keyed off effectiveRole()
old = '''  const colour  = arrived ? "avatar-green" : (ROLE_COLOURS[p.role] || "avatar-muted");
  const label   = p.roleLabel || ROLE_LABELS[p.role] || p.role;'''
new = '''  const role    = effectiveRole(p);
  const colour  = arrived ? "avatar-green" : (ROLE_COLOURS[role] || "avatar-muted");
  const label   = p.roleLabel || ROLE_LABELS[role] || role;'''
assert content.count(old) == 1, "personRow block not found"
content = content.replace(old, new)

# 6. Walk-in: dual-write the new record alongside the old field, same
# pattern as admin-bulk-users.html, so walk-ins are captured in both places too.
old = '''    const ref = db.collection(COLLECTIONS.people).doc();
    await ref.set({ name, role, group, addedAt: firebase.firestore.FieldValue.serverTimestamp(), walkin: true });
    await db.collection(COLLECTIONS.attendance).doc(ref.id).set({
      arrived: firebase.firestore.FieldValue.serverTimestamp(),
      checkedInBy: currentUser?.uid || "manual"
    });
    allPeople.push({ id: ref.id, name, role, group });
    attendance[ref.id] = { arrived: new Date() };'''
new = '''    const ref = db.collection(COLLECTIONS.people).doc();
    await ref.set({ name, role, group, addedAt: firebase.firestore.FieldValue.serverTimestamp(), walkin: true });
    await db.collection(COLLECTIONS.attendance).doc(ref.id).set({
      arrived: firebase.firestore.FieldValue.serverTimestamp(),
      checkedInBy: currentUser?.uid || "manual"
    });
    await db.collection(COLLECTIONS.iwAssignments).doc(`${CURRENT_IW_YEAR}_${ref.id}`).set({
      year: CURRENT_IW_YEAR,
      uid: ref.id,
      email: null,
      function: role,
      assignedAt: firebase.firestore.FieldValue.serverTimestamp(),
      assignedBy: (currentUser && currentUser.email) || null
    }, { merge: true }).catch(() => {});
    allPeople.push({ id: ref.id, name, role, group });
    iwAssignments[ref.id] = role;
    attendance[ref.id] = { arrived: new Date() };'''
assert content.count(old) == 1, "walk-in block not found"
content = content.replace(old, new)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("patched OK")
