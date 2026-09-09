path = "admin-groups.html"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. State: add iwAssignments map next to peopleByName
old = 'let peopleByName = {};'
new = 'let peopleByName = {};\nlet iwAssignments = {};  // { uid: function }  -- this year\'s IW job, from iw_assignments; falls back to people.role when absent'
assert content.count(old) == 1, "peopleByName decl not found"
content = content.replace(old, new)

# 2. loadFromFirestore(): bulk-load iw_assignments, use effective role for categorisation
old = '''  // Load people to populate name lists and build peopleByName index
  try {
    const pSnap = await db.collection(COLLECTIONS.people).get();
    const facultyNames    = [];
    const candidateNames  = [];
    pSnap.forEach(doc => {
      const d = doc.data();
      const name = d.name || d.displayName || d.email || doc.id;
      peopleByName[name] = { id: doc.id, email: d.email || "", role: d.role || "", ...d };
      if (d.role === "faculty" || d.role === "director") {
        facultyNames.push(name);
      } else if (d.role === "instructor" || d.role === "itc") {
        candidateNames.push(name);
      }
    });'''
new = '''  // Layered access, step 4 (read side): this year's IW job now lives in
  // iw_assignments, kept separate from permanent standing on the person doc.
  // One bulk read for everyone rather than one per person. If it fails or
  // a person has no assignment doc yet, we fall back to people.role exactly
  // as before -- nothing here can break room/group assignment.
  try {
    const aSnap = await db.collection(COLLECTIONS.iwAssignments)
      .where("year", "==", CURRENT_IW_YEAR).get();
    aSnap.forEach(doc => {
      const a = doc.data();
      if (a.uid && a.function) iwAssignments[a.uid] = a.function;
    });
  } catch (err) {
    console.warn("Could not load iw_assignments from Firestore:", err);
  }

  // Load people to populate name lists and build peopleByName index
  try {
    const pSnap = await db.collection(COLLECTIONS.people).get();
    const facultyNames    = [];
    const candidateNames  = [];
    pSnap.forEach(doc => {
      const d = doc.data();
      const name = d.name || d.displayName || d.email || doc.id;
      const role = iwAssignments[doc.id] || d.role || "";
      peopleByName[name] = { id: doc.id, email: d.email || "", role, ...d };
      if (role === "faculty" || role === "director") {
        facultyNames.push(name);
      } else if (role === "instructor" || role === "itc") {
        candidateNames.push(name);
      }
    });'''
assert content.count(old) == 1, "loadFromFirestore block not found"
content = content.replace(old, new)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("patched OK")
