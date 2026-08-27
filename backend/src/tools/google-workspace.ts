import { tool } from "@langchain/core/tools";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "../..");
const tokensFilePath = path.join(backendDir, ".google-tokens.json");

dotenv.config({ path: path.join(backendDir, ".env") });

// Active in-memory OAuth client
let globalOAuth2Client: any = null;

function loadStoredTokens() {
  try {
    if (fs.existsSync(tokensFilePath)) {
      const data = fs.readFileSync(tokensFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch {}
  return null;
}

function saveStoredTokens(tokens: any) {
  try {
    fs.writeFileSync(tokensFilePath, JSON.stringify(tokens, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save tokens to file:", err);
  }
}

/**
 * Returns or initializes OAuth2 / Service Account client lazily
 */
export async function getGoogleAuthClient() {
  if (globalOAuth2Client && (globalOAuth2Client.credentials?.access_token || globalOAuth2Client.credentials?.refresh_token)) {
    return globalOAuth2Client;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const storedTokens = loadStoredTokens();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || storedTokens?.refresh_token;
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (clientId && clientSecret) {
    const { google } = await import("googleapis");
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback"
    );

    if (storedTokens) {
      oauth2Client.setCredentials(storedTokens);
      globalOAuth2Client = oauth2Client;
      return globalOAuth2Client;
    } else if (refreshToken) {
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      globalOAuth2Client = oauth2Client;
      return globalOAuth2Client;
    } else {
      // Credentials not yet received via OAuth flow
      return null;
    }
  }

  if (serviceAccountEmail && privateKey) {
    const { google } = await import("googleapis");
    return new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    });
  }

  if (credentialsPath) {
    const { google } = await import("googleapis");
    return new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    });
  }

  return null;
}

/**
 * Generates Google OAuth2 consent authorization URL for 1-click connection
 */
export async function getGoogleOAuthUrl(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback"
  );

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
  ];

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
  });
}

/**
 * Handles OAuth callback authorization code exchange
 */
export async function handleGoogleOAuthCallback(code: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured.");
  }

  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/api/auth/google/callback"
  );

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  saveStoredTokens(tokens);
  globalOAuth2Client = oauth2Client;
  return tokens;
}

/**
 * Returns current status of Google Workspace connection
 */
export function getGoogleAuthStatus() {
  const stored = loadStoredTokens();
  const hasLiveAuth = !!process.env.GOOGLE_REFRESH_TOKEN || !!stored?.refresh_token || !!stored?.access_token || !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  return {
    configured: hasLiveAuth,
    mode: hasLiveAuth ? "live" : "sandbox",
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
  };
}

/**
 * Local in-memory sandbox storage for calendar & email events when live keys are pending
 */
const mockCalendarStore: Array<{
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  htmlLink: string;
}> = [
  {
    id: "evt-001",
    summary: "Personal Assistant Agent Architecture Review",
    description: "Weekly milestone review and agent capability walkthrough.",
    start: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
    end: new Date(Date.now() + 3600 * 1000 * 25).toISOString(),
    location: "Google Meet",
    attendees: ["dev@example.com"],
    htmlLink: "https://calendar.google.com/calendar/event?eid=mock1",
  },
];

const mockEmailStore: Array<{
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  unread: boolean;
}> = [
  {
    id: "msg-001",
    threadId: "th-001",
    from: "github-notifications@github.com",
    to: "developer@example.com",
    subject: "Pull Request #1 Merged: Add MCP Integration",
    snippet: "Your pull request #1 has been successfully merged into main branch.",
    body: "Hi developer, your pull request #1 has been reviewed and merged into main.",
    date: new Date().toISOString(),
    unread: true,
  },
];

/* ========================================================================= */
/*                         GOOGLE CALENDAR TOOLS                             */
/* ========================================================================= */

/**
 * List Google Calendar Events Tool
 */
