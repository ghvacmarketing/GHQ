import { useState, useEffect } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { CrmLayout } from "@/components/crm/crm-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import {
  Megaphone,
  Star,
  MessageSquare,
  Send,
  Settings,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import type { CrmUser, MarketingCampaign } from "@shared/schema";

interface ReviewAutomationSettings {
  enabled: boolean;
  googleReviewLink: string;
  messageTemplate: string;
}

export default function CrmMarketing() {
  usePageTitle("Marketing Automation");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [reviewLink, setReviewLink] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [reviewEnabled, setReviewEnabled] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<MarketingCampaign[]>({
    queryKey: ["/api/crm/marketing/campaigns"],
    enabled: !!currentUser,
  });

  const { data: reviewSettings, isLoading: settingsLoading } = useQuery<ReviewAutomationSettings>({
    queryKey: ["/api/admin/settings/review-automation"],
    enabled: !!currentUser && (currentUser.role === "owner" || currentUser.role === "admin"),
  });

  useEffect(() => {
    if (reviewSettings) {
      setReviewLink(reviewSettings.googleReviewLink);
      setMessageTemplate(reviewSettings.messageTemplate);
      setReviewEnabled(reviewSettings.enabled);
    }
  }, [reviewSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<ReviewAutomationSettings>) => {
      const res = await apiRequest("PUT", "/api/admin/settings/review-automation", settings);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/review-automation"] });
      setHasChanges(false);
      toast({ title: "Settings saved", description: "Review automation settings updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    },
  });

  const triggerReviewsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/trigger-review-requests");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/marketing/campaigns"] });
      toast({
        title: "Review requests processed",
        description: `Sent ${data.summary?.sent || 0} review requests`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to process review requests", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  if (authLoading) {
    return (
      <CrmLayout currentUser={currentUser as CrmUser}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </CrmLayout>
    );
  }

  if (!currentUser) {
    return null;
  }

  const isAdmin = currentUser.role === "owner" || currentUser.role === "admin";
  const reviewCampaign = campaigns.find(c => c.type === "review_request");

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate({
      enabled: reviewEnabled,
      googleReviewLink: reviewLink,
      messageTemplate: messageTemplate,
    });
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setHasChanges(true);
    if (field === "reviewLink") setReviewLink(value as string);
    if (field === "messageTemplate") setMessageTemplate(value as string);
    if (field === "enabled") setReviewEnabled(value as boolean);
  };

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" data-testid="text-page-title">
            Marketing Automation
          </h1>
          <p className="text-sm text-slate-500">
            Automated campaigns and customer engagement
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Star className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-700">{reviewCampaign?.totalSent || 0}</p>
                  <p className="text-xs text-amber-600">Review Requests Sent</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700">
                    {reviewCampaign?.isActive ? "Active" : "Inactive"}
                  </p>
                  <p className="text-xs text-green-600">Automation Status</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-700">
                    {reviewCampaign?.lastSentAt 
                      ? formatDistanceToNow(new Date(reviewCampaign.lastSentAt), { addSuffix: true })
                      : "Never"
                    }
                  </p>
                  <p className="text-xs text-blue-600">Last Sent</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Star className="h-4 w-4 text-amber-500" />
                    Google Review Requests
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Automatically request reviews 2 hours after work order completion
                  </CardDescription>
                </div>
                <Badge variant={reviewCampaign?.isActive !== false ? "default" : "secondary"}>
                  {reviewCampaign?.isActive !== false ? "Active" : "Paused"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                <div>
                  <p className="text-sm font-medium text-slate-700">Total Requests Sent</p>
                  <p className="text-xs text-slate-500">Since campaign started</p>
                </div>
                <p className="text-2xl font-bold text-slate-800">{reviewCampaign?.totalSent || 0}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border">
                  <p className="text-xs text-slate-500">Delay After Completion</p>
                  <p className="text-sm font-medium text-slate-700">2 hours</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border">
                  <p className="text-xs text-slate-500">Cooldown Period</p>
                  <p className="text-sm font-medium text-slate-700">6 months</p>
                </div>
              </div>

              {reviewCampaign?.lastSentAt && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-green-600" />
                    <p className="text-sm text-green-700">
                      Last sent {format(new Date(reviewCampaign.lastSentAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              )}

              {isAdmin && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => triggerReviewsMutation.mutate()}
                  disabled={triggerReviewsMutation.isPending}
                >
                  {triggerReviewsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Run Now
                </Button>
              )}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-4 w-4 text-slate-600" />
                  Review Automation Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {settingsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                      <div>
                        <Label className="text-sm font-medium">Enable Review Requests</Label>
                        <p className="text-xs text-slate-500">Send automated review requests after completed jobs</p>
                      </div>
                      <Switch
                        checked={reviewEnabled}
                        onCheckedChange={(checked) => handleInputChange("enabled", checked)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="review-link" className="text-sm">Google Review Link</Label>
                      <div className="flex gap-2">
                        <Input
                          id="review-link"
                          placeholder="https://g.page/r/your-business/review"
                          value={reviewLink}
                          onChange={(e) => handleInputChange("reviewLink", e.target.value)}
                        />
                        {reviewLink && (
                          <Button variant="outline" size="icon" asChild>
                            <a href={reviewLink} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        Get your link from Google Business Profile
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message-template" className="text-sm">Message Template</Label>
                      <Textarea
                        id="message-template"
                        placeholder="Thanks for choosing us! Please leave a review: {reviewLink}"
                        value={messageTemplate}
                        onChange={(e) => handleInputChange("messageTemplate", e.target.value)}
                        rows={3}
                      />
                      <p className="text-xs text-slate-500">
                        Use {"{reviewLink}"} to insert the Google review link
                      </p>
                    </div>

                    {!reviewLink && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-700">Review link required</p>
                          <p className="text-xs text-amber-600">Add your Google review link to enable automation</p>
                        </div>
                      </div>
                    )}

                    <Button
                      className="w-full bg-[#711419] hover:bg-[#5a1014]"
                      onClick={handleSaveSettings}
                      disabled={saveSettingsMutation.isPending || !hasChanges}
                    >
                      {saveSettingsMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Save Settings
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-[#711419]" />
              All Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {campaignsLoading ? (
              <div className="p-6">
                <Skeleton className="h-20 w-full" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12">
                <Megaphone className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No campaigns yet</p>
                <p className="text-slate-400 text-xs mt-1">
                  Campaigns will appear here as automations run
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        campaign.type === "review_request" ? "bg-amber-100" :
                        campaign.type === "follow_up" ? "bg-blue-100" : "bg-purple-100"
                      }`}>
                        {campaign.type === "review_request" ? (
                          <Star className="h-4 w-4 text-amber-600" />
                        ) : campaign.type === "follow_up" ? (
                          <MessageSquare className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Megaphone className="h-4 w-4 text-purple-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800">{campaign.name}</p>
                        <p className="text-xs text-slate-500">{campaign.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-700">{campaign.totalSent} sent</p>
                        {campaign.lastSentAt && (
                          <p className="text-xs text-slate-500">
                            Last: {formatDistanceToNow(new Date(campaign.lastSentAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                      <Badge variant={campaign.isActive ? "default" : "secondary"}>
                        {campaign.isActive ? "Active" : "Paused"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
