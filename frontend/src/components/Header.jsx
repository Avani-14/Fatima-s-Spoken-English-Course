import { Link, useLocation } from "react-router-dom";
import { GraduationCap } from "lucide-react";

export const Header = () => {
  const location = useLocation();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" data-testid="header-logo" className="flex items-center gap-2 group">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap size={20} strokeWidth={2} />
          </span>
          <span className="font-heading font-bold text-base sm:text-lg leading-tight text-foreground">
            Fatima's Spoken English Centre
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {location.pathname !== "/enrol" && (
            <Link
              to="/enrol"
              data-testid="header-enrol-link"
              className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Enrol Now
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
