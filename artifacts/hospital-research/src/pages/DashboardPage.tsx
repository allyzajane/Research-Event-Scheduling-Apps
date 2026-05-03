import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetMyDashboardConfig, getGetMyDashboardConfigQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import {
  Users, FileText, BookOpen, Calendar, ArrowRight, Clock,
  FileIcon, UploadCloud, PenLine, CalendarPlus, UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDateAST } from "@/lib/ast";
import { OnlineUsersCard } from "@/components/OnlineUsersCard";

function formatDate(date: string) {
  return formatDateAST(date, i18n.language === "ar" ? "ar" : "en");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const fileTypeColors: Record<string, string> = {
  pdf: "text-red-500",
  excel: "text-green-600",
  csv: "text-green-500",
  word: "text-blue-600",
  image: "text-purple-500",
  other: "text-gray-500",
};

const eventTypeColors: Record<string, string> = {
  event: "bg-teal-500",
  meeting: "bg-blue-500",
  announcement: "bg-amber-500",
  conference: "bg-purple-500",
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  const { data: config, isLoading: configLoading } = useGetMyDashboardConfig({
    query: { queryKey: getGetMyDashboardConfigQueryKey() },
  });

  const isLoading = summaryLoading || configLoading;

  const allowed = config?.widgets ?? [];
  const has = (widget: string) => allowed.includes(widget);

  const greeting = i18n.language === "ar"
    ? `مرحباً، ${user?.full_name_ar || user?.full_name || user?.email?.split("@")[0]}`
    : `${t("dashboard.welcome")}, ${user?.full_name || user?.email?.split("@")[0]}`;

  const statCards = [
    { id: "stat_users",     label: t("dashboard.totalUsers"),     value: summary?.total_users ?? 0,     icon: Users,    color: "text-primary",     bg: "bg-primary/10" },
    { id: "stat_documents", label: t("dashboard.totalDocuments"), value: summary?.total_documents ?? 0, icon: FileText, color: "text-blue-500",    bg: "bg-blue-50 dark:bg-blue-950" },
    { id: "stat_articles",  label: t("dashboard.totalArticles"),  value: summary?.total_articles ?? 0,  icon: BookOpen, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950" },
    { id: "stat_events",    label: t("dashboard.upcomingEvents"), value: summary?.upcoming_events ?? 0, icon: Calendar, color: "text-amber-500",   bg: "bg-amber-50 dark:bg-amber-950" },
  ].filter(c => has(c.id));

  const showRecentDocs     = has("recent_documents");
  const showRecentArticles = has("recent_articles");
  const showUpcomingEvents = has("upcoming_events");
  const showQuickActions   = has("quick_actions");

  // Online users card is always shown — true real-time value regardless of widget config
  const showOnlineUsers = true;

  const listCount = [showOnlineUsers, showRecentDocs, showRecentArticles, showUpcomingEvents, showQuickActions].filter(Boolean).length;
  const listCols  = listCount === 0 ? 0 : listCount === 1 ? 1 : listCount === 2 ? 2 : 3;

  if (configLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {i18n.language === "ar" ? "إليك نظرة عامة على المنصة" : "Here's an overview of the platform"}
        </p>
      </div>

      {/* Stat cards */}
      {statCards.length > 0 && (
        <div className={`grid gap-4 ${statCards.length === 1 ? "grid-cols-1 max-w-xs" : statCards.length === 2 ? "grid-cols-2 max-w-md" : statCards.length === 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
          {statCards.map((card) => (
            <Card key={card.id} className="border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">{card.label}</p>
                    {isLoading ? (
                      <Skeleton className="h-7 w-16" />
                    ) : (
                      <p className="text-2xl font-bold text-foreground">{card.value.toLocaleString()}</p>
                    )}
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center flex-shrink-0`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bottom grid */}
      {listCount > 0 && (
        <div className={`grid gap-6 ${listCols === 1 ? "grid-cols-1" : listCols === 2 ? "md:grid-cols-2" : "lg:grid-cols-3"}`}>

          {/* Online Users — always first */}
          {showOnlineUsers && <OnlineUsersCard />}

          {/* Recent Documents */}
          {showRecentDocs && (
            <Card className="border-border">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-semibold">{t("dashboard.recentDocuments")}</CardTitle>
                <Link href="/documents">
                  <Button variant="ghost" size="sm" className="text-xs text-primary h-7 px-2">
                    {t("dashboard.viewAll")} <ArrowRight className="w-3 h-3 ms-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {isLoading ? (
                  [...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
                ) : summary?.recent_documents?.length ? (
                  summary.recent_documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <FileIcon className={`w-4 h-4 flex-shrink-0 ${fileTypeColors[doc.file_type] || "text-gray-500"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)} · {formatDate(doc.created_at)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t("dashboard.noDocuments")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Articles */}
          {showRecentArticles && (
            <Card className="border-border">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-semibold">{t("dashboard.recentArticles")}</CardTitle>
                <Link href="/articles">
                  <Button variant="ghost" size="sm" className="text-xs text-primary h-7 px-2">
                    {t("dashboard.viewAll")} <ArrowRight className="w-3 h-3 ms-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {isLoading ? (
                  [...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
                ) : summary?.recent_articles?.length ? (
                  summary.recent_articles.map(article => (
                    <div key={article.id} className="p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <p className="text-sm font-medium text-foreground truncate">
                        {i18n.language === "ar" && article.title_ar ? article.title_ar : article.title}
                      </p>
                      {article.excerpt && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{article.excerpt}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={article.is_published ? "default" : "secondary"} className="text-xs px-1.5 py-0 h-4">
                          {article.is_published ? t("common.published") : t("common.draft")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(article.created_at)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t("dashboard.noArticles")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upcoming Events */}
          {showUpcomingEvents && (
            <Card className="border-border">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-semibold">{t("dashboard.upcomingEventsList")}</CardTitle>
                <Link href="/calendar">
                  <Button variant="ghost" size="sm" className="text-xs text-primary h-7 px-2">
                    {t("dashboard.viewAll")} <ArrowRight className="w-3 h-3 ms-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {isLoading ? (
                  [...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
                ) : summary?.upcoming_events_list?.length ? (
                  summary.upcoming_events_list.map(event => (
                    <div key={event.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${eventTypeColors[event.event_type] || "bg-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {i18n.language === "ar" && event.title_ar ? event.title_ar : event.title}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">{formatDate(event.start_time)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t("dashboard.noEvents")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          {showQuickActions && (
            <Card className="border-border">
              <CardHeader className="pb-3 space-y-0">
                <CardTitle className="text-base font-semibold">
                  {i18n.language === "ar" ? "إجراءات سريعة" : "Quick Actions"}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 pt-0">
                <Link href="/documents">
                  <button className="w-full flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group text-center">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-5 h-5 text-blue-500" />
                    </div>
                    <span className="text-xs font-medium text-foreground leading-tight">
                      {i18n.language === "ar" ? "رفع وثيقة" : "Upload Document"}
                    </span>
                  </button>
                </Link>
                <Link href="/articles">
                  <button className="w-full flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group text-center">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <PenLine className="w-5 h-5 text-emerald-500" />
                    </div>
                    <span className="text-xs font-medium text-foreground leading-tight">
                      {i18n.language === "ar" ? "كتابة مقال" : "Write Article"}
                    </span>
                  </button>
                </Link>
                <Link href="/calendar">
                  <button className="w-full flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group text-center">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <CalendarPlus className="w-5 h-5 text-amber-500" />
                    </div>
                    <span className="text-xs font-medium text-foreground leading-tight">
                      {i18n.language === "ar" ? "إنشاء حدث" : "Create Event"}
                    </span>
                  </button>
                </Link>
                <Link href="/users">
                  <button className="w-full flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group text-center">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <UserPlus className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-xs font-medium text-foreground leading-tight">
                      {i18n.language === "ar" ? "إدارة المستخدمين" : "Manage Users"}
                    </span>
                  </button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Empty state when no widgets */}
      {!configLoading && statCards.length === 0 && listCount === 0 && (
        <div className="text-center py-24 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 opacity-30" />
          </div>
          <p className="text-base font-medium">
            {i18n.language === "ar" ? "لا توجد عناصر معروضة" : "No widgets configured"}
          </p>
          <p className="text-sm mt-1">
            {i18n.language === "ar"
              ? "يمكن للمدير تخصيص عناصر لوحة التحكم من الإعدادات"
              : "An admin can configure your dashboard widgets in Settings"}
          </p>
        </div>
      )}
    </div>
  );
}
