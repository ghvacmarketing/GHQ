import { useLocation } from "wouter";
import { IndustrialTabs } from "@/components/crm/industrial-tabs";

/** The Inbox channel tabs — Chat | Mail in the house rectangular tab style
 *  (same machined segmented cluster as the rest of the CRM), with live
 *  unread counts. Chat sits on the left. One tap flips channels. */
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
  return (
    <div className="flex justify-center" data-testid="inbox-switcher">
      <IndustrialTabs
        testidPrefix="inbox-seg"
        activeKey={active}
        onSelect={(k) => {
          if (k !== active) navigate(k === "chat" ? "/mobile/messages" : "/mobile/mail");
        }}
        tabs={[
          { key: "chat", label: "Messages", count: chatCount || null },
          { key: "mail", label: "Mail", count: mailCount || null },
        ]}
      />
    </div>
  );
}
