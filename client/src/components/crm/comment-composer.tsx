import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CommentComposerProps {
  entityType: string;
  entityId: string;
  onCommentPosted?: () => void;
  placeholder?: string;
}

interface SearchUser {
  id: string;
  name: string;
  role: string;
  email: string;
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
      return "secondary";
    default:
      return "outline";
  }
}

export function renderCommentBody(
  body: string,
  mentions: { userId: string; userName: string }[]
): React.ReactNode {
  if (!body) return null;

  const mentionMap = new Map(mentions.map((m) => [m.userId, m.userName]));
  const mentionPattern = /@\[([^\]]+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }

    const userId = match[1];
    const userName = mentionMap.get(userId) || "Unknown User";

    parts.push(
      <span
        key={`mention-${match.index}`}
        className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-sm font-medium"
      >
        @{userName}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return parts.length > 0 ? parts : body;
}

export function CommentComposer({
  entityType,
  entityId,
  onCommentPosted,
  placeholder = "Write a comment… Use @ to mention a teammate.",
}: CommentComposerProps) {
  const [value, setValue] = useState("");
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [insertedMentions, setInsertedMentions] = useState<Map<string, string>>(new Map());
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const { data: users = [], isFetching: isSearching } = useQuery<SearchUser[]>({
    queryKey: [`/api/crm/users/search?q=${encodeURIComponent(mentionQuery)}`],
    enabled: showMentionPicker && mentionQuery.length > 0,
    staleTime: 30000,
  });

  const postCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      const response = await apiRequest("POST", "/api/crm/comments", {
        entityType,
        entityId,
        body,
      });
      return response.json();
    },
    onSuccess: () => {
      setValue("");
      setInsertedMentions(new Map());
      queryClient.invalidateQueries({ queryKey: ["/api/crm/comments", entityType, entityId] });
      onCommentPosted?.();
    },
  });

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    setValue(newValue);

    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      const hasSpace = /\s/.test(textAfterAt);
      const isValidMention = !hasSpace && atIndex === textBeforeCursor.length - 1 - textAfterAt.length;

      if (isValidMention && (atIndex === 0 || /\s/.test(textBeforeCursor[atIndex - 1]))) {
        setShowMentionPicker(true);
        setMentionQuery(textAfterAt);
        setMentionStartIndex(atIndex);
        setSelectedIndex(0);
        return;
      }
    }

    setShowMentionPicker(false);
    setMentionQuery("");
    setMentionStartIndex(null);
  }, []);

  const insertMention = useCallback((user: SearchUser) => {
    if (mentionStartIndex === null || !textareaRef.current) return;

    const before = value.slice(0, mentionStartIndex);
    const after = value.slice(mentionStartIndex + 1 + mentionQuery.length);
    const mentionToken = `@[${user.id}]`;
    const newValue = before + mentionToken + " " + after;

    setValue(newValue);
    setInsertedMentions((prev) => new Map(prev).set(user.id, user.name));
    setShowMentionPicker(false);
    setMentionQuery("");
    setMentionStartIndex(null);

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + mentionToken.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [mentionStartIndex, mentionQuery, value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentionPicker) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, users.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        if (users.length > 0 && selectedIndex < users.length) {
          e.preventDefault();
          insertMention(users[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowMentionPicker(false);
        setMentionQuery("");
        setMentionStartIndex(null);
        break;
      case "Tab":
        if (users.length > 0) {
          e.preventDefault();
          insertMention(users[selectedIndex]);
        }
        break;
    }
  }, [showMentionPicker, users, selectedIndex, insertMention]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowMentionPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedIndex >= users.length && users.length > 0) {
      setSelectedIndex(users.length - 1);
    }
  }, [users.length, selectedIndex]);

  const handlePost = () => {
    if (!value.trim()) return;
    postCommentMutation.mutate(value);
  };

  const renderDisplayValue = () => {
    if (!value) return null;
    const mentions = Array.from(insertedMentions.entries()).map(([userId, userName]) => ({
      userId,
      userName,
    }));
    return renderCommentBody(value, mentions);
  };

  const isButtonDisabled = !value.trim() || postCommentMutation.isPending;

  return (
    <div className="relative">
      <div className="space-y-3">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[100px] resize-none"
          />

          {showMentionPicker && (
            <Card
              ref={pickerRef}
              className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[200px] overflow-y-auto shadow-lg"
            >
              {isSearching ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : users.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {mentionQuery ? "No users found" : "Type to search users..."}
                </div>
              ) : (
                <div className="py-1">
                  {users.map((user, index) => (
                    <button
                      key={user.id}
                      type="button"
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors ${
                        index === selectedIndex ? "bg-muted" : ""
                      }`}
                      onClick={() => insertMention(user)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{user.name}</div>
                      </div>
                      <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs capitalize">
                        {user.role}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {insertedMentions.size > 0 && (
              <span>
                Mentioning: {Array.from(insertedMentions.values()).join(", ")}
              </span>
            )}
          </div>
          <Button
            onClick={handlePost}
            disabled={isButtonDisabled}
            size="sm"
          >
            {postCommentMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Posting...
              </>
            ) : (
              "Post"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
