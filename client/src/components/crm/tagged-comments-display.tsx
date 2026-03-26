import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Check, ChevronDown, ChevronUp, X, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

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
  isAuthor: boolean;
  resolvedByName: string | null;
}

export function TaggedCommentsDisplay() {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(true);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hid = params.get("highlightComment");
    if (hid) setHighlightId(hid);
  }, [location]);

  const { data: comments = [] } = useQuery<TaggedComment[]>({
    queryKey: ["/api/crm/tagged-comments", location],
    queryFn: async () => {
      const cleanRoute = location.split("?")[0];
      const res = await fetch(`/api/crm/tagged-comments?pageRoute=${encodeURIComponent(cleanRoute)}`, { credentials: "include" });
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

  const dismissMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest("DELETE", `/api/crm/tagged-comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tagged-comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tagged-comments/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/notifications/unread-count"] });
    },
  });

  const visibleComments = comments.filter(c => {
    if (c.isAuthor) return true;
    return !c.resolved;
  });

  if (visibleComments.length === 0) return null;

  const unresolvedCount = visibleComments.filter(c => !c.resolved).length;

  return (
    <div className="fixed top-20 lg:top-[72px] right-4 z-30 w-80 max-h-[calc(100vh-100px)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-t-lg w-full text-left hover:bg-amber-100 transition-colors"
      >
        <MessageSquare className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <span className="text-sm font-medium text-amber-800 flex-1">
          {visibleComments.length} note{visibleComments.length !== 1 ? "s" : ""} on this page
          {unresolvedCount > 0 && unresolvedCount < visibleComments.length && (
            <span className="text-amber-500 font-normal"> ({unresolvedCount} open)</span>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-500" />
        )}
      </button>

      {expanded && (
        <div className="bg-white border border-t-0 border-amber-200 rounded-b-lg shadow-lg overflow-y-auto max-h-72 divide-y divide-amber-100">
          {visibleComments.map(comment => (
            <div
              key={comment.id}
              className={`p-3 transition-colors ${
                highlightId === comment.id
                  ? "bg-amber-100 ring-2 ring-amber-400"
                  : comment.isAuthor && comment.resolved
                  ? "bg-green-50/50"
                  : ""
              }`}
              data-comment-id={comment.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-semibold text-slate-700">{comment.authorName}</span>
                    {comment.isAuthor && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">you</span>
                    )}
                    <span className="text-xs text-slate-400">
                      {comment.createdAt ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true }) : ""}
                    </span>
                  </div>
                  <p className={`text-sm whitespace-pre-wrap ${comment.isAuthor && comment.resolved ? "text-slate-400" : "text-slate-600"}`}>
                    {comment.body}
                  </p>
                  {comment.isAuthor && comment.resolved && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="text-[11px] text-green-600 font-medium">
                        Resolved{comment.resolvedByName ? ` by ${comment.resolvedByName}` : ""}
                        {comment.resolvedAt ? ` ${formatDistanceToNow(new Date(comment.resolvedAt), { addSuffix: true })}` : ""}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {comment.recipientId && !comment.resolved && (
                    <button
                      onClick={() => resolveMutation.mutate(comment.id)}
                      disabled={resolveMutation.isPending}
                      className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                      title="Resolve"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {comment.isAuthor && comment.resolved && (
                    <button
                      onClick={() => dismissMutation.mutate(comment.id)}
                      disabled={dismissMutation.isPending}
                      className="p-1.5 rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TaggedCommentsDisplay;
