import { User } from "lucide-react";
import MobileShell from "./mobile-shell";

export default function MobileProfile() {
  return (
    <MobileShell>
      <div 
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="mobile-profile-placeholder"
      >
        <User className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-700 mb-2">Profile</h2>
        <p className="text-slate-500">
          Profile settings coming soon.
        </p>
      </div>
    </MobileShell>
  );
}
