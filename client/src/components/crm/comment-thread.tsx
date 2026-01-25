import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link2, Pencil, Trash2, Loader2, Check, X, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { renderCommentBody } from "./comment-composer";
import type { CrmUser } from "@shared/schema";

interface CommentThreadProps {
  entityType: string;
  entityId: string;
  highlightCommentId?: string;
}

interface CommentAuthor {
  id: string;
  name: string;
  role: string;
}

interface Comment {
  id: string;
  entityType: string;
  entityId: string;
  authorId: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  author: CommentAuthor;
  mentions: { userId: string; userName: string }[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  switch (role.toLowerCase()) {
    case "owner":
    case "admin":
      return "default";
    case "sales":
    case "technician":
    case "tech":
      return "secondary";
    default:
      return "outline";
  }
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-red-500",
    "bg-blue-500",
    "bg-green-500",
    "bg-yellow-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-orange-500",
    "bg-cyan-500",
  ];
  const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function CommentSkeleton() {
  return (
    <div className="flex gap-3 p-4">
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export function CommentThread({
  entityType,
  entityId,
  highlightCommentId,
}: CommentThreadProps) {
  const { toast } = useToast();
  const [location] = useLocation();
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { data: currentUser } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["/api/crm/comments", entityType, entityId],
    enabled: !!entityType && !!entityId,
  });

  useEffect(() => {
    const hash = window.location.hash;
    const commentIdFromHash = hash.startsWith("#comment-")
      ? hash.replace("#comment-", "")
      : highlightCommentId;

    if (commentIdFromHash && comments.length > 0) {
      const commentElement = commentRefs.current.get(commentIdFromHash);
      if (commentElement) {
        setHighlightedId(commentIdFromHash);
        setTimeout(() => {
          commentElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);

        const timer = setTimeout(() => {
          setHighlightedId(null);
        }, 3000);

        return () => clearTimeout(timer);
      }
    }
  }, [comments, highlightCommentId]);

  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const response = await apiRequest("PATCH", `/api/crm/comments/${id}`, { body });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/comments", entityType, entityId] });
      setEditingCommentId(null);
      setEditBody("");
      toast({
        title: "Comment updated",
        description: "Your comment has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update comment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/crm/comments/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/comments", entityType, entityId] });
      toast({
        title: "Comment deleted",
        description: "Your comment has been deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete comment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCopyLink = useCallback((commentId: string) => {
    const baseUrl = window.location.origin;
    const currentPath = window.location.pathname;
    const deepLink = `${baseUrl}${currentPath}#comment-${commentId}`;
    
    navigator.clipboard.writeText(deepLink).then(() => {
      toast({
        title: "Link copied",
        description: "Comment link has been copied to clipboard.",
      });
    }).catch(() => {
      toast({
        title: "Error",
        description: "Failed to copy link. Please try again.",
        variant: "destructive",
      });
    });
  }, [toast]);

  const handleStartEdit = useCallback((comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditBody(comment.body);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingCommentId(null);
    setEditBody("");
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingCommentId || !editBody.trim()) return;
    updateCommentMutation.mutate({ id: editingCommentId, body: editBody });
  }, [editingCommentId, editBody, updateCommentMutation]);

  const canEditOrDelete = useCallback(
    (comment: Comment) => {
      if (!currentUser) return false;
      return (
        comment.authorId === currentUser.id ||
        currentUser.role === "admin" ||
        currentUser.role === "owner"
      );
    },
    [currentUser]
  );

  if (isLoading) {
    return (
      <div className="space-y-0 divide-y">
        <CommentSkeleton />
        <CommentSkeleton />
        <CommentSkeleton />
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">No comments yet. Be the first to comment!</p>
      </div>
    );
  }

  const sortedComments = [...comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="space-y-0 divide-y">
      {sortedComments.map((comment) => {
        const isHighlighted = highlightedId === comment.id;
        const isEditing = editingCommentId === comment.id;
        const canModify = canEditOrDelete(comment);

        return (
          <div
            key={comment.id}
            ref={(el) => {
              if (el) commentRefs.current.set(comment.id, el);
            }}
            className={`group p-4 transition-all duration-300 ${
              isHighlighted
                ? "bg-muted border-l-4 border-primary"
                : "hover:bg-muted/50"
            }`}
          >
            <div className="flex gap-3">
              <Avatar className={`h-10 w-10 flex-shrink-0 ${getAvatarColor(comment.author?.name || "U")}`}>
                <AvatarFallback className="text-white text-sm font-medium">
                  {getInitials(comment.author?.name || "Unknown")}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {comment.author?.name || "Unknown User"}
                  </span>
                  <Badge
                    variant={getRoleBadgeVariant(comment.author?.role || "user")}
                    className="text-xs capitalize"
                  >
                    {comment.author?.role || "user"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </span>
                  {comment.editedAt && (
                    <span className="text-xs text-muted-foreground italic">(edited)</span>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="min-h-[80px] resize-none"
                      placeholder="Edit your comment..."
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={!editBody.trim() || updateCommentMutation.isPending}
                      >
                        {updateCommentMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={updateCommentMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                    {renderCommentBody(comment.body, comment.mentions || [])}
                  </div>
                )}

                {!isEditing && (
                  <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleCopyLink(comment.id)}
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Copy link
                    </Button>

                    {canModify && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleStartEdit(comment)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Edit
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Comment</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this comment? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteCommentMutation.mutate(comment.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deleteCommentMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : null}
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
