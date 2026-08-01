import { useLocation } from "wouter";

/** The Inbox channel tabs — Messages | Mail in the same pill switcher style
 *  as Time's Clock | Timesheet, stretched across the full width, with
 *  discreet unread dots. Messages sits on the left. One tap flips channels. */
export function InboxSwitcher({
  active,
  mailCount = 0,
  chatCount = 0,
}: {
  active: "mail" | "chat";
  mailCount?: number;
  chatCount?: number;
}) {
  const [, navigate] = useLocation();
  const tabs = [
    { key: "chat" as const, label: "Messages", count: chatCount },
    { key: "mail" as const, label: "Mail", count: mailCount },
  ];
  return (
    <div className="flex w-full items-center gap-1 rounded-lg bg-slate-200/70 p-1" data-testid="inbox-switcher">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => {
            if (t.key !== active) navigate(t.key === "chat" ? "/mobile/messages" : "/mobile/mail");
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
            active === t.key ? "bg-white text-[#711419] shadow-sm" : "text-slate-500"
          }`}
          data-testid={`inbox-seg-${t.key}`}
        >
          {t.label}
          {t.count > 0 && (
            <span className="text-[11px] font-bold tabular-nums text-[#711419]" aria-label={`${t.count} unread`}>
              {t.count > 99 ? "99+" : t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
