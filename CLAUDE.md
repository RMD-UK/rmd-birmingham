# Working on this project with Jon

Jon isn't a developer. Explain things simply, skip the jargon, and don't assume
he knows what a step does — say it plainly.

## Terminal commands — always full paths

Jon runs terminal commands from his home directory (`~`), not from inside this
project. A command like `cd functions` will fail — there's no `functions`
folder in his home directory.

**Always give the complete path, starting from `/Users/jonhulme/...`, in one
line he can paste.** Never say "cd into the functions folder" or similar —
give the actual command.

This project's real path on Jon's Mac:

```
/Users/jonhulme/Library/Mobile Documents/com~apple~CloudDocs/GitHub/RMD website/website
```

Example — right way to ask him to deploy functions:

```
cd "/Users/jonhulme/Library/Mobile Documents/com~apple~CloudDocs/GitHub/RMD website/website/functions"
firebase deploy --only functions
```

Wrong way (this caused a failed command on 2026-09-18):

```
cd functions
firebase deploy --only functions
```

## Deploying — two separate steps, easy to miss one

This project has two different things that need deploying, and doing one does
**not** do the other. A change can look "pushed" and still not be live if the
wrong one was skipped.

**1. Website pages (any `.html`, `.css`, `.js` file outside `functions/`)**

These go live when Jon commits and pushes to git (or via GitHub Desktop).
Normal git push. No extra command needed.

**2. Cloud Functions (anything in `functions/index.js`)**

Pushing to git does **not** deploy these. They need a separate manual step,
run from Jon's own machine, in the `functions` folder:

```
cd "/Users/jonhulme/Library/Mobile Documents/com~apple~CloudDocs/GitHub/RMD website/website/functions"
firebase deploy --only functions
```

**Whenever a change touches `functions/index.js`, always tell Jon explicitly
that this second step is needed, separately from the git push, and give him
the exact command above.** Don't just say "push it" and assume the function
went live too — it didn't.

## Checklist before saying "that's live now"

- [ ] Did this change touch a `.html`/`.css`/`.js` file? → needs a git push.
- [ ] Did this change touch `functions/index.js`? → needs the
      `firebase deploy --only functions` command above, run separately.
- [ ] If both, say both, clearly, as two separate steps — don't bundle them
      into one vague "push this" instruction.
