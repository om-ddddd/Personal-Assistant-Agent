# Developer Personal Assistant Agent - Master Plan and Phase 0.1 Implementation

This project implements an extensible, security-focused Developer Personal Assistant Agent using a Next.js fullstack architecture featuring **assistant-ui** on the frontend, **LangGraph** & **LangChain** in the agent backend runtime, local & cloud LLM support, a permission management engine, and MCP (Model Context Protocol) integration.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Fullstack App                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    assistant-ui                       │  │
│  │  - Chat Thread & Message List                         │  │
│  │  - Tool Call Visualizer & Streaming Tokens            │  │
│  │  - Interactive Confirmation Dialogs (Approve/Reject)  │  │
│  │  - Model & Provider Selector (Ollama / Cloud)         │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Route Handlers (/api/chat, /api/...)       │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                LangGraph Agent Runtime                │  │
│  │                                                       │  │
│  │   [ StateGraph with MessagesAnnotation ]              │  │
│  │   - Agent Reasoning Node                              │  │
│  │   - Tool Execution Node                               │  │
│  │   - Interrupt / Confirmation Node                     │  │
│  │   - Checkpointer (MemorySaver -> PostgresSaver)       │  │
│  │   - Model Factory (Ollama / LM Studio / Cloud)        │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  Tool / Permission Manager            │  │
│  │   - Tool Registry (READ / WRITE / DESTRUCTIVE)        │  │
│  │   - Pre-execution Permission & Guardrail Gate         │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
     MCP Client            MCP Client            Local MCP
     GitHub                Google Workspace      Developer Machine
     (Issues, PRs)         (Calendar, Gmail)     (Files, Terminal, Git)
```

---

## Phased Roadmap

### Phase 0 — Foundations
- **Step 1: UI Setup & Mock Runtime**: Next.js fullstack shell + `assistant-ui` thread + developer dark theme + sidebar & model selector + interactive mock runtime and tool call visualization preview.
- **Step 2: Bare Agent Engine**: LangGraph `StateGraph` + `MemorySaver` in-memory checkpointing + Model Factory (Ollama & Cloud) connected to the UI.
- **Step 3: Tool-Calling Mechanics**: LangGraph `ToolNode` integration with basic tools (`calculator`, `get_time`), tool call rendering in `assistant-ui`.
- **Step 4: First Real Tool**: Direct GitHub REST tool using Personal Access Token (PAT) for listing open issues and pull requests.

### Phase 1 — Permissions & Persistence
- **v0.4: Tool & Permission Manager**: Classification of tools as `READ`, `WRITE`, or `DESTRUCTIVE`. Hardcoded blocking of unpermitted `DESTRUCTIVE` operations.
- **v0.5: PostgreSQL + Prisma**: Persistent conversation checkpoints, tool permissions, and audit logs.
- **v0.6: Confirmation Flow**: LangGraph human-in-the-loop (`interrupt`) triggering interactive Approve/Reject cards in `assistant-ui` before executing `WRITE`/`DESTRUCTIVE` tools.

### Phase 2 — Real MCP & Local Tools
- **v0.7: GitHub MCP Integration**: Routing GitHub calls through the official GitHub MCP server via LangChain MCP client.
- **v0.8: Filesystem MCP Tool**: Scoped directory access with permission enforcement.
- **v0.9: Safe Terminal MCP Tool**: Command allowlist/denylist with restricted non-root child processes.

### Phase 3 — Background Jobs & Hardening
- **v1.0: Background Jobs**: Redis + BullMQ for asynchronous tasks (e.g., repository batch analysis).
- **v1.1: OAuth 2.0**: GitHub OAuth flow with encrypted token storage.
- **v1.2: Guardrails & Security**: Prompt injection detection on tool outputs, secret scanning, and rate limiting.
- **v1.3: Ship It Locally**: Full `docker-compose.yml` local orchestration with documentation.

### Phase 4 — Stretch
- **v1.4**: Google Workspace (Calendar / Gmail) or Notion MCP integration.
- **v1.5**: Containerized per-command sandbox for the terminal tool.
- **v1.6**: Production deployment guide and demo.

---

## Phase 0.1 Implementation Details

### 1. Project Initialization & Dependencies
- **Framework**: Next.js (App Router, TypeScript, Tailwind CSS)
- **UI Toolkit**: `@assistant-ui/react`, `@assistant-ui/react-markdown`, `lucide-react`
- **Agent Framework**: `@langchain/core`, `@langchain/langgraph`
- **LLM Integrations**:
  - Local: `@langchain/ollama`, `@langchain/openai` (for LM Studio / vLLM compatibility)
  - Cloud: `@langchain/anthropic`, `@langchain/google-genai`, `@langchain/openai`
- **Utilities**: `zod`, `uuid`, `dotenv`

### 2. Backend Agent Engine (`src/lib/agent/`)

#### [NEW] [src/lib/agent/models.ts](file:///c:/Users/Ausu%20vivobook/Desktop/Coding/Personal%20Assistant%20Agent/src/lib/agent/models.ts)
- Model Factory creating `BaseChatModel` instances dynamically:
  - Local Ollama (`ChatOllama` e.g. `llama3.2`, `qwen2.5-coder`, `deepseek-r1`)
  - Local OpenAI-compatible (`ChatOpenAI` targeting LM Studio / vLLM at `http://localhost:1234/v1` or `http://localhost:11434/v1`)
  - Cloud providers (`ChatAnthropic`, `ChatGoogleGenAI`, `ChatOpenAI`)

