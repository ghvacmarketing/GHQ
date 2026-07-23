import * as React from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string }>;

/** Consistent page width + responsive gutters + vertical rhythm. */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6", className)}>
      {children}
    </div>
  );
}

/** Page title row: title (display face), description, actions.
 *  The `icon` prop is accepted for backward-compatibility but no longer rendered —
 *  the section icon already lives in the nav, so page titles stay icon-free. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: IconType;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground truncate">
          {title}
        </h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** KPI tile. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "primary",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: IconType;
  hint?: React.ReactNode;
  tone?: "primary" | "neutral" | "success" | "warning" | "danger";
  className?: string;
}) {
  // `tone` kept for API compatibility, but KPI icons use ONE consistent
  // neutral treatment so the row reads intentional (not rainbow-colored).
  void tone;
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
          )}
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Card with an optional titled header and a body. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  noBodyPadding,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  noBodyPadding?: boolean;
}) {
  const hasHeader = title || action;
  return (
    <Card className={className}>
      {hasHeader && (
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border p-5 py-4">
          <div className="min-w-0">
            {title && <CardTitle className="text-base">{title}</CardTitle>}
            {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </CardHeader>
      )}
      <CardContent className={cn(noBodyPadding ? "p-0" : "p-5", hasHeader && !noBodyPadding && "pt-5", bodyClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

/** Centered empty state — icon, title, message, optional action. */
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  className,
}: {
  icon?: IconType;
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Renders the right thing for the data's actual state:
 * loading → skeleton, empty → empty state, otherwise the children.
 * Keeps previews honest (no fake clutter when there's no/one record).
 */
export function DataState({
  isLoading,
  isEmpty,
  skeleton,
  empty,
  children,
}: {
  isLoading?: boolean;
  isEmpty?: boolean;
  skeleton: React.ReactNode;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}

/** Search input + optional filter controls. */
export function FilterBar({
  search,
  onSearchChange,
  placeholder = "Search…",
  children,
  className,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      {onSearchChange && (
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="h-9 rounded-full border-transparent bg-white pl-9 text-sm shadow-sm"
          />
        </div>
      )}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
