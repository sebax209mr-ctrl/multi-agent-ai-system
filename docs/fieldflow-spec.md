# FieldFlow — Technical Specification

- **For:** Full-stack engineer (contractor or co-founder)
- **Author:** Seba
- **Status:** MVP build — pool service vertical first

---

## 1. Product Summary

FieldFlow is a lightweight scheduling + CRM tool for small, unorganized service businesses (pool service, small property management, small construction/trade crews) currently running on texts, spreadsheets, and paper. The MVP targets pool service operators (1–5 person crews) running recurring residential/commercial routes.

**Core loop:** a lead texts in → an AI assistant proposes an open slot on the route → the job gets booked → the operator sees it on their route view → they mark it complete → the customer gets an automated reminder before the next visit.

The product must be built so the scheduling/CRM/chat engine is **vertical-agnostic** — property management and construction versions come later by swapping terminology and a few workflow branches, not by rebuilding the core.

---

## 2. Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js (React, TypeScript) | SSR for fast load on mobile (field use), single codebase for web + easy PWA wrap |
| Styling | Tailwind CSS | Fast iteration, small bundle |
| Backend | Next.js API routes (or separate Node/Express if scaling demands it) | Avoid managing two deploys at MVP stage |
| Database | PostgreSQL via Supabase | Managed Postgres + built-in auth + row-level security, generous free tier |
| ORM | Prisma | Type-safe queries, easy migrations |
| Auth | Supabase Auth (email/password + magic link) | Operators are non-technical — magic link reduces friction |
| SMS/chat | Twilio Programmable Messaging | Industry standard, reliable delivery, two-way SMS |
| Conversational AI | Anthropic API (Claude) via a tool-calling agent | Parses free-text replies ("Wed morning works") into structured slot proposals |
| Calendar | Internal scheduling engine (Postgres-backed) for v1; Google Calendar API sync in v2 | Don't build calendar sync until a customer asks for it |
| Hosting | Vercel (frontend/API) + Supabase (DB/auth) | Zero-ops for a solo/small team |
| Background jobs | Vercel Cron or Supabase Edge Functions | Daily reminder sends, weekly route digest |
| Monitoring | Sentry (errors) + Vercel Analytics | Minimum viable observability |

---

## 3. Data Model (core, vertical-agnostic)

```
Business
  id, name, vertical (enum: pool | property_mgmt | construction), phone_number (Twilio), created_at

User (staff/owner, belongs to Business)
  id, business_id, name, email, role (owner | tech), phone

Customer
  id, business_id, name, phone, email, address, status (lead | active | inactive),
  plan_label (free text: "Weekly clean", "Monthly inspection", etc.), notes, created_at

Job (a scheduled visit/stop — generic across verticals)
  id, business_id, customer_id, assigned_user_id, scheduled_at, duration_minutes,
  status (scheduled | completed | canceled | no_show), recurrence_rule (nullable, RRULE format),
  notes

Conversation (SMS thread with a lead/customer)
  id, business_id, customer_id, channel (sms), status (open | resolved)

Message
  id, conversation_id, sender (customer | bot | staff), body, sent_at

SlotProposal (structured output from the AI agent during booking)
  id, conversation_id, proposed_at_time, status (proposed | accepted | rejected | expired)
```

**Notes for the engineer:**

- Keep `plan_label` and `notes` as free text at MVP — don't over-model vertical-specific fields (chemical logs, lease terms, change orders) until a paying customer needs them.
- `recurrence_rule` should be there from day one even if the UI only supports weekly/bi-weekly — retrofitting recurrence is painful.

---

## 4. Core Features — MVP Scope

**Must have (v1):**

1. Owner signs up, creates a Business, gets a dedicated Twilio number.
2. Owner manually adds customers/leads (name, phone, address, plan).
3. Owner manually schedules jobs on a week view; can mark complete/no-show.
4. Automated day-before SMS reminder to customers with a scheduled job.
5. Booking assistant: lead texts the business number → Claude-powered agent reads open slots for the week → proposes 1–2 times → on confirmation, creates a Job and flips Customer status to `active`.
6. Basic dashboard: this week's jobs, count of open leads, count of active customers.

**Explicitly out of scope for v1 (do not build until validated):**

- Payments/invoicing
- Route optimization / GPS
- Google Calendar two-way sync
- Multi-vertical UI (property management, construction terminology)
- Native mobile app (responsive web is enough)
- Resume parsing / hiring features (deprioritized — no validated demand yet)

---

## 5. AI Agent Behavior (booking assistant)

The agent runs server-side, triggered on inbound Twilio webhook. Responsibilities:

1. Look up the customer/lead by phone number (create a new lead record if unknown).
2. Fetch the business's open slots for the next 7 days (jobs table, gaps between scheduled visits).
3. Use Claude with a system prompt constraining it to: (a) only propose real open slots, (b) never invent availability, (c) ask one clarifying question if the reply is ambiguous, (d) confirm explicitly before writing to the database.
4. On confirmed booking, the agent calls a tool/function (`create_job`) rather than freeform text — structured tool calls, not string parsing, to avoid double-bookings or hallucinated times.
5. Escalate to the human owner (via a flagged conversation in the dashboard) if the conversation goes more than ~4 turns without resolution.

---

## 6. API Surface (initial)

```
POST   /api/customers                create lead/customer
GET    /api/customers                list, filter by status
PATCH  /api/customers/:id            update status/plan/notes

POST   /api/jobs                     create job (manual scheduling)
GET    /api/jobs?week=YYYY-MM-DD     list jobs for a week
PATCH  /api/jobs/:id                 update status (completed/no_show/canceled)

POST   /api/webhooks/twilio-inbound  inbound SMS → conversation handler → AI agent
POST   /api/cron/reminders           daily job, triggers day-before SMS sends
```

---

## 7. Build Order (suggested milestones)

| Milestone | Scope |
| --- | --- |
| Week 1–2 | Auth, Business/User/Customer models, manual customer CRUD UI |
| Week 3 | Job model, manual week-view scheduling UI, mark complete/no-show |
| Week 4 | Twilio integration — send-only (day-before reminders) before attempting two-way chat |
| Week 5–6 | Inbound SMS webhook + Claude agent booking flow, structured tool-calling, conversation dashboard |
| Week 7 | Polish, mobile responsiveness, error monitoring, deploy to first pilot customer |

> **Do not start week 5 until weeks 1–4 are in front of a real pool service operator.** The booking bot is the hardest and riskiest part — validate that people will even use the manual version first.

---

## 8. Open Questions for the Engineer to Flag, Not Solve Silently

- Twilio number provisioning per business — one shared number with routing, or one number per business (cost implication)?
- How to handle a customer replying to reschedule an already-booked job vs. a new lead booking for the first time — same webhook handler, different branch logic.
- Rate limiting/abuse handling on the inbound SMS endpoint.

---

This spec covers the pool-service MVP only. Property management and construction variants will reuse this schema (Job → "maintenance request" / "site visit" labeling, Customer → "tenant" / "client" labeling) and should not require new tables — flag to Seba before adding vertical-specific schema.
