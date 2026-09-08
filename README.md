# Developer Personal Assistant Agent

An extensible, security-first fullstack AI assistant designed for developers. Built with Next.js 14, LangGraph, Model Context Protocol (MCP), and BullMQ, the assistant bridges local developer workflows with cloud intelligence. It provides real-time streaming, human-in-the-loop permission guardrails, multi-turn state persistence, cross-session vector memory, background async jobs, and integrations with developer tools.

---

## Architecture

```
+-----------------------------------------------------------------------+
|                         Next.js 14 Frontend                           |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |                          assistant-ui                           |  |
|  |  - Streaming Thread & Markdown Syntax Highlighting              |  |
|  |  - Interactive HITL Confirmation Dialogs (Approve / Reject)     |  |
|  |  - Multi-Provider Model Selector (Ollama / Groq / Cloud)        |  |
|  |  - Thread Sessions, Background Jobs Drawer, Permission Manager  |  |
|  +--------------------------------+--------------------------------+  |
+-----------------------------------|-----------------------------------+
                                    | HTTP / SSE
                                    v
+-----------------------------------------------------------------------+
|                       Express Backend Runtime                         |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |                     LangGraph Agent Engine                      |  |
|  |  - StateGraph with MessagesAnnotation                           |  |
|  |  - Reasoning Node & Tool Execution Node                         |  |
|  |  - Interrupt / Human-in-the-Loop Confirmation Gate              |  |
|  |  - State Checkpointing (PostgreSQL PostgresSaver / MemorySaver) |  |
|  |  - Short-Term Memory (Context Trimming & Summarization)         |  |
|  +--------------------------------+--------------------------------+  |
|                                   |                                   |
|  +--------------------------------+--------------------------------+  |
|  |                     Permission & Risk Gate                      |  |
|  |  - Tool Registry (READ / WRITE / DESTRUCTIVE)                   |  |
|  |  - Critical Command Blocker (rm -rf, fork bombs, disk format)   |  |
|  |  - Confirmation Persistence & Audit Log                         |  |
|  +--------------------------------+--------------------------------+  |
|                                   |                                   |
|  +--------------------------------+--------------------------------+  |
|  |               Memory & Background Worker Engines                |  |
|  |  - Long-Term Vector Memory (pgvector / Xenova Transformers)     |  |
|  |  - Asynchronous Task Queue (Redis 8 + BullMQ Worker)           |  |
|  +--------------------------------+--------------------------------+  |
+-----------------------------------|-----------------------------------+
                                    |
          +-------------------------+-------------------------+
          |                         |                         |
          v                         v                         v
+-------------------+     +-------------------+     +-------------------+
|    MCP Clients    |     | Native Integrations|    |   Model Factory   |
| - Filesystem MCP  |     | - Terminal Tool   |     | - Ollama (Local)  |
| - GitHub MCP      |     | - Google Workspace|     | - Groq / NVIDIA   |
|   (Issues & PRs)  |     |   (Gmail, Calendar)|    | - OpenAI / Claude |
+-------------------+     +-------------------+     +-------------------+
```

---

## Key Features

### 1. Multi-Provider Model Engine
- **Local Inference**: Seamless connection to Ollama (`llama3.2`, `qwen2.5-coder`, `deepseek-r1`) and OpenAI-compatible local servers (LM Studio, vLLM).
- **Fast Cloud Inference**: Direct integration with Groq (`openai/gpt-oss-120b`, `llama-3.3-70b-versatile`) and NVIDIA NIM (`nemotron-3-super-120b-a12b`).
- **Commercial Cloud Models**: Anthropic Claude, Google Gemini, and OpenAI GPT.
- **Dynamic Model Switching**: Select and swap models directly from the chat interface per session without restarting the server.

### 2. Human-in-the-Loop (HITL) Security Model
- **Three-Tier Risk Classification**:
  - `READ`: Safe read-only operations (e.g., file listing, search, git status) execute immediately.
  - `WRITE`: Mutating actions (e.g., writing files, sending emails, scheduling meetings) pause graph execution and require explicit user approval.
  - `DESTRUCTIVE`: Potentially dangerous actions (e.g., deleting files, deleting calendar events, dropping database tables) require mandatory explicit confirmation.