export const listCalendarEventsTool = tool(
  async ({
    maxResults = 10,
    timeMin,
    calendarId = "primary",
  }: {
    maxResults?: number;
    timeMin?: string;
    calendarId?: string;
  }) => {
    const auth = await getGoogleAuthClient();

    if (!auth) {
      return JSON.stringify({
        status: "sandbox_mode",
        message: "Google Workspace credentials not configured in backend/.env. Returning local sandbox events. Set GOOGLE_CLIENT_ID and GOOGLE_REFRESH_TOKEN for live Google Calendar access.",
        total: mockCalendarStore.length,
        events: mockCalendarStore.slice(0, maxResults),
      });
    }

    try {
      const { google } = await import("googleapis");
      const calendar = google.calendar({ version: "v3", auth: auth as any });
      const res = await calendar.events.list({
        calendarId,
        timeMin: timeMin || new Date().toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      const items = res.data.items || [];
      return JSON.stringify({
        total: items.length,
        events: items.map((e) => ({
          id: e.id,
          summary: e.summary || "No Title",
          description: e.description,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          location: e.location,
          attendees: e.attendees?.map((a) => a.email),
          htmlLink: e.htmlLink,
        })),
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Failed to retrieve Google Calendar events: ${error.message}`,
      });
    }
  },
  {
    name: "list_calendar_events",
    description: "Lists upcoming events and scheduled appointments from Google Calendar.",
    schema: z.object({
      maxResults: z.number().optional().describe("Maximum number of events to return (default: 10)"),
      timeMin: z.string().optional().describe("ISO timestamp lower bound (default: current time)"),
      calendarId: z.string().optional().describe("Calendar identifier (default: 'primary')"),
    }),
  }
);

/**
 * Create Google Calendar Event Tool
 */
export const createCalendarEventTool = tool(
  async ({
    summary,
    description,
    startTime,
    endTime,
    location,
    attendees,
    calendarId = "primary",
  }: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    location?: string;
    attendees?: string[];
    calendarId?: string;
  }) => {
    const auth = await getGoogleAuthClient();

    if (!auth) {
      const newEvent = {
        id: `evt-${Date.now()}`,
        summary,
        description,
        start: startTime,
        end: endTime,
        location,
        attendees,
        htmlLink: `https://calendar.google.com/calendar/event?eid=mock-${Date.now()}`,
      };
      mockCalendarStore.push(newEvent);

      return JSON.stringify({
        status: "sandbox_mode",
        message: "Event scheduled in local sandbox. Provide GOOGLE_CLIENT_ID and GOOGLE_REFRESH_TOKEN in .env for live Google Calendar synchronization.",
        event: newEvent,
      });
    }

    try {
      const { google } = await import("googleapis");
      const calendar = google.calendar({ version: "v3", auth: auth as any });
      const res = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary,
          description,
          location,
          start: { dateTime: startTime },
          end: { dateTime: endTime },
          attendees: attendees ? attendees.map((email) => ({ email })) : undefined,
        },
      });

      return JSON.stringify({
        message: "Calendar event successfully created on Google Calendar.",
        event: {
          id: res.data.id,
          summary: res.data.summary,
          start: res.data.start?.dateTime,
          end: res.data.end?.dateTime,
          htmlLink: res.data.htmlLink,
        },
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Failed to create Google Calendar event: ${error.message}`,
      });
    }
  },
  {
    name: "create_calendar_event",
    description: "Schedules a new meeting or event in Google Calendar with start time, end time, and attendees.",
    schema: z.object({
      summary: z.string().describe("Title or summary of the meeting/event"),
      description: z.string().optional().describe("Detailed description of the event agenda"),
      startTime: z.string().describe("ISO-8601 start timestamp (e.g. '2026-08-28T10:00:00Z')"),
      endTime: z.string().describe("ISO-8601 end timestamp (e.g. '2026-08-28T11:00:00Z')"),
      location: z.string().optional().describe("Location or meeting link (e.g. 'Google Meet' or room name)"),
      attendees: z.array(z.string()).optional().describe("List of attendee email addresses"),
      calendarId: z.string().optional().describe("Calendar identifier (default: 'primary')"),
    }),
  }
);

/**
 * Delete Google Calendar Event Tool
 */
export const deleteCalendarEventTool = tool(
  async ({
    eventId,
    calendarId = "primary",
  }: {
    eventId: string;
    calendarId?: string;
  }) => {
    const auth = await getGoogleAuthClient();

    if (!auth) {
      const idx = mockCalendarStore.findIndex((e) => e.id === eventId);
      if (idx !== -1) {
        mockCalendarStore.splice(idx, 1);
        return JSON.stringify({ message: `Event '${eventId}' deleted from local sandbox.` });
      }
      return JSON.stringify({ error: `Event '${eventId}' not found in local sandbox.` });
    }

    try {
      const { google } = await import("googleapis");
      const calendar = google.calendar({ version: "v3", auth: auth as any });
      await calendar.events.delete({ calendarId, eventId });
      return JSON.stringify({ message: `Event '${eventId}' successfully deleted from Google Calendar.` });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Failed to delete Google Calendar event: ${error.message}`,
      });
    }
  },
  {
    name: "delete_calendar_event",
    description: "Deletes an event from Google Calendar using its eventId.",
    schema: z.object({
      eventId: z.string().describe("Unique identifier of the Google Calendar event"),
      calendarId: z.string().optional().describe("Calendar identifier (default: 'primary')"),
    }),
  }
);

/* ========================================================================= */
/*                            GMAIL TOOLS                                    */
/* ========================================================================= */

/**
 * List Gmail Emails Tool
 */
