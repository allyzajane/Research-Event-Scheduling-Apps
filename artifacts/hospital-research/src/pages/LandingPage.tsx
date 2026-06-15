import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useGetLandingPage, useListSections } from "@workspace/api-client-react";
import i18n from "i18next";
import { applyDirection } from "@/i18n/index";
import { Hospital, ArrowRight, Microscope, Heart, Users, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function LandingPage() {
  const { t } = useTranslation();
  const { data: config, isLoading: configLoading } = useGetLandingPage();
  const { data: sections, isLoading: sectionsLoading } = useListSections();

  const hospitalName = i18n.language === "ar"
    ? (config?.hospital_name_ar || config?.hospital_name || t("common.appName"))
    : (config?.hospital_name || t("common.appName"));

  const navItems = config?.nav_items || [
    { label: t("nav.home"), label_ar: "الرئيسية", href: "#home" },
    { label: t("nav.about"), label_ar: "عن المستشفى", href: "#about" },
    { label: t("nav.research"), label_ar: "الأبحاث", href: "#research" },
    { label: t("nav.contact"), label_ar: "تواصل معنا", href: "#contact" },
  ];

  const toggleLang = () => {
    const next = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(next);
    applyDirection(next);
  };

  const icons = [Microscope, Heart, Users, Award];

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-card/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config?.logo_url ? (
              <img src={config.logo_url} alt="Logo" className="h-9 w-auto object-contain" />
            ) : (
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
                <Hospital className="w-5 h-5 text-white" />
              </div>
            )}
            <span className="font-bold text-foreground text-base">{hospitalName}</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item, i) => (
              <a
                key={i}
                href={item.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                {i18n.language === "ar" && item.label_ar ? item.label_ar : item.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="px-3 py-1.5 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors"
            >
              {i18n.language === "ar" ? "EN" : "عر"}
            </button>
            <Link href="/login">
              <Button size="sm" className="text-sm">
                {t("nav.dashboard")} <ArrowRight className="w-3.5 h-3.5 ms-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section id="home" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-background" />
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {i18n.language === "ar" ? "منصة البحث الطبي" : "Medical Research Platform"}
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight mb-5">
              {hospitalName}
            </h1>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-2xl">
              {i18n.language === "ar"
                ? "منصة متكاملة لإدارة الأبحاث الطبية وتوثيق المعرفة وتعزيز التعاون بين الكوادر الطبية في مستشفى الطائف للأطفال."
                : "A comprehensive platform for managing medical research, knowledge documentation, and fostering collaboration among Taif Children's Hospital medical staff."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login">
                <Button size="lg" className="h-12 px-6 text-base font-semibold">
                  {t("nav.dashboard")} <ArrowRight className="w-4 h-4 ms-2" />
                </Button>
              </Link>
              <a href="#about">
                <Button variant="outline" size="lg" className="h-12 px-6 text-base">
                  {i18n.language === "ar" ? "اعرف المزيد" : "Learn More"}
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: i18n.language === "ar" ? "طاقم طبي" : "Medical Staff", value: "200+" },
            { label: i18n.language === "ar" ? "بحث منشور" : "Published Research", value: "50+" },
            { label: i18n.language === "ar" ? "سنة خبرة" : "Years of Excellence", value: "15+" },
            { label: i18n.language === "ar" ? "وثيقة" : "Documents", value: "500+" },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-2xl font-bold text-primary">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Dynamic sections */}
      <section id="about" className="max-w-6xl mx-auto px-6 py-20">
        {(sectionsLoading || configLoading) ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-6 space-y-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : sections && sections.length > 0 ? (
          <>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-foreground mb-3">
                {i18n.language === "ar" ? "خدماتنا وأقسامنا" : "Our Services"}
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                {i18n.language === "ar"
                  ? "تعرف على الخدمات والأقسام التي يقدمها مستشفى الطائف للأطفال"
                  : "Discover the services and departments offered by Taif Children's Hospital"}
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sections.filter(s => s.is_visible).map((section, i) => {
                const Icon = icons[i % icons.length];
                return (
                  <div key={section.id} className="group rounded-xl border border-border p-6 hover:border-primary/40 hover:shadow-md transition-all bg-card">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">
                      {i18n.language === "ar" && section.title_ar ? section.title_ar : section.title}
                    </h3>
                    {(section.description || section.description_ar) && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {i18n.language === "ar" && section.description_ar
                          ? section.description_ar
                          : section.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Microscope, en: "Research Excellence", ar: "التميز البحثي", desc: "Leading medical research in pediatric care.", descAr: "رائدون في البحث الطبي لرعاية الأطفال." },
              { icon: Heart, en: "Patient Care", ar: "رعاية المرضى", desc: "Compassionate care for every child.", descAr: "رعاية متفانية لكل طفل." },
              { icon: Users, en: "Expert Team", ar: "فريق متخصص", desc: "Highly qualified medical professionals.", descAr: "كوادر طبية مؤهلة تأهيلاً عالياً." },
              { icon: Award, en: "Accreditation", ar: "الاعتماد", desc: "Internationally recognized standards.", descAr: "معايير معترف بها دولياً." },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-border p-6 hover:border-primary/40 hover:shadow-md transition-all bg-card">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{i18n.language === "ar" ? item.ar : item.en}</h3>
                <p className="text-sm text-muted-foreground">{i18n.language === "ar" ? item.descAr : item.desc}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Contact section */}
      <section id="contact" className="bg-primary">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            {i18n.language === "ar" ? "هل أنت من الكوادر الطبية؟" : "Are you medical staff?"}
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            {i18n.language === "ar"
              ? "تواصل مع مدير النظام للحصول على حساب خاص بك"
              : "Contact your system administrator to get your account credentials"}
          </p>
          <Link href="/login">
            <Button variant="secondary" size="lg" className="h-12 px-8 font-semibold">
              {t("login.submit")} <ArrowRight className="w-4 h-4 ms-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <Hospital className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-foreground">{hospitalName}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {i18n.language === "ar" ? "© 2026 جميع الحقوق محفوظة" : "© 2026 All rights reserved"}
          </p>
        </div>
      </footer>
    </div>
  );
}
