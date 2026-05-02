import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import i18n from "i18next";
import { User, Mail, Briefcase, Building, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const roleColors: Record<string, string> = {
  admin: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  ceo: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  director: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  doctor: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  nurse: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  staff: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user) return null;

  const initials = user.full_name
    ? user.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  const infoItems = [
    { icon: Mail, label: t("common.email"), value: user.email },
    { icon: Shield, label: t("common.role"), value: t(`users.roles.${user.role}`) },
    ...(user.department ? [{ icon: Building, label: t("common.department"), value: user.department }] : []),
    ...(user.full_name_ar ? [{ icon: User, label: t("users.fullNameAr"), value: user.full_name_ar }] : []),
  ];

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("profile.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("profile.subtitle")}</p>
      </div>

      <Card className="border-border">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-md">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <span className="text-2xl font-bold text-white">{initials}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {i18n.language === "ar" && user.full_name_ar ? user.full_name_ar : user.full_name || user.email}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
            <Badge className={cn("mt-3 text-sm px-3 py-1", roleColors[user.role])}>
              {t(`users.roles.${user.role}`)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{i18n.language === "ar" ? "معلومات الحساب" : "Account Details"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 pt-0">
          {infoItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <item.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-medium text-foreground">{item.value}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
