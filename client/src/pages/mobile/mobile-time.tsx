import { Clock } from "lucide-react";
import MobileShell from "./mobile-shell";

export default function MobileTime() {
  return (
    <MobileShell>
      <div 
        className="flex flex-col items-center justify-center h-full p-8 text-center"
        data-testid="mobile-time-placeholder"
      >
        <Clock className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-700 mb-2">Time Tracking</h2>
        <p className="text-slate-500">
          Time tracking features coming soon.
        </p>
      </div>
    </MobileShell>
  );
}
