import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useGetLandingPage, useGetThemeSettings } from "@workspace/api-client-react";
import i18n from "i18next";
import { applyDirection } from "@/i18n/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hospital, Lock, Mail, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { t } = useTranslation();
  const { signIn, user } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: landingConfig } = useGetLandingPage();
  const { data: theme } = useGetThemeSettings();

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(t("login.error"));
    } else {
      setLocation("/dashboard");
    }
  };

  const toggleLang = () => {
    const next = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(next);
    applyDirection(next);
  };

  const logoUrl = landingConfig?.logo_url || theme?.logo_url;
  const bgUrl = landingConfig?.background_url || theme?.background_url;
  const hospitalName = i18n.language === "ar"
    ? (landingConfig?.hospital_name_ar || landingConfig?.hospital_name || t("common.appName"))
    : (landingConfig?.hospital_name || t("common.appName"));

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/70 to-[#1e6a8e]"
        style={bgUrl ? {
          backgroundImage: `url(${bgUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
      >
        {bgUrl && <div className="absolute inset-0 bg-primary/70 backdrop-blur-sm" />}
      </div>

      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      {/* Language toggle */}
      <button
        onClick={toggleLang}
        className="absolute top-4 end-4 z-10 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors backdrop-blur-sm"
      >
        {i18n.language === "ar" ? "EN" : "عر"}
      </button>

      {/* Login card */}
      <div className="relative z-10 flex items-center justify-center w-full p-6">
        <div className="w-full max-w-sm">
          {/* Logo & Hospital name */}
          <div className="text-center mb-8">
            {logoUrl ? (
              <img src={logoUrl} alt="Hospital Logo" className="h-16 w-auto mx-auto mb-4 object-contain" />
            ) : (
              <div className="w-16 h-16 mx-auto mb-4 bg-white rounded-2xl flex items-center justify-center shadow-lg">
                <Hospital className="w-9 h-9 text-primary" />
              </div>
            )}
            <h1 className="text-xl font-bold text-white mb-1">{hospitalName}</h1>
            <p className="text-sm text-white/70">{t("login.adminOnly")}</p>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-bold text-foreground mb-1">{t("login.title")}</h2>
            <p className="text-sm text-muted-foreground mb-6">{t("login.subtitle")}</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("login.email")}</Label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@hospital.sa"
                    className="ps-10"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t("login.password")}</Label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="ps-10"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("login.signing")}
                  </span>
                ) : t("login.submit")}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
