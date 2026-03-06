# Figma MCP — Design Capture Setup

This document explains how to set up the Figma MCP integration from scratch and how to re-run the capture whenever you update the UI.

---

## Two MCP Servers — Which One Do You Need?

| | `figma` (remote) | `figma-dev-mode-mcp-server` (desktop) |
|---|---|---|
| **Direction** | **Dev → Design** | **Design → Dev** |
| **Use case** | Capture your running app and push it into Figma | Read a Figma design and have Claude generate code from it |
| **Requires** | Figma web + API | Figma desktop app open |
| **How you reference a design** | Paste a Figma URL / node ID | Select a layer in the desktop app |
| **Web-to-Figma capture** | Yes | No |
| **Figma plan** | Any plan (Free, Pro, Org) | Paid plan with Dev or Full seat |

You can use one or both depending on your workflow. The rest of this document covers setup for each.

---

## Part 1 — First-Time Setup

### Step 1: Figma Account Requirements

| Feature | Requirement |
|---|---|
| Remote MCP server (used here) | Any Figma plan — Free, Professional, or Org |
| Desktop MCP server (Dev Mode) | Paid plan with a Dev or Full seat |

The setup below uses the **remote MCP server**, so no paid plan, Dev Mode, or Figma desktop app is required.

You do need **edit access** to the target Figma file (`PulseIQ`).

---

### Step 2: Add the Figma MCP Server to Claude Code

Run this once in your terminal to register the Figma MCP server globally (available across all your projects):

```bash
claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
```

To add it only to this project instead:

```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

> **Which scope to choose?** Use `--scope user` if you want to use the Figma MCP in any project without repeating this step. Omit it to keep it scoped to this project only.

---

### Step 3: Authenticate with Figma inside Claude Code

1. Open Claude Code in your terminal (inside this project directory)
2. Run the slash command:
   ```
   /mcp
   ```
3. Select **figma** from the list of servers
4. Click **Authenticate** — your browser will open a Figma OAuth page
5. Approve the access request in your browser
6. Return to Claude Code — you should see **"Authentication successful"**

No API token or manual configuration is needed. Claude Code handles OAuth automatically.

---

### Step 4: Verify the Connection

Inside Claude Code, ask:

```
List the available Figma MCP tools
```

You should see tools like `generate_figma_design`, `get_design_context`, `get_screenshot`, etc. If the list appears, the MCP server is connected and ready.

---

### Step 5: Add the Capture Script to the App

The Figma capture script is already present in this project (`src/app/layout.tsx`), added during the initial setup:

```tsx
<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
```

If you ever remove it, add it back inside the `<body>` tag in `src/app/layout.tsx`. This script is **silent on normal page loads** — it only activates when the URL contains a special capture hash (see Part 2).

---

## Part 2 — How Capture Works

### Does the Figma bar open automatically?

**No.** On a regular visit to `http://localhost:3000` nothing Figma-related happens. The capture toolbar only activates when the page URL contains a special `#figmacapture=...` hash, like:

```
http://localhost:3000#figmacapture=<id>&figmaendpoint=...&figmadelay=3000
```

This URL is generated fresh each time by the Figma MCP tool. Each capture ID is **single-use**.

---

## Part 3 — Re-Capturing the Design

Run this whenever you update the UI and want to sync the changes to Figma.

### 1. Start the dev server

```bash
nvm use 20
npm run dev
```

Verify it is running at `http://localhost:3000`.

### 2. Ask Claude Code to capture

**Note for Cursor users:** The Figma MCP in Cursor does not expose `generate_figma_design` (that tool is **Claude Code only**, remote Figma MCP). To push the landing page into Figma you must run the capture from **Claude Code** using the prompt below. In Cursor you can still take a screenshot (e.g. `pulseiq-landing-page-capture.png` in this repo) and drag it into the PulseIQ file manually if needed.

Open **Claude Code** in this project directory and say:

```
Use the Figma MCP to capture the landing page and add it to the PulseIQ Figma file:
https://www.figma.com/design/RYjLiZAZNFsBG678ZjVXwT/PulseIQ
```

Claude will:
1. Call `generate_figma_design` with `outputMode: existingFile` and file key `RYjLiZAZNFsBG678ZjVXwT`
2. Get back a fresh capture ID
3. Open your browser at `http://localhost:3000#figmacapture=<new-id>&...`
4. Wait for the capture to complete
5. Confirm the design has been added to the Figma file

### 3. View the result

