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

export async function notifyAllUsers(opts: NotifyAllOptions): Promise<void> {
  try {
    const { data: users, error: usersError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("is_active", true);

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
  } catch {
  }
}
