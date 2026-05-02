import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import { Users, FileText, BookOpen, Calendar, ArrowRight, Clock, FileIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(i18n.language === "ar" ? "ar-SA" : "en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
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
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: summary, isLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const greeting = i18n.language === "ar"
    ? `مرحباً، ${user?.full_name_ar || user?.full_name || user?.email?.split("@")[0]}`
    : `${t("dashboard.welcome")}, ${user?.full_name || user?.email?.split("@")[0]}`;

  const statCards = [
    { label: t("dashboard.totalUsers"), value: summary?.total_users ?? 0, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: t("dashboard.totalDocuments"), value: summary?.total_documents ?? 0, icon: FileText, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950" },
    { label: t("dashboard.totalArticles"), value: summary?.total_articles ?? 0, icon: BookOpen, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950" },
    { label: t("dashboard.upcomingEvents"), value: summary?.upcoming_events ?? 0, icon: Calendar, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{greeting}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {i18n.language === "ar"
            ? "إليك نظرة عامة على المنصة"
            : "Here's an overview of the platform"}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <Card key={i} className="border-border">
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

      {/* Bottom grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Documents */}
        <Card className="lg:col-span-1 border-border">
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

        {/* Recent Articles */}
        <Card className="lg:col-span-1 border-border">
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

        {/* Upcoming Events */}
        <Card className="lg:col-span-1 border-border">
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
      </div>
    </div>
  );
}