- **Strict Command Guardrails**: Native blocking of catastrophic shell commands (such as recursive deletion, disk formatting, and fork bombs).
- **Interactive Approval Flow**: LangGraph `interrupt()` triggers approval cards in the UI, allowing the user to inspect parameters, review risk level, and choose to Approve or Reject before any side effects occur.

### 3. Model Context Protocol (MCP) Support
- **Filesystem MCP**: Integrates `@modelcontextprotocol/server-filesystem` to provide scoped directory browsing, file reading, file editing, and file creation within designated workspace boundaries.
- **GitHub MCP**: Integrates `@modelcontextprotocol/server-github` for searching repositories, inspecting pull requests, managing issues, and reviewing commit histories.

### 4. Developer Tools Suite
- **Safe Terminal**: Executes development commands (builds, tests, git queries, linting) in non-interactive mode within the workspace context, strictly filtered against hazardous operations.
- **GitHub Integration**: Direct GitHub OAuth support and tools for inspecting authenticated repositories, branches, and code changes.
- **Google Workspace**: Full OAuth flow with Google APIs for Gmail (listing, reading, and sending emails) and Google Calendar (fetching upcoming events, creating meetings, and deleting events).
- **Calculator & System Time**: Precision arithmetic evaluation and timezone-aware system clock tools.

### 5. Memory Subsystem
- **State Checkpointing**: Stateful conversation history preserved in PostgreSQL via LangGraph PostgresSaver (with in-memory MemorySaver fallback).
- **Short-Term Context Management**: Automatic message trimming and progressive conversation summarization to optimize LLM context windows.
- **Long-Term Semantic Memory**: Vector storage powered by `@xenova/transformers` embeddings and PostgreSQL pgvector. Allows the assistant to silently save and semantically recall user preferences, coding conventions, and project facts across sessions.

### 6. Asynchronous Background Jobs
- **Redis 8 + BullMQ**: Offloads heavy tasks (such as whole-repository code indexing and security scans) to background worker queues.
- **Non-Blocking Execution**: Returns a Job ID immediately to the user while processing asynchronously in the background.
- **Real-Time Job Monitoring**: Dedicated Jobs Drawer in the frontend displays queue status, progress indicators, and completion logs.

---

## Tool Ecosystem

| Tool Name | Source | Risk Level | Requires Approval | Description |
| :--- | :--- | :--- | :--- | :--- |
| `read_text_file` | Filesystem MCP | READ | No | Read file contents from scoped workspace directory |
| `list_directory` | Filesystem MCP | READ | No | List directory tree and entries |
| `search_files` | Filesystem MCP | READ | No | Search for file names matching pattern |
| `write_file` | Filesystem MCP | WRITE | Yes | Create or overwrite file on disk |
| `edit_file` | Filesystem MCP | WRITE | Yes | Apply diffs or patch existing files |
| `run_terminal_command` | Native Terminal | Dynamic | Yes (if WRITE / DESTRUCTIVE) | Execute shell commands in workspace root |
| `list_my_github_repositories`| Native GitHub | READ | No | List personal and collaborated repositories |
| `list_emails` | Google Workspace | READ | No | Query Gmail inbox with search filters |
| `read_email` | Google Workspace | READ | No | Fetch complete headers and body of an email |
| `send_email` | Google Workspace | WRITE | Yes | Dispatch emails via Gmail API |
| `list_calendar_events` | Google Workspace | READ | No | Fetch upcoming Google Calendar events |
| `create_calendar_event` | Google Workspace | WRITE | Yes | Schedule an event on Google Calendar |
| `delete_calendar_event` | Google Workspace | DESTRUCTIVE | Yes | Remove an event from Google Calendar |
| `save_memory` | Native Memory | READ | No | Store durable fact or preference to vector memory |
| `recall_memories` | Native Memory | READ | No | Semantic vector search across stored memories |
| `forget_memory` | Native Memory | DESTRUCTIVE | Yes | Delete a specific memory item by UUID |
| `start_background_repo_analysis` | BullMQ Jobs | READ | No | Enqueue asynchronous code analysis job |
| `check_background_job_status` | BullMQ Jobs | READ | No | Query status and output of a background task |
| `calculator` | Native Basic | READ | No | Safely evaluate mathematical expressions |
| `get_time` | Native Basic | READ | No | Retrieve current system date, time, and timezone |

