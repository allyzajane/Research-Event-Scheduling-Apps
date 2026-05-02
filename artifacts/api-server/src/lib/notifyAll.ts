import { supabaseAdmin } from "./supabase";

type NotificationType = "document" | "article" | "event" | "user" | "system";

interface NotifyAllOptions {
  type: NotificationType;
  title: string;
  title_ar: string;
  body: string;
  body_ar: string;
  link?: string;
  exclude_user_id?: string;
}

// Free-tier safety: cap notifications at 100 active users
const MAX_NOTIFY_USERS = 100;
// Keep at most 50 notifications per user; delete those older than 30 days
const MAX_NOTIFICATIONS_PER_USER = 50;
const NOTIFICATION_RETENTION_DAYS = 30;

export async function notifyAllUsers(opts: NotifyAllOptions): Promise<void> {
  try {
    const { data: users, error: usersError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .limit(MAX_NOTIFY_USERS);

    if (usersError || !users || users.length === 0) return;

    const rows = users
      .filter(u => u.id !== opts.exclude_user_id)
      .map(u => ({
        user_id: u.id,
        type: opts.type,
        title: opts.title,
        title_ar: opts.title_ar,
        body: opts.body,
        body_ar: opts.body_ar,
        link: opts.link || null,
        is_read: false,
      }));

    if (rows.length === 0) return;

    await supabaseAdmin.from("notifications").insert(rows);

    // Async cleanup: trim old notifications to stay within free-tier DB limits
    pruneOldNotifications(rows.map(r => r.user_id)).catch(() => {});
  } catch {
    // Silent — notifications must never break the main action
  }
}

async function pruneOldNotifications(userIds: string[]): Promise<void> {
  const cutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Delete notifications older than 30 days
  await supabaseAdmin
    .from("notifications")
    .delete()
    .lt("created_at", cutoff)
    .in("user_id", userIds);

  // For each affected user, keep only the most recent 50 notifications
  for (const userId of userIds) {
    const { data: oldest } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(MAX_NOTIFICATIONS_PER_USER, MAX_NOTIFICATIONS_PER_USER + 200);

    if (oldest && oldest.length > 0) {
      const ids = oldest.map(n => n.id);
      await supabaseAdmin
        .from("notifications")
        .delete()
        .in("id", ids);
    }
  }
}
