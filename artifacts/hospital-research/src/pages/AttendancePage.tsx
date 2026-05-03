import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ClipboardList, Clock3, Users2 } from "lucide-react";

export default function AttendancePage() {
  const { t } = useTranslation();

  const stats = [
    { label: t("attendance.myAttendance"), value: "12", icon: Users2 },
    { label: t("attendance.history"), value: "8", icon: ClipboardList },
    { label: t("meetingForm.dailyTabLabel"), value: "3", icon: CalendarDays },
    { label: t("attendance.closesIn"), value: "45m", icon: Clock3 },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("attendance.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("attendance.subtitle")}</p>
        </div>
        <Button>{t("attendance.submitBtn")}</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border">
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>{t("attendance.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Badge variant="outline">{t("meetingForm.tabLabel")}</Badge>
            <Badge variant="outline">{t("meetingForm.dailyTabLabel")}</Badge>
          </div>
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("attendance.noRecords")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