---

## Project Structure

```
Personal Assistant Agent/
├── package.json                   # Root monorepo workspace orchestration
├── docker-compose.yml             # Orchestration for Redis, Backend, and Frontend
├── implementation_plan.md         # Phased architecture and delivery roadmap
├── README.md                      # Project documentation
│
├── backend/                       # Express + LangGraph Agent Runtime
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env                       # Backend environment configuration
│   ├── prisma/
│   │   └── schema.prisma          # PostgreSQL models (Users, Threads, Messages, Checkpoints)
│   └── src/
│       ├── index.ts               # Server entry point
│       ├── server.ts              # Express API route handlers and SSE endpoints
│       ├── agent.ts               # LangGraph StateGraph, nodes, and workflow compilation
│       ├── models.ts              # Model Factory (Ollama, Groq, NVIDIA, OpenAI, Claude, Gemini)
│       ├── auth/                  # User authentication and GitHub OAuth
│       ├── db/                    # Prisma client and LangGraph PostgresSaver
│       ├── jobs/                  # BullMQ queue, worker, and Redis connection
│       ├── mcp/                   # MultiServerMCPClient configuration
│       ├── memory/                # Short-term summarization and pgvector long-term memory
│       ├── permissions/           # Tool registry, risk classification, and HITL manager
│       ├── settings/              # User settings and custom workspace directory scoping
│       └── tools/                 # Native tool implementations
│
└── frontend/                      # Next.js 14 Fullstack User Interface
    ├── package.json
    ├── tsconfig.json
    ├── Dockerfile
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx         # Root HTML layout and metadata
        │   ├── globals.css        # Global CSS design tokens
        │   └── page.tsx           # Main application dashboard and thread view
        ├── components/
        │   ├── assistant-ui/      # Chat thread, message bubbles, model selector
        │   ├── auth/              # Authentication modal and OAuth setup gates
        │   ├── jobs/              # Background jobs drawer and status items
        │   ├── layout/            # Header and sidebar components
        │   ├── permissions/       # Confirmation dialogs and permission manager modal
        │   └── settings/          # LLM profile and workspace path configuration
        └── lib/                   # API clients, auth utilities, and custom runtime hooks
```

---

## Prerequisites

- **Node.js**: Version 20.0.0 or higher
- **npm**: Version 10.0.0 or higher
- **PostgreSQL**: Version 15+ (with `pgvector` extension enabled, e.g. Supabase or self-hosted)
- **Redis**: Version 7+ or 8 (for BullMQ background task processing)
- **Ollama** (Optional): Installed and running locally (`http://localhost:11434`) for local models
- **Docker & Docker Compose** (Optional): For full containerized local deployment

---

## Environment Variables

Create and configure `backend/.env` based on the following reference:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
WORKSPACE_ROOT=..

# Database Configuration (Supabase or PostgreSQL with pgvector)
DATABASE_URL="postgresql://user:password@host:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/postgres"

# Redis Configuration (BullMQ Background Jobs)
REDIS_URL=redis://localhost:6379

# Ollama Local Configuration
OLLAMA_BASE_URL=http://localhost:11434

# Cloud LLM API Keys (Configure at least one)
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b

NVIDIA_API_KEY=your_nvidia_api_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENAI_API_KEY=

# GitHub OAuth Integration
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=http://localhost:5000/api/auth/github/callback

# Google Workspace OAuth Integration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
```

---

## Getting Started

### Option 1: Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/om-ddddd/Personal-Assistant-Agent.git
   cd "Personal Assistant Agent"
   ```

