import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface TaggedComment {
  id: string;
  body: string;
  pageRoute: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  recipientId: string | null;
  resolved: boolean;
  resolvedAt: string | null;
}

export function TaggedCommentsDisplay() {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(true);

  const { data: comments = [] } = useQuery<TaggedComment[]>({
    queryKey: ["/api/crm/tagged-comments", location],
    queryFn: async () => {
      const res = await fetch(`/api/crm/tagged-comments?pageRoute=${encodeURIComponent(location)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  const resolveMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest("PATCH", `/api/crm/tagged-comments/${commentId}/resolve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tagged-comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
    },
  });

  const unresolvedComments = comments.filter(c => !c.resolved);

  if (unresolvedComments.length === 0) return null;

  return (
    <div className="fixed top-20 lg:top-[72px] right-4 z-30 w-80 max-h-[calc(100vh-100px)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-t-lg w-full text-left hover:bg-amber-100 transition-colors"
      >
        <MessageSquare className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <span className="text-sm font-medium text-amber-800 flex-1">
          {unresolvedComments.length} note{unresolvedComments.length !== 1 ? "s" : ""} for you
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-500" />
        )}
      </button>

      {expanded && (
        <div className="bg-white border border-t-0 border-amber-200 rounded-b-lg shadow-lg overflow-y-auto max-h-72 divide-y divide-amber-100">
          {unresolvedComments.map(comment => (
            <div key={comment.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-semibold text-slate-700">{comment.authorName}</span>
                    <span className="text-xs text-slate-400">
                      {comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) : ""}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{comment.body}</p>
                </div>
                {comment.recipientId && (
                  <button
                    onClick={() => resolveMutation.mutate(comment.id)}
                    disabled={resolveMutation.isPending}
                    className="flex-shrink-0 p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                    title="Resolve"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TaggedCommentsDisplay;
