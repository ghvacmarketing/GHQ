import { useState, useEffect, useCallback, useRef } from "react";
import { processPendingMutations, hasPendingMutations, getPendingMutationCount, getPendingMutationsForWorkOrder } from "@/lib/offline-queue";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { CloudOff, RefreshCw, AlertCircle } from "lucide-react";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isFromCache, setIsFromCache] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const hasProcessedRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (!hasPendingMutations() || isSyncing) return;

    setIsSyncing(true);
    let successCount = 0;
    let failCount = 0;
    const affectedWorkOrderIds = new Set<number>();

    try {
      await processPendingMutations((result) => {
        if (result.success) {
          successCount++;
          if (result.workOrderId) {
            affectedWorkOrderIds.add(result.workOrderId);
          }
        } else {
          failCount++;
        }
      });

      if (successCount > 0) {
        toast({
          title: "Changes synced",
          description: `${successCount} offline change${successCount > 1 ? 's' : ''} synced successfully`,
        });
        
        queryClient.invalidateQueries({ queryKey: ["/api/crm/work-orders"] });
        
        affectedWorkOrderIds.forEach(workOrderId => {
          queryClient.invalidateQueries({ 
            queryKey: ["/api/crm/work-orders", String(workOrderId)] 
          });
        });
        
        await queryClient.refetchQueries({ 
          queryKey: ["/api/crm/work-orders"],
          type: 'active',
        });
      }

      if (failCount > 0) {
        toast({
          title: "Some changes failed to sync",
          description: `${failCount} change${failCount > 1 ? 's' : ''} could not be synced`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error processing offline queue:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, toast]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      hasProcessedRef.current = false;
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && !hasProcessedRef.current && hasPendingMutations()) {
      hasProcessedRef.current = true;
      const timer = setTimeout(() => {
        processQueue();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, processQueue]);

  return { isOnline, isFromCache, setIsFromCache, isSyncing, processQueue };
}

export function usePendingChanges(workOrderId?: number) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      if (workOrderId) {
        setCount(getPendingMutationsForWorkOrder(workOrderId).length);
      } else {
        setCount(getPendingMutationCount());
      }
    };

    updateCount();
    
    window.addEventListener('offline-queue-updated', updateCount);
    window.addEventListener('storage', updateCount);
    
    return () => {
      window.removeEventListener('offline-queue-updated', updateCount);
      window.removeEventListener('storage', updateCount);
    };
  }, [workOrderId]);

  return count;
}

export function OfflineIndicator() {
  const { isOnline, isSyncing } = useOnlineStatus();
  const pendingCount = usePendingChanges();

  if (isOnline && !isSyncing && pendingCount === 0) return null;

  if (isSyncing) {
    return (
      <div
        className="bg-blue-500 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2"
        data-testid="syncing-indicator"
      >
        <RefreshCw className="w-4 h-4 animate-spin" />
        Syncing {pendingCount} change{pendingCount !== 1 ? 's' : ''}...
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2"
        data-testid="offline-indicator"
      >
        <CloudOff className="w-4 h-4" />
        You're offline
        {pendingCount > 0 && ` - ${pendingCount} change${pendingCount !== 1 ? 's' : ''} pending`}
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div
        className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2"
        data-testid="pending-changes-indicator"
      >
        <AlertCircle className="w-4 h-4" />
        {pendingCount} change{pendingCount !== 1 ? 's' : ''} waiting to sync
      </div>
    );
  }

  return null;
}

export function PendingChangesBadge({ workOrderId }: { workOrderId?: number }) {
  const count = usePendingChanges(workOrderId);

  if (count === 0) return null;

  return (
    <span 
      className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-amber-500 rounded-full"
      data-testid="pending-changes-badge"
    >
      {count}
    </span>
  );
}