#### [NEW] [src/lib/agent/graph.ts](file:///c:/Users/Ausu%20vivobook/Desktop/Coding/Personal%20Assistant%20Agent/src/lib/agent/graph.ts)
- LangGraph `StateGraph` compiled with `MemorySaver` checkpointer for stateful multi-turn conversations.

#### [NEW] [src/app/api/chat/route.ts](file:///c:/Users/Ausu%20vivobook/Desktop/Coding/Personal%20Assistant%20Agent/src/app/api/chat/route.ts)
- API route handling streaming chat requests compatible with `assistant-ui` runtime and LangGraph stream events.

#### [NEW] [src/app/api/models/route.ts](file:///c:/Users/Ausu%20vivobook/Desktop/Coding/Personal%20Assistant%20Agent/src/app/api/models/route.ts)
- Returns available model providers (Local Ollama, LM Studio, Cloud) and connectivity status.

### 3. Frontend UI (`src/app/` & `src/components/`)

#### [NEW] [src/components/assistant-ui/thread.tsx](file:///c:/Users/Ausu%20vivobook/Desktop/Coding/Personal%20Assistant%20Agent/src/components/assistant-ui/thread.tsx)
- Thread component using `assistant-ui` primitives, code syntax highlighting, and message bubbles.

#### [NEW] [src/components/assistant-ui/model-selector.tsx](file:///c:/Users/Ausu%20vivobook/Desktop/Coding/Personal%20Assistant%20Agent/src/components/assistant-ui/model-selector.tsx)
- Dropdown selector for switching between Local (Ollama, LM Studio) and Cloud models on the fly.

#### [NEW] [src/app/page.tsx](file:///c:/Users/Ausu%20vivobook/Desktop/Coding/Personal%20Assistant%20Agent/src/app/page.tsx)
- Main assistant page with sidebar for session navigation, header controls, and the assistant chat area.

---

## Verification Plan

### Automated Tests
- Run `npm run build` to verify Next.js TypeScript and JSX compilation.
- Run `npm run lint` for code quality checks.

### Manual Verification
- Start development server with `npm run dev` on `http://localhost:3000`.
- Verify chat message roundtrip using local model (or mock/cloud provider).
- Verify thread state retention across multiple prompt turns.
- Check model selector switching.
- Verify zero emojis are present across UI and responses.
