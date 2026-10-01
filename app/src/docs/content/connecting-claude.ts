import type { DocsEntry } from '../types'

/**
 * Global "Using RAGtime in Claude" entry: the step-by-step connection guide
 * the team hands to Lawfare staff, as a page. The same guide is served as a
 * PDF at `public/guides/connect-claude.pdf`, which this page links to; when
 * one changes, change the other.
 *
 * The page is ahead of the PDF in two places (2026-09-30): the second test
 * question, which checks the AI level, and the rate-limit line under
 * Troubleshooting. The PDF is a supplied file with no generator in this
 * repository, so it gains them at its next export.
 *
 * It is written for a Lawfare account on purpose. That is the one path that
 * needs no password: Lawfare's Claude administrator has added the connector
 * for the whole organisation, so a member only switches it on. Anyone else
 * is pointed at whoever gave them access rather than at a credential.
 *
 * The daily allowance is described and not counted. The PDF states the
 * number; a docs page may not state a bare count (`figures.test.ts`), and
 * this one has no live source to read it from.
 */
export const connectingClaudeEntry: DocsEntry = {
  slug: 'connecting-claude',
  title: 'Using RAGtime in Claude',
  summary: 'Turn RAGtime on inside Claude, step by step. For Lawfare staff.',
  scope: { kind: 'global' },
  order: 6,
  content: `
"Connecting" means giving Claude permission to search RAGtime for you, so you
can ask Claude a question and get an answer that cites real documents.

This guide is for people who sign in to Claude with a **Lawfare** account.
It is also available as a [printable PDF](/guides/connect-claude.pdf). If you
are not at Lawfare, ask whoever gave you access to RAGtime.

## Which way should you connect?

Most people should use **Path A**, the Claude website or app. It takes about
two minutes and needs no password.

- You use Claude in a web browser or the Claude app: **Path A**.
- You use **Claude Code**, the version of Claude you type into in a text
  window on your computer: **Path B**. It takes about ten minutes, once.

Not sure? Use Path A.

## Path A: the Claude website or app

Lawfare's Claude administrator has already added RAGtime for everyone at
Lawfare. All you do is switch it on. You never type a password.

1. Go to **claude.ai** and sign in with your Lawfare account.
2. Click your **name or initials** in the bottom-left corner, then click
   **Settings**.
3. Click **Connectors**.
4. Find **RAGtime** in the list. If it says **Connect**, click it and follow
   the prompts. If it already says **Connected**, go to step 5.
5. Start a **new chat**.
6. Below the message box, click the **tools button** (it looks like a slider
   or a plus sign) and make sure **RAGtime** is switched on.
7. Ask a test question. See *Check that it worked* below.

The Claude desktop and phone apps use the same account. Once RAGtime is on
at claude.ai, it is on in the apps too.

Don't see RAGtime under Connectors? Your account may not be in Lawfare's
Claude organization yet. Ask the RAGtime team, who will check with the
Claude administrator.

## Path B: Claude Code

Claude Code is a version of Claude you type into in a text window on your
computer. You do not need to be a programmer to use it. RAGtime comes into
Claude Code **automatically** from your Lawfare Claude account, so there is
nothing to copy, download or configure, and no password.

One step uses **Terminal** (Mac) or **PowerShell** (Windows), the built-in
text-command apps. When a step says "paste this," copy the grey text
exactly, paste it, and press **Return** (Mac) or **Enter** (Windows).

- **Open Terminal on a Mac:** press **Command (⌘) + Space**, type
  **Terminal**, and press **Return**.
- **Open PowerShell on Windows:** click **Start**, type **PowerShell**, and
  press **Enter**.

### One-time setup

1. **Turn RAGtime on in your Claude account first.** Follow Path A, steps 1
   to 4. Claude Code uses the same account, so this is what makes RAGtime
   show up there.
2. **Install Claude Code.** Paste the line for your computer.

   Mac: \`curl -fsSL https://claude.ai/install.sh | bash\`

   Windows: \`irm https://claude.ai/install.ps1 | iex\`

   When it finishes, close the window and open it again.
3. **Start Claude Code.** Paste \`claude\` and press Return or Enter.
4. **Sign in.** Claude Code asks how you want to sign in. Choose the option
   to sign in with your **Claude account** (not an API key). A browser
   window opens: sign in with your **Lawfare** email and approve. Then go
   back to the Terminal or PowerShell window.
5. **Check RAGtime is there.** Type \`/mcp\` and press Return or Enter. You
   should see **claude.ai RAGtime** marked as connected. Press **Esc** to
   close the list.

### Every time you want to use RAGtime

1. Open Terminal (Mac) or PowerShell (Windows).
2. Paste \`claude\` and press Return or Enter.
3. Ask your question. RAGtime is already connected.

To leave Claude Code, type \`/exit\`.

## Check that it worked

Ask Claude this:

> Using RAGtime, how many OLC opinions are in the corpus, and what's the date range?

It worked if Claude says it is using a RAGtime tool (you may see a small
note such as "get_facets") and answers with a number of opinions and a range
of dates. If Claude answers from general knowledge without mentioning
RAGtime, see *Troubleshooting* below.

That question only needs a free tool. To check the AI level too, ask:

> Using RAGtime, summarize one OLC opinion about emergency powers.

It worked if Claude uses a tool such as "summarize_document" and answers
from the opinion. If Claude says a password or a key is needed, the
connector is on but its AI access is not: tell the RAGtime team.

## Two levels of tools

- **Free.** Finds and opens documents: keyword search, filters, fetching a
  document, reading court filings. Everyone who is connected gets these.
- **AI.** Has RAGtime do the research and write answers: asking a whole
  collection a question, summarizing a document, finding similar documents.
  Everyone who is connected gets these too, on either path.

AI requests come from Lawfare's shared daily allowance, which resets each
day. Both paths draw on it.

## Troubleshooting

- **Claude answers without mentioning RAGtime.** RAGtime is not switched on.
  Path A: click the tools button under the message box and switch RAGtime
  on. Path B: type \`/mcp\` and check that **claude.ai RAGtime** is
  connected.
- **RAGtime is not listed under Settings → Connectors.** Your account is not
  in Lawfare's Claude organization yet. Ask the RAGtime team.
- **\`/mcp\` in Claude Code does not list claude.ai RAGtime.** Claude Code is
  signed in to a different account, or RAGtime is not on in your Claude
  account. Do Path A, steps 1 to 4. Then in Claude Code type \`/logout\`,
  then \`/login\`, and sign in with your Lawfare email.
- **AI tools stop working, but search still works.** Lawfare's daily AI
  allowance is used up. Try again tomorrow, or tell the RAGtime team.
- **"Rate limit exceeded".** Too many RAGtime requests arrived in the same
  minute, which happens when many people try it at once. Wait a minute and
  ask again.
- **"command not found: claude" (Mac) or "claude is not recognized"
  (Windows).** Claude Code is not installed, or the window needs reopening.
  Close and reopen Terminal or PowerShell. If that does not help, redo
  Path B step 2.
- **A newly added RAGtime collection does not appear.** Claude loaded
  RAGtime's old list when the chat started. Start a **new** chat (Path A),
  or quit Claude Code with \`/exit\` and start it again (Path B).

Something here did not match what you saw? Use the **Feedback** button at
the top of the page and say which step.
`.trim(),
}
