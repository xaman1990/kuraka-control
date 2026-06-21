import { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

interface NavItemProps {
  label: string;
  icon?: ReactNode | null;
  active?: boolean;
  href?: string | null;
}

/**
 * NavItem — a single navigation link or button in the sidebar/nav.
 * Active state: --text + left-border in --accent.
 * Idle state: --text-2, --surface-2 on hover (via Tailwind hover utility).
 * No hard-coded colors (AC-G2).
 */
export function NavItem({ label, icon = null, active = false, href = null }: NavItemProps) {
  const baseClass =
    "flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium text-left border-l-2 hover:bg-surface-2 transition-colors";

  const content = (
    <>
      {icon !== null && (
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {icon}
        </span>
      )}
      <span>{label}</span>
    </>
  );

  const style: CSSProperties = {
    color: active ? "var(--text)" : "var(--text-2)",
    borderLeftColor: active ? "var(--accent)" : "transparent",
  };

  if (href !== null) {
    return (
      <Link
        to={href}
        className={baseClass}
        style={style}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={baseClass}
      style={style}
      aria-current={active ? "page" : undefined}
      aria-disabled="true"
    >
      {content}
    </button>
  );
}