export const listEmailsTool = tool(
  async ({
    query = "is:inbox",
    maxResults = 10,
  }: {
    query?: string;
    maxResults?: number;
  }) => {
    const auth = await getGoogleAuthClient();

    if (!auth) {
      return JSON.stringify({
        status: "sandbox_mode",
        message: "Google Workspace credentials not configured in backend/.env. Returning local sandbox inbox. Set GOOGLE_CLIENT_ID and GOOGLE_REFRESH_TOKEN for live Gmail access.",
        total: mockEmailStore.length,
        messages: mockEmailStore.slice(0, maxResults),
      });
    }

    try {
      const { google } = await import("googleapis");
      const gmail = google.gmail({ version: "v1", auth: auth as any });
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
      });

      const messageIds = listRes.data.messages || [];
      const detailedMessages = [];

      for (const msg of messageIds) {
        if (!msg.id) continue;
        const msgDetail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From", "Date"],
        });

        const headers = msgDetail.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
        const from = headers.find((h) => h.name === "From")?.value || "Unknown";
        const date = headers.find((h) => h.name === "Date")?.value || "";

        detailedMessages.push({
          id: msg.id,
          threadId: msg.threadId,
          snippet: msgDetail.data.snippet,
          subject,
          from,
          date,
        });
      }

      return JSON.stringify({
        total: detailedMessages.length,
        messages: detailedMessages,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Failed to list Gmail emails: ${error.message}`,
      });
    }
  },
  {
    name: "list_emails",
    description: "Lists emails from Gmail with optional search queries (e.g., 'is:unread', 'from:github', 'is:starred').",
    schema: z.object({
      query: z.string().optional().describe("Search filter query (default: 'is:inbox')"),
      maxResults: z.number().optional().describe("Maximum number of emails to retrieve (default: 10)"),
    }),
  }
);

/**
 * Read Gmail Email by ID Tool
 */
export const readEmailTool = tool(
  async ({ messageId }: { messageId: string }) => {
    const auth = await getGoogleAuthClient();

    if (!auth) {
      const email = mockEmailStore.find((m) => m.id === messageId);
      if (email) {
        return JSON.stringify({ email });
      }
      return JSON.stringify({ error: `Message '${messageId}' not found in local sandbox.` });
    }

    try {
      const { google } = await import("googleapis");
      const gmail = google.gmail({ version: "v1", auth: auth as any });
      const res = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const headers = res.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
      const from = headers.find((h) => h.name === "From")?.value || "Unknown";
      const to = headers.find((h) => h.name === "To")?.value || "me";
      const date = headers.find((h) => h.name === "Date")?.value || "";

      let body = res.data.snippet || "";
      if (res.data.payload?.parts) {
        const textPart = res.data.payload.parts.find((p) => p.mimeType === "text/plain");
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
        }
      }

      return JSON.stringify({
        id: messageId,
        threadId: res.data.threadId,
        subject,
        from,
        to,
        date,
        body,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Failed to read Gmail email: ${error.message}`,
      });
    }
  },
  {
    name: "read_email",
    description: "Reads the full body content, headers, and details of a specific Gmail message by ID.",
    schema: z.object({
      messageId: z.string().describe("The unique ID of the Gmail message to read"),
    }),
  }
);

/**
 * Send Gmail Email Tool
 */
export const sendEmailTool = tool(
  async ({
    to,
    subject,
    body,
    cc,
  }: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
  }) => {
    const auth = await getGoogleAuthClient();

    if (!auth) {
      const sentEmail = {
        id: `msg-${Date.now()}`,
        threadId: `th-${Date.now()}`,
        from: "me@example.com",
        to,
        subject,
        snippet: body.slice(0, 80),
        body,
        date: new Date().toISOString(),
        unread: false,
      };
      mockEmailStore.push(sentEmail);

      return JSON.stringify({
        status: "sandbox_mode",
        message: `Email to '${to}' simulated in local sandbox. Set GOOGLE_CLIENT_ID and GOOGLE_REFRESH_TOKEN in .env to dispatch live emails.`,
        email: sentEmail,
      });
    }

    try {
      const { google } = await import("googleapis");
      const gmail = google.gmail({ version: "v1", auth: auth as any });
      
      const emailLines = [
        `To: ${to}`,
        cc ? `Cc: ${cc}` : "",
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        body,
      ].filter((l) => l !== "").join("\r\n");

      const encodedMessage = Buffer.from(emailLines)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
        },
      });

      return JSON.stringify({
        message: `Email successfully sent to ${to}.`,
        messageId: res.data.id,
        threadId: res.data.threadId,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return JSON.stringify({
        error: `Failed to send Gmail email: ${error.message}`,
      });
    }
  },
  {
    name: "send_email",
    description: "Sends an email message via Gmail to one or more recipient email addresses.",
    schema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email plain text body message"),
      cc: z.string().optional().describe("Optional CC email recipient address"),
    }),
  }
);

/**
 * Exported Google Workspace tools array (Calendar + Gmail)
 */
export const googleWorkspaceTools = [
  listCalendarEventsTool,
  createCalendarEventTool,
  deleteCalendarEventTool,
  listEmailsTool,
  readEmailTool,
  sendEmailTool,
];