Open the Figma file:
[https://www.figma.com/design/RYjLiZAZNFsBG678ZjVXwT/PulseIQ](https://www.figma.com/design/RYjLiZAZNFsBG678ZjVXwT/PulseIQ)

---

## Part 4 — Using the In-Browser Capture Toolbar

After a successful capture, the Figma toolbar remains visible in the browser tab. You can use it to:

- **Re-capture the same page** after making UI changes — the toolbar auto-generates a new capture ID
- **Navigate to a different route** and capture additional pages into the same Figma file

You don't need to go back to Claude Code for re-captures as long as the toolbar is still open.

---

## Part 5 — Setup: `figma-dev-mode-mcp-server` (Design → Dev)

Use this server when you want to select a frame in the Figma desktop app and have Claude generate code from it.

### Requirements

- Figma **desktop app** (not the browser version) — latest version
- Paid Figma plan with a **Dev or Full seat**

### Step 1: Enable the local server in the Figma desktop app

1. Open the Figma desktop app
2. Open any Design file
3. Press **Shift+D** to enter Dev Mode
4. In the inspect panel, find the **MCP server** section and click **Enable desktop MCP server**

The server starts automatically and listens at `http://127.0.0.1:3845/mcp`.

### Step 2: Add it to Claude Code

```bash
claude mcp add --transport http figma-dev-mode-mcp-server http://127.0.0.1:3845/mcp
```

Add `--scope user` to make it available across all projects:

```bash
claude mcp add --scope user --transport http figma-dev-mode-mcp-server http://127.0.0.1:3845/mcp
```

### Step 3: Verify the connection

1. Select any frame or layer in the Figma desktop app
2. In Claude Code, ask: *"Generate code for my current Figma selection"*
3. Claude should read the selection and return code

### Usage

- **Selection-based**: Select a frame in Figma, then ask Claude to implement it — no URLs or node IDs needed
- **Link-based**: Paste a Figma frame URL and Claude extracts the node automatically

> The Figma desktop app must be open and Dev Mode must be active for this server to respond.

---

## Part 6 — Design System Limitations

### What the Figma MCP can and cannot write

The remote Figma MCP has **very limited write access**. It can only:

| Operation | Supported |
|---|---|
| Capture a web page and push frames to Figma | Yes — `generate_figma_design` |
| Link code components to Figma components | Yes — `send_code_connect_mappings` |
| Create color styles | No |
| Create text styles | No |
| Create variables / design tokens | No |
| Create components or component sets | No |

Everything else — `get_design_context`, `get_screenshot`, `get_variable_defs`, etc. — is **read-only**.

So while Claude can read a design and generate code from it, it **cannot build a design system inside Figma** (variables, color styles, text styles, components) through the MCP. That capability is not exposed by the remote server.

---

### Options for setting up a design system in Figma

| Approach | Effort | Notes |
|---|---|---|
| **Manual in Figma** | Medium | Use `DESIGN_SYSTEM.md` as a reference and create styles/variables by hand in Figma |
| **Tokens Studio plugin** | Low | Import a `tokens.json` file and Tokens Studio creates all variables and styles automatically |
| **Figma REST API script** | High | Write a script using a Figma personal access token to POST variables via the Variables API |

#### Recommended: Tokens Studio

[Tokens Studio](https://tokens.studio) is a free Figma plugin that reads a W3C-format design token JSON file and creates all color styles, text styles, and variables in your Figma file in one click.

**Steps:**
1. Install the **Tokens Studio** plugin from the Figma Community
2. Ask Claude to generate a `tokens.json` file from `DESIGN_SYSTEM.md`
3. Open the plugin in your Figma file, paste or import the JSON
4. Click **Apply** — all tokens are created as Figma variables and styles

---

## Figma File Details

| Field | Value |
|---|---|
| File name | PulseIQ |
| File key | `RYjLiZAZNFsBG678ZjVXwT` |
| URL | https://www.figma.com/design/RYjLiZAZNFsBG678ZjVXwT/PulseIQ |

---

## Troubleshooting

**`claude mcp add` command not found**
- Make sure Claude Code CLI is installed: `npm install -g @anthropic-ai/claude-code`

**Authentication fails or times out**
- Re-run `/mcp` inside Claude Code and retry the Authenticate step
- Make sure you are logged into Figma in your browser before authenticating

**Dev server fails to start**
- Run `node -v` — must be `>= 18.18.0`. Switch with `nvm use 20`.

**Capture toolbar never appears**
- Make sure the page fully loaded. Increase the delay: change `figmadelay=3000` to `figmadelay=5000` in the capture URL.
- Confirm the `capture.js` script tag is present in `src/app/layout.tsx`.

**"You need to select a layer first" error**
- This error comes from `get_design_context`, not `generate_figma_design`. Make sure you're asking Claude to *capture* the page, not read an existing Figma design.

**Captured design shows loading state / no message**
- The app needs a valid key to generate messages. Ensure `ANTHROPIC_API_KEY` is set in `.env.local` so the page renders real content before capture.
