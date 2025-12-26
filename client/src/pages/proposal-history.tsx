import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, FileText, Calendar, User, ChevronDown, ChevronUp, Trash2, DollarSign, Package, Crown, Wrench, Home as HomeIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { SavedProposal } from "@shared/schema";

export default function ProposalHistory() {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: proposals = [], isLoading } = useQuery<SavedProposal[]>({
    queryKey: ["/api/saved-proposals"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/saved-proposals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-proposals"] });
      setDeleteId(null);
      toast({ title: "Proposal deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete proposal", variant: "destructive" });
    },
  });

  const sortedProposals = [...proposals].sort((a, b) => 
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "expired": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    }
  };

  const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    return `$${num.toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Proposal History</h1>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : proposals.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No saved proposals yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Generate a quote in the Proposal Builder and click "Save Quote" to save it here.
              </p>
              <Link href="/proposal">
                <Button className="mt-4" data-testid="button-go-to-proposal">
                  Go to Proposal Builder
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedProposals.map((proposal) => {
              const isExpanded = expandedId === proposal.id;
              let quoteData: any = null;
              try {
                quoteData = JSON.parse(proposal.quoteData);
              } catch (e) {}

              return (
                <Card key={proposal.id} data-testid={`card-proposal-${proposal.id}`}>
                  <CardContent className="p-4">
                    <div 
                      className="flex items-start justify-between cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate" data-testid={`text-proposal-title-${proposal.id}`}>
                            {proposal.quoteTitle}
                          </h3>
                          <Badge className={getStatusColor(proposal.status)}>
                            {proposal.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-3.5 w-3.5" />
                          <span>{proposal.customerName}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {proposal.createdAt && format(new Date(proposal.createdAt), "MMM d, yyyy")}
                          </div>
                          <div className="flex items-center gap-1 font-medium text-primary">
                            <DollarSign className="h-3.5 w-3.5" />
                            {formatPrice(proposal.total)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(proposal.id);
                          }}
                          data-testid={`button-delete-${proposal.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {isExpanded && quoteData && (
                      <div className="mt-4 pt-4 border-t space-y-4">
                        {proposal.packageDescription && (
                          <p className="text-sm text-muted-foreground">{proposal.packageDescription}</p>
                        )}

                        {/* Equipment/Cart Items with Images */}
                        {quoteData.cartItems && quoteData.cartItems.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1">
                              <Package className="h-3.5 w-3.5" />
                              EQUIPMENT SELECTED
                            </p>
                            <div className="space-y-3">
                              {quoteData.cartItems.map((item: any, idx: number) => {
                                if (item.type === "crawlspace") {
                                  return (
                                    <div key={idx} className="p-3 rounded-lg border bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800">
                                      <div className="flex items-center gap-2 mb-2">
                                        <HomeIcon className="h-4 w-4 text-teal-600" />
                                        <span className="font-medium">{item.tierName} Crawlspace Encapsulation</span>
                                        {item.isElite && (
                                          <Badge className="bg-amber-500 text-white text-xs">
                                            <Crown className="h-3 w-3 mr-1" />
                                            Elite
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground">{item.milThickness} Mil Vapor Barrier • {item.bandSqft} sqft</p>
                                      <div className="flex justify-between mt-2 text-sm">
                                        <span>Qty: {item.quantity}</span>
                                        <span className="font-bold text-teal-600">{formatPrice(item.isElite ? item.eliteFinalTotal * item.quantity : item.totalPrice * item.quantity)}</span>
                                      </div>
                                    </div>
                                  );
                                } else if (item.type === "custom") {
                                  return (
                                    <div key={idx} className="p-3 rounded-lg border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Wrench className="h-4 w-4 text-green-600" />
                                        <span className="font-medium">{item.tonnage} Custom Build</span>
                                        {item.isElite && (
                                          <Badge className="bg-amber-500 text-white text-xs">
                                            <Crown className="h-3 w-3 mr-1" />
                                            Elite
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="grid grid-cols-4 gap-2 my-3">
                                        {item.outdoor?.imageUrl && (
                                          <div className="text-center">
                                            <img src={`/assets/${item.outdoor.imageUrl}`} alt="Outdoor" className="w-full h-16 object-contain rounded bg-white dark:bg-gray-800 p-1" />
                                            <p className="text-[10px] text-muted-foreground mt-1">Outdoor</p>
                                          </div>
                                        )}
                                        {item.coil?.imageUrl && (
                                          <div className="text-center">
                                            <img src={`/assets/${item.coil.imageUrl}`} alt="Coil" className="w-full h-16 object-contain rounded bg-white dark:bg-gray-800 p-1" />
                                            <p className="text-[10px] text-muted-foreground mt-1">Coil</p>
                                          </div>
                                        )}
                                        {item.indoor?.imageUrl && (
                                          <div className="text-center">
                                            <img src={`/assets/${item.indoor.imageUrl}`} alt="Indoor" className="w-full h-16 object-contain rounded bg-white dark:bg-gray-800 p-1" />
                                            <p className="text-[10px] text-muted-foreground mt-1">Indoor</p>
                                          </div>
                                        )}
                                        {item.thermostat?.imageUrl && (
                                          <div className="text-center">
                                            <img src={`/assets/${item.thermostat.imageUrl}`} alt="Thermostat" className="w-full h-16 object-contain rounded bg-white dark:bg-gray-800 p-1" />
                                            <p className="text-[10px] text-muted-foreground mt-1">Thermostat</p>
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground space-y-1">
                                        {item.outdoor && <p>Outdoor: {item.outdoor.brand} {item.outdoor.name}</p>}
                                        {item.coil && <p>Coil: {item.coil.brand} {item.coil.name}</p>}
                                        {item.indoor && <p>Indoor: {item.indoor.brand} {item.indoor.name}</p>}
                                        {item.thermostat && <p>Thermostat: {item.thermostat.brand} {item.thermostat.name}</p>}
                                      </div>
                                      <div className="flex justify-between mt-2 text-sm">
                                        <span>Qty: {item.quantity}</span>
                                        <span className="font-bold text-green-600">{formatPrice(item.priceLow * item.quantity)} - {formatPrice(item.priceHigh * item.quantity)}</span>
                                      </div>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div key={idx} className={`p-3 rounded-lg border ${item.isElite ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'}`}>
                                      <div className="flex items-center gap-2 mb-2">
                                        <Package className="h-4 w-4 text-blue-600" />
                                        <span className="font-medium">{item.unitTypeName} - {item.tier} ({item.tonnage})</span>
                                        {item.isElite && (
                                          <Badge className="bg-amber-500 text-white text-xs">
                                            <Crown className="h-3 w-3 mr-1" />
                                            Elite
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="grid grid-cols-4 gap-2 my-3">
                                        {item.outdoor?.imageUrl && (
                                          <div className="text-center">
                                            <img src={`/assets/${item.outdoor.imageUrl}`} alt="Outdoor" className="w-full h-16 object-contain rounded bg-white dark:bg-gray-800 p-1" />
                                            <p className="text-[10px] text-muted-foreground mt-1">Outdoor</p>
                                          </div>
                                        )}
                                        {item.coil?.imageUrl && (
                                          <div className="text-center">
                                            <img src={`/assets/${item.coil.imageUrl}`} alt="Coil" className="w-full h-16 object-contain rounded bg-white dark:bg-gray-800 p-1" />
                                            <p className="text-[10px] text-muted-foreground mt-1">Coil</p>
                                          </div>
                                        )}
                                        {item.indoor?.imageUrl && (
                                          <div className="text-center">
                                            <img src={`/assets/${item.indoor.imageUrl}`} alt="Indoor" className="w-full h-16 object-contain rounded bg-white dark:bg-gray-800 p-1" />
                                            <p className="text-[10px] text-muted-foreground mt-1">Indoor</p>
                                          </div>
                                        )}
                                        {item.thermostat?.imageUrl && (
                                          <div className="text-center">
                                            <img src={`/assets/${item.thermostat.imageUrl}`} alt="Thermostat" className="w-full h-16 object-contain rounded bg-white dark:bg-gray-800 p-1" />
                                            <p className="text-[10px] text-muted-foreground mt-1">Thermostat</p>
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground space-y-1">
                                        {item.outdoor && <p>Outdoor: {item.outdoor.brand} {item.outdoor.name || item.outdoor.model}</p>}
                                        {item.coil && <p>Coil: {item.coil.name || item.coil.model}</p>}
                                        {item.indoor && <p>Indoor: {item.indoor.name || item.indoor.model}</p>}
                                        {item.thermostat && <p>Thermostat: {item.thermostat.name || item.thermostat.model}</p>}
                                      </div>
                                      <div className="flex justify-between mt-2 text-sm">
                                        <span>Qty: {item.quantity}</span>
                                        <span className="font-bold text-blue-600">{formatPrice(item.totalPrice * item.quantity)}</span>
                                      </div>
                                    </div>
                                  );
                                }
                              })}
                            </div>
                          </div>
                        )}

                        {quoteData.whats_included && quoteData.whats_included.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">WHAT'S INCLUDED</p>
                            <div className="space-y-2">
                              {quoteData.whats_included.map((category: any, idx: number) => (
                                <div key={idx}>
                                  <p className="text-sm font-medium">{category.category}</p>
                                  <ul className="text-xs text-muted-foreground ml-3">
                                    {category.items?.map((item: string, i: number) => (
                                      <li key={i}>• {item}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {quoteData.line_items && quoteData.line_items.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-2">LINE ITEMS</p>
                            <div className="space-y-1">
                              {quoteData.line_items.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span>{item.name} x{item.qty}</span>
                                  <span className="font-medium">{formatPrice(item.price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t">
                          <div className="flex justify-between text-sm">
                            <span>Subtotal</span>
                            <span>{formatPrice(quoteData.subtotal || 0)}</span>
                          </div>
                          {quoteData.elite_discount_active && quoteData.elite_discount_amount > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                              <span>Elite Discount ({quoteData.elite_discount_percent}%)</span>
                              <span>-{formatPrice(quoteData.elite_discount_amount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-lg mt-2">
                            <span>Total</span>
                            <span className="text-primary">{formatPrice(quoteData.total || proposal.total)}</span>
                          </div>
                        </div>

                        {proposal.customerAddress && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Address:</span> {proposal.customerAddress}
                          </div>
                        )}
                        {proposal.customerPhone && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Phone:</span> {proposal.customerPhone}
                          </div>
                        )}
                        {proposal.customerEmail && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Email:</span> {proposal.customerEmail}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The saved proposal will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
