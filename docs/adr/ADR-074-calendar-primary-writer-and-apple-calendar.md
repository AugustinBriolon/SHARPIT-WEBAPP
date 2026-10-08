# ADR-074: Calendar primary is the sole writer; Apple Calendar is on-device

**Status:** Accepted
**Date:** 2026-10-08
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** extends ADR-027 for class `calendar`; replaces standalone iPhone « plan copy » as source of truth

---

## Context

ADR-027 defines per-class `enabled` providers and a single `primary` source of truth. Google Agenda already reads busy intervals, writes Sharpit session events to a chosen calendar, and follows move/delete on the server. On iPhone, **Calendrier de l’iPhone** (`PlanCalendarSync`) only copied the plan into a dedicated SharpIt calendar and overwrote EventKit on refresh — calendar did not win, and busy from other calendars was not used.

Enabling both Google write and Apple copy would **double-write** and split authority. Athletes need one writer/follower for schedule, while still seeing free slots from every calendar they use.

---

## Decision

1. **Class `calendar` has two integration ids:** `google` and `apple-calendar` (never `apple`, to avoid clashing with `apple-health`). Source prefs follow the same enable/primary pattern as other classes (`/api/v1/integrations/source-prefs`).
2. **Primary is the sole writer and follower** for Sharpit session events. It creates, updates, and deletes events in its **write target** calendar. On sync, changes on those events update the planned session (move) or unlink (delete) — calendar wins for schedule.
3. **Secondary calendar providers are busy-only.** Any enabled provider may supply occupied intervals for coach placement and plan safety gates. A non-primary provider never pushes or pulls Sharpit session events.
4. **Google Agenda write and pull-back are gated on primary.** Server cron and push paths run Google event sync only when `primaryForClass(prefs, 'calendar') === 'google'`. Free/busy reads still run when Google is enabled, even if Apple is primary.
5. **Apple Calendar (`apple-calendar`) is on-device via EventKit.** Linking mirrors Apple Health (`POST /api/v1/apple-calendar/link`, `AthleteProfile.appleCalendarLinkedAt`). When primary, the iPhone app writes/updates/deletes events in the athlete’s chosen writable calendar (default: dedicated « SharpIt » calendar), pulls back move/delete before overwriting from the plan, and **uploads busy intervals** to the API (`POST /api/v1/calendar/busy`, provider `apple-calendar`) so web coach and server-side free-slot logic stay consistent with iOS.
6. **Pro gates writing to external calendars** (Google push and Apple EventKit write), matching the previous iPhone calendar sync entitlement. Connecting providers and contributing busy for placement follow the same Pro policy as today’s calendar features unless product changes it later.
7. **Switching primary leaves orphan events** on the previous provider’s calendar: SharpIt stops updating them; the new primary writes fresh events for future sessions without reusing the old provider’s external ids. v1 does not offer bulk cleanup of orphans.

---

## Consequences

- Only one Sharpit event per planned session when both Google and Apple are enabled.
- iOS must expose Google write-calendar picker and Apple write-calendar picker under **Priorités › Agenda**; legacy **Paramètres › Calendrier de l’iPhone** is deprecated in favour of Sources and primary selection.
- Athletes with Google target only keep Google as primary when enabled; `PlanCalendarSync.enabled` migrates once to linked `apple-calendar` with equivalent target and primary when Google has no write target.
- Server free/busy merges Google free/busy with stored Apple busy snapshots when both are enabled.
