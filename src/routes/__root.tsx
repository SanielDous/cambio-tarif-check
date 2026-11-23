import { useCallback, useEffect, useState } from "react";
import { createRootRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageDrop } from "@/features/import/page-drop";
import { REPOSITORY_URL } from "@/lib/links";

type Theme = "light" | "dark" | "system";

function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && query.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);
  return [theme, setTheme] as const;
}

function LanguageSwitch() {
  const { t, i18n } = useTranslation("common");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("language.label")}>
          <Languages />
          {i18n.language.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void i18n.changeLanguage("de")}>
          {t("language.de")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void i18n.changeLanguage("en")}>
          {t("language.en")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeSwitch({ onChange }: { onChange: (theme: Theme) => void }) {
  const { t } = useTranslation("common");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t("theme.label")}>
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onChange("light")}>
          <Sun /> {t("theme.light")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange("dark")}>
          <Moon /> {t("theme.dark")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange("system")}>
          <Monitor /> {t("theme.system")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RootLayout() {
  const { t } = useTranslation("common");
  const [, setTheme] = useTheme();
  const navigate = useNavigate();
  // Files dropped on another page are read all the same; the result is on the start page.
  const showResult = useCallback(() => void navigate({ to: "/" }), [navigate]);
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4">
      <PageDrop onFiles={showResult} />
      <header className="flex items-center justify-between gap-4 border-b py-4">
        <nav className="flex gap-4 text-sm">
          <Link to="/" className="[&.active]:font-semibold">
            {t("nav.home")}
          </Link>
          <Link to="/how-it-works" className="[&.active]:font-semibold">
            {t("nav.howItWorks")}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <ThemeSwitch onChange={setTheme} />
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t py-4 text-sm text-muted-foreground">
        <span>{t("footer.version", { version: __APP_VERSION__ })}</span>
        <span>{t("footer.disclaimer")}</span>
        <a className="underline" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          {t("footer.repository")}
        </a>
      </footer>
    </div>
  );
}

export const rootRoute = createRootRoute({ component: RootLayout });
