import type { DocsEntry } from '../types'

/**
 * Global "Using RAGtime in Claude" entry: the step-by-step connection guide
 * the team hands to Lawfare staff, as a page. The same guide is served as a
 * PDF at `public/guides/connect-claude.pdf`, which this page links to; when
 * one changes, change the other.
 *
 * The PDF is printed from `app/guides/connect-claude.html` by
 * `scripts/build-guide.mjs`. Until 2026-10-01 it was a supplied file with no
 * source here, and it had fallen behind this page.
 *
 * Three paths. A and B are for a Lawfare account, where Lawfare's Claude
 * administrator has added the connector for the whole organisation, so a
 * member only switches it on and gets the AI tools with it. C is for a
 * personal account, which adds the connector by its address and gets the
 * free tools only: nobody is handed a credential on any path.
 *
 * The menu names are Claude's, not ours, and they move. They were checked
 * against Claude's documentation on 2026-10-01 ("Customize > Connectors",
 * and the "+" button for a chat's connectors), not against every account's
 * screen, which is why the page ends by asking for a report.
 *
 * The daily allowance is described and not counted. The PDF states the
 * number; a docs page may not state a bare count (`figures.test.ts`), and
 * this one has no live source to read it from.
 */
export const connectingClaudeEntry: DocsEntry = {
  slug: 'connecting-claude',
  title: 'Using RAGtime in Claude',
  summary: 'Turn RAGtime on inside Claude, step by step.',
  scope: { kind: 'global' },
  order: 6,
  content: `
"Connecting" means giving Claude permission to search RAGtime for you, so you
can ask Claude a question and get an answer that cites real documents.

This guide is also available as a [printable PDF](/guides/connect-claude.pdf).

## Which way should you connect?

Most people at Lawfare should use **Path A**, the Claude website or app. It
takes about two minutes and needs no password.

- You sign in to Claude with your **Lawfare** account, in a web browser or
  the Claude app: **Path A**.
- You use **Claude Code**, the version of Claude you type into in a text
  window on your computer: **Path B**. It takes about ten minutes, once.
- You sign in to Claude with a **personal** account, not a Lawfare one:
  **Path C**. It takes about three minutes.

Not sure? Start with Path A. If RAGtime is not in your list at step 3, use
Path C.

## Path A: the Claude website or app

Lawfare's Claude administrator has already added RAGtime for everyone at
Lawfare. All you do is switch it on. You never type a password.

1. Go to **claude.ai** and sign in with your Lawfare account.
2. In the sidebar on the left, click **Customize**, then **Connectors**. Or
   go straight to **claude.ai/customize/connectors**.
3. Find **RAGtime** in the list. It has a **Custom** label. If it says
   **Connect**, click it. If it already says **Connected**, go to step 4.
4. Start a **new chat**.
5. Click the **+** button at the lower left of the message box, choose
   **Connectors**, and make sure **RAGtime** is switched on.
6. Ask a test question. See *Check that it worked* below.

The Claude desktop and phone apps use the same account. Once RAGtime is on
at claude.ai, it is on in the apps too.

Don't see RAGtime under Connectors? Your account may not be in Lawfare's
Claude organization yet. Ask the RAGtime team, who will check with the
Claude administrator. Until then, Path C works with any account.

## Path B: Claude Code

Claude Code is a version of Claude you type into in a text window on your
computer. You do not need to be a programmer to use it. RAGtime comes into
Claude Code **automatically** from your Claude account, so there is nothing
to copy, download or configure, and no password.

One step uses **Terminal** (Mac) or **PowerShell** (Windows), the built-in
text-command apps. When a step says "paste this," copy the grey text
exactly, paste it, and press **Return** (Mac) or **Enter** (Windows).

- **Open Terminal on a Mac:** press **Command (⌘) + Space**, type
  **Terminal**, and press **Return**.
- **Open PowerShell on Windows:** click **Start**, type **PowerShell**, and
  press **Enter**.

### One-time setup

1. **Turn RAGtime on in your Claude account first.** Follow Path A, steps 1
   to 3. On a personal account, follow Path C, steps 1 to 6. Claude Code
   uses the same account, so this is what makes RAGtime show up there.
2. **Install Claude Code.** Paste the line for your computer.

   Mac: \`curl -fsSL https://claude.ai/install.sh | bash\`

   Windows: \`irm https://claude.ai/install.ps1 | iex\`

   When it finishes, close the window and open it again.
3. **Start Claude Code.** Paste \`claude\` and press Return or Enter.
4. **Sign in.** Claude Code asks how you want to sign in. Choose the option
   to sign in with your **Claude account** (not an API key). A browser
   window opens: sign in with the same account you used in step 1 and
   approve. Then go back to the Terminal or PowerShell window.
5. **Check RAGtime is there.** Type \`/mcp\` and press Return or Enter. You
   should see **claude.ai RAGtime** marked as connected. Press **Esc** to
   close the list.

### Every time you want to use RAGtime

1. Open Terminal (Mac) or PowerShell (Windows).
2. Paste \`claude\` and press Return or Enter.
3. Ask your question. RAGtime is already connected.

To leave Claude Code, type \`/exit\`.

## Path C: a personal Claude account

If your Claude account is your own, and not part of Lawfare's Claude
organization, you add RAGtime yourself. It needs no password. You get the
**free** tools: search, filters and reading documents. The AI tools are not
available on a personal account yet.

1. Go to **claude.ai** and sign in.
2. In the sidebar on the left, click **Customize**, then **Connectors**. Or
   go straight to **claude.ai/customize/connectors**.
3. Click **+**, then **Add custom connector**.
4. Type **RAGtime** as the name. For the address (URL), paste this exactly:
   \`https://ragtime-mcp.benjamin-wittes.workers.dev/mcp\`
5. If Claude asks how people sign in, choose **No sign-in**. Leave every
   other setting as it is.
6. Click **Add**.
7. Start a **new chat**. Click the **+** button at the lower left of the
   message box, choose **Connectors**, and make sure **RAGtime** is switched
   on.
8. Ask the first test question under *Check that it worked* below.

Claude may warn you that a custom connector is not verified. That is
expected: RAGtime is not in Claude's public directory yet. A free Claude
account can hold one custom connector. If you want Claude Code as well, do
steps 1 to 6 here, then Path B from step 2.

## Check that it worked

Ask Claude this:

> Using RAGtime, how many OLC opinions are in the corpus, and what's the date range?

It worked if Claude says it is using a RAGtime tool (you may see a small
note such as "get_facets") and answers with a number of opinions and a range
of dates. If Claude answers from general knowledge without mentioning
RAGtime, see *Troubleshooting* below.

That question only needs a free tool. On Path A or B, check the AI level
too:

> Using RAGtime, summarize one OLC opinion about emergency powers.

It worked if Claude uses a tool such as "summarize_document" and answers
from the opinion. If Claude says a password or a key is needed, the
connector is on but its AI access is not: tell the RAGtime team. On Path C
that message is expected.

## Two levels of tools

- **Free.** Finds and opens documents: keyword search, filters, fetching a
  document, reading court filings. Everyone who is connected gets these, on
  any path.
- **AI.** Has RAGtime do the research and write answers: asking a whole
  collection a question, summarizing a document, finding similar documents.
  Lawfare accounts get these, on Path A or B. Personal accounts do not yet.

AI requests come from Lawfare's shared daily allowance, which resets each
day. Paths A and B both draw on it.

## Troubleshooting

- **Claude answers without mentioning RAGtime.** RAGtime is not switched on.
  Path A or C: click the **+** button by the message box, choose
  **Connectors**, and switch RAGtime on. Path B: type \`/mcp\` and check that
  **claude.ai RAGtime** is connected.
- **RAGtime is not listed under Customize → Connectors.** Your account is
  not in Lawfare's Claude organization yet. Ask the RAGtime team. Until
  then, use Path C.
- **\`/mcp\` in Claude Code does not list claude.ai RAGtime.** Claude Code is
  signed in to a different account, or RAGtime is not on in your Claude
  account. Do Path A, steps 1 to 3 (or Path C, steps 1 to 6). Then in
  Claude Code type \`/logout\`, then \`/login\`, and sign in with that same
  account.
- **AI tools stop working, but search still works.** Lawfare's daily AI
  allowance is used up. Try again tomorrow, or tell the RAGtime team.
- **Claude says a RAGtime tool needs a password or a key.** On a personal
  account, the AI tools are not available yet: nothing is broken, and search
  still works. On a Lawfare account, the connector's AI access is off: tell
  the RAGtime team.
- **"Rate limit exceeded".** Too many RAGtime requests arrived in the same
  minute, which happens when many people try it at once. Wait a minute and
  ask again.
- **Claude cannot add or reach the connector (Path C).** The address does
  not match. Remove the connector and add it again. Paste the address
  exactly; it ends in \`/mcp\`.
- **"command not found: claude" (Mac) or "claude is not recognized"
  (Windows).** Claude Code is not installed, or the window needs reopening.
  Close and reopen Terminal or PowerShell. If that does not help, redo
  Path B step 2.
- **A newly added RAGtime collection does not appear.** Claude loaded
  RAGtime's old list when the chat started. Start a **new** chat (Path A or
  C), or quit Claude Code with \`/exit\` and start it again (Path B).

Claude's menus change. Something here did not match what you saw? Use the
**Feedback** button at the top of the page and say which step.
`.trim(),
}
