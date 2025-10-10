import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, ChevronDown, ChevronUp, FileText, Calendar, User, ArrowLeft, Plus } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Quote } from "@shared/schema";
import trelloIcon from "@assets/trello_1757379276597.png";
import redlogo from "@assets/redlogo.webp";

export default function QuotesHistory() {
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: quotesData, isLoading } = useQuery<{ quotes: Quote[]; pagination: any }>({
    queryKey: ["/api/quotes"],
  });

  const quotes = quotesData?.quotes || [];

  // Mutation to update quote status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ quoteId, status }: { quoteId: string; status: string }) => {
      return apiRequest('PATCH', `/api/quotes/${quoteId}`, { status });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      toast({
        title: "Quote Updated",
        description: `Quote status changed to ${status}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update quote status",
        variant: "destructive",
      });
    },
  });

  // Sort quotes by most recent first
  const sortedQuotes = [...quotes].sort((a, b) => 
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const toggleQuote = (quoteId: string) => {
    const newExpanded = new Set(expandedQuotes);
    if (newExpanded.has(quoteId)) {
      newExpanded.delete(quoteId);
    } else {
      newExpanded.add(quoteId);
    }
    setExpandedQuotes(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "draft": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
      default: return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-3 sm:p-6 max-w-md md:max-w-2xl lg:max-w-5xl">
        <Card className="slide-in">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center mb-6">
              <History className="text-primary mr-3 h-6 w-6" />
              <h1 className="text-2xl font-bold text-card-foreground">Quote History</h1>
            </div>
            <div className="space-y-3 sm:space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border border-border rounded-lg p-4">
                  <Skeleton className="h-6 w-64 mb-2" />
                  <Skeleton className="h-4 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="container mx-auto p-3 sm:p-6 max-w-md md:max-w-2xl lg:max-w-5xl">
        <Card className="slide-in">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center mb-6">
              <History className="text-primary mr-3 h-6 w-6" />
              <h1 className="text-2xl font-bold text-card-foreground">Quote History</h1>
            </div>
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-card-foreground mb-2">No quotes yet</h3>
              <p className="text-muted-foreground">Start creating quotes to see them here.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <div className="min-w-0">
              <h1 className="font-semibold text-foreground text-sm sm:text-base truncate">Quote History</h1>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <Badge variant="secondary" className="text-xs sm:text-sm">
              {quotes.length}
            </Badge>
            <Link href="/quote">
              <Button variant="default" size="sm" className="flex items-center space-x-1 sm:space-x-2 h-9">
                <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">New Quote</span>
                <span className="sm:hidden">New</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <main className="container mx-auto p-3 sm:p-6 max-w-md md:max-w-2xl lg:max-w-5xl">
        <Card className="slide-in">
          <CardContent className="p-3 sm:p-6">

          <div className="space-y-3 sm:space-y-4">
            {sortedQuotes.map((quote) => (
              <div
                key={quote.id}
                className="border border-border rounded-lg transition-all duration-200 hover:shadow-md"
                data-testid={`quote-tile-${quote.id}`}
              >
                <div
                  className="p-3 sm:p-4 cursor-pointer"
                  onClick={() => toggleQuote(quote.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                      <h3 className="font-semibold text-card-foreground text-base sm:text-lg truncate">
                        {quote.customerName}
                      </h3>
                      <Badge className={getStatusColor(quote.status || 'draft') + " text-xs"}>
                        {(quote.status || 'draft').charAt(0).toUpperCase() + (quote.status || 'draft').slice(1)}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="text-base sm:text-xl font-bold text-primary">
                        ${quote.total}
                      </span>
                      {expandedQuotes.has(quote.id) ? (
                        <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-6 text-xs sm:text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <User className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                      <span className="truncate">{quote.technician}</span>
                    </div>
                    <div className="flex items-center justify-between sm:justify-start">
                      <div className="flex items-center">
                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        <span className="text-xs sm:text-sm">{formatDate((quote.createdAt || new Date()).toString())}</span>
                      </div>
                      <div className="flex items-center sm:ml-4">
                        <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        <span>{quote.parts.length} part{quote.parts.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {expandedQuotes.has(quote.id) && (
                  <div className="border-t border-border p-3 sm:p-4 bg-muted/20">
                    <div className="grid grid-cols-1 gap-4 sm:gap-6">
                      {/* Parts List */}
                      <div>
                        <h4 className="font-medium text-card-foreground mb-3">Parts & Services</h4>
                        <div className="space-y-2">
                          {quote.parts.map((part, index) => (
                            <div key={index} className="text-sm">
                              <div className="flex justify-between">
                                <span className="text-card-foreground">{part.description}</span>
                                <span className="text-muted-foreground">
                                  ${part.price} × {part.quantity || 1}
                                </span>
                              </div>
                              {part.partNumber && (
                                <div className="text-xs text-muted-foreground">
                                  Part #: {part.partNumber}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Quote Summary */}
                      <div>
                        <h4 className="font-medium text-card-foreground mb-3">Quote Summary</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Parts Subtotal:</span>
                            <span className="text-card-foreground">${quote.subtotal}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Labor:</span>
                            <span className="text-card-foreground">${quote.labor}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tax:</span>
                            <span className="text-card-foreground">${quote.tax}</span>
                          </div>
                          <div className="border-t border-border pt-2 mt-2">
                            <div className="flex justify-between font-semibold">
                              <span className="text-card-foreground">Total:</span>
                              <span className="text-primary text-lg">${quote.total}</span>
                            </div>
                          </div>
                        </div>

                        {quote.jobNotes && (
                          <div className="mt-4">
                            <h5 className="font-medium text-card-foreground mb-2">Job Notes</h5>
                            <p className="text-sm text-muted-foreground bg-background rounded-lg p-3 border">
                              {quote.jobNotes}
                            </p>
                          </div>
                        )}

                        {/* Status Update Actions - Only show for draft quotes */}
                        {(quote.status === 'draft' || !quote.status) && (
                          <div className="mt-4 pt-4 border-t border-border">
                            <h5 className="font-medium text-card-foreground mb-3">Update Status</h5>
                            <div className="grid grid-cols-2 gap-3">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStatusMutation.mutate({ quoteId: quote.id, status: 'accepted' });
                                }}
                                disabled={updateStatusMutation.isPending}
                                className="bg-white hover:bg-gray-50 border border-gray-200 font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                                style={{ color: '#0055cc' }}
                                data-testid={`button-mark-accepted-${quote.id}`}
                              >
                                <img src={trelloIcon} alt="Trello" className="h-4 w-4" />
                                <span>Accepted</span>
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStatusMutation.mutate({ quoteId: quote.id, status: 'pending' });
                                }}
                                disabled={updateStatusMutation.isPending}
                                className="bg-white hover:bg-gray-50 border border-gray-200 font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                                style={{ color: '#0055cc' }}
                                data-testid={`button-mark-pending-${quote.id}`}
                              >
                                <img src={trelloIcon} alt="Trello" className="h-4 w-4" />
                                <span>Pending</span>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
    </div>
  );
}