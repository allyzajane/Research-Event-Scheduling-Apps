import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { formatDateAST } from "@/lib/ast";
import MeetingAttendanceTab from "./MeetingAttendanceTab";

export default function AttendancePage() {
  const { t } = useTranslation();
  const isAr = i18n.language === "ar";

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("attendance.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {formatDateAST(new Date(), isAr ? "ar" : "en")} · KSA
        </p>
      </div>
      <MeetingAttendanceTab />
    </div>
  );
}
