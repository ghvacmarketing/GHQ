import { useLocation } from "wouter";
import { Mail, MessageCircle } from "lucide-react";

/** The Inbox segmented pill — Mail | Chat with live unread counts, styled
 *  after the reference: a rounded track with the active segment outlined.
 *  Both mobile surfaces (/mobile/mail and /mobile/messages) render it under
 *  a shared "Inbox" title, so flipping channels is one tap. */
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
  const seg = (key: "mail" | "chat", label: string, Icon: typeof Mail, count: number, href: string) => {
    const isActive = active === key;
    return (
      <button
        onClick={() => !isActive && navigate(href)}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold transition-all ${
          isActive
            ? "border border-[#711419]/50 bg-white text-slate-900 shadow-sm"
            : "border border-transparent text-slate-500"
        }`}
        data-testid={`inbox-seg-${key}`}
      >
        <Icon className={`h-4 w-4 ${isActive ? "text-[#711419]" : ""}`} />
        {label}
        {count > 0 && (
          <span className={`text-xs font-bold tabular-nums ${isActive ? "text-[#711419]" : "text-slate-400"}`}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    );
  };
  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-200/70 p-1" data-testid="inbox-switcher">
      {seg("mail", "Mail", Mail, mailCount, "/mobile/mail")}
      {seg("chat", "Chat", MessageCircle, chatCount, "/mobile/messages")}
    </div>
  );
}