2. **Install dependencies**:
   ```bash
   # Install root dependencies
   npm install

   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   cd ..
   ```

3. **Set up the Database Schema**:
   ```bash
   cd backend
   npx prisma db push
   cd ..
   ```

4. **Start Redis Server**:
   Ensure a local Redis server is active on port 6379, or run via Docker:
   ```bash
   docker run -d --name assistant-redis -p 6379:6379 redis:8-alpine
   ```

5. **Start the Development Servers**:
   In two separate terminals:

   Terminal 1 (Backend API):
   ```bash
   npm run dev:backend
   ```
   Backend starts on `http://localhost:5000`.

   Terminal 2 (Frontend UI):
   ```bash
   npm run dev:frontend
   ```
   Frontend starts on `http://localhost:3000`.

6. **Open the Assistant**:
   Navigate to `http://localhost:3000` in your web browser.

---

### Option 2: Docker Compose Deployment

The project includes a complete `docker-compose.yml` orchestrating Redis, the Express + LangGraph backend, and the Next.js frontend with workspace volume mounts:

```bash
# Build and launch all services in background
docker compose up -d --build

# View container logs
docker compose logs -f

# Stop all services
docker compose down
```

Services exposed:
- Frontend UI: `http://localhost:3000`
- Backend API: `http://localhost:5000`
- Redis Queue: `localhost:6379`

---

## API Reference

### Chat & Runtime Endpoints

- `POST /api/chat`
  Sends a chat message to the agent runtime. Returns an Server-Sent Events (SSE) stream of token chunks, tool invocations, and graph events.
  - Body: `{ message: string, threadId: string, modelId?: string }`

- `POST /api/chat/resume`
  Resumes an interrupted thread execution following user approval or rejection of a pending tool call.
  - Body: `{ threadId: string, confirmationId: string, approved: boolean }`

- `GET /api/threads`
  Retrieves a list of conversation sessions for the active or authenticated user.

- `POST /api/threads`
  Creates a new conversation session.

- `GET /api/threads/:id/history`
  Fetches full message history and stored state for a specific thread ID.

- `DELETE /api/threads/:id`
  Deletes a conversation thread and its associated checkpoint data.

### Permissions & Approvals

- `GET /api/permissions/pending`
  Returns all pending confirmation requests awaiting approval.

- `POST /api/permissions/confirm`
  Resolves a pending tool confirmation with approval or rejection.

- `GET /api/tools`
  Lists all active tools with their schemas and assigned risk levels.

### Models & Integrations

- `GET /api/models`
  Returns available local and cloud models and their connectivity status.

- `GET /api/auth/github/status` & `GET /api/auth/github/url`
  Checks GitHub connection state and retrieves the OAuth authorization URL.

- `GET /api/auth/google/status` & `GET /api/auth/google/url`
  Checks Google Workspace connection state and retrieves the Google OAuth consent URL.

### Background Jobs

- `GET /api/jobs`
  Lists all background jobs with their progress and status.

- `GET /api/jobs/:id`
  Retrieves detailed metrics and output logs for a specific job.

- `POST /api/jobs/:id/cancel`
  Cancels a queued or executing background job.

---

## Testing & Verification

The backend includes a comprehensive suite of automated verification scripts:

```bash
# Verify human-in-the-loop permission gate and risk classification
npm run test:permissions --prefix backend

# Verify terminal tool allowlist and hazardous pattern rejection
npm run test:terminal --prefix backend

# Verify database conversation persistence and state checkpoints
npm run test:memory --prefix backend

# Verify pgvector long-term semantic memory retrieval
npm run test:long-term --prefix backend

# Verify GitHub OAuth token exchange and API capabilities
npm run test:github-capabilities --prefix backend

# Verify multi-user authentication and conversation isolation
npm run test:user-auth --prefix backend
npm run test:user-isolation --prefix backend

# Verify BullMQ background job queuing and processing
npm run test:jobs --prefix backend
```

---

## License

This project is licensed under the MIT License.
