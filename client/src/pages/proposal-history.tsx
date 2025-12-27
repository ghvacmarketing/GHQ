import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, FileText, Calendar, User, ChevronDown, ChevronUp, Trash2, DollarSign, Package, Crown, Wrench, Home as HomeIcon, Download } from "lucide-react";
import { Link } from "wouter";
import MobileNav from "@/components/mobile-nav";
import redlogo from "@assets/redlogo.webp";
import { jsPDF } from "jspdf";
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

const COMPANY_INFO = {
  name: "GIESBRECHT HVAC",
  tagline: "Comfort you can trust.",
  address: "PO Box 917, Wrens, GA 30833",
  phone: "(706) 826-0644",
  email: "earnest@ghvacinc.com",
  website: "ghvac.work",
  documentTitle: "COMPREHENSIVE HOME COMFORT PROPOSAL",
  footer: "Thank you for considering GHVAC!",
  termsFooter: "This proposal is valid for 30 days. Prices subject to change. Financing terms subject to credit approval.",
};

const BRAND_COLORS = {
  primary: [113, 20, 25] as [number, number, number],
  text: [26, 26, 26] as [number, number, number],
  muted: [100, 100, 100] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightGray: [245, 245, 245] as [number, number, number],
  eliteGreen: [34, 139, 34] as [number, number, number],
};

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

  const downloadProposalAsPDF = (proposal: SavedProposal) => {
    let quoteData: any = null;
    try {
      quoteData = JSON.parse(proposal.quoteData);
    } catch (e) {
      toast({ title: "Failed to parse proposal data", variant: "destructive" });
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      let y = 20;

      const addHeader = () => {
        doc.setFillColor(...BRAND_COLORS.primary);
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_COLORS.white);
        doc.text(COMPANY_INFO.name, pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont("helvetica", "italic");
        doc.text(COMPANY_INFO.tagline, pageWidth / 2, 23, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(230, 230, 230);
        doc.text(`${COMPANY_INFO.phone} | ${COMPANY_INFO.email} | ${COMPANY_INFO.website}`, pageWidth / 2, 30, { align: 'center' });
      };

      const addFooter = (pageNum: number, totalPages: number) => {
        doc.setDrawColor(...BRAND_COLORS.primary);
        doc.setLineWidth(0.5);
        doc.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25);
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(...BRAND_COLORS.text);
        doc.text(COMPANY_INFO.footer, pageWidth / 2, pageHeight - 18, { align: 'center' });
        doc.setFontSize(7);
        doc.setTextColor(...BRAND_COLORS.muted);
        doc.text(COMPANY_INFO.termsFooter, pageWidth / 2, pageHeight - 12, { align: 'center' });
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 7, { align: 'center' });
      };

      const checkPageBreak = (neededSpace: number) => {
        if (y + neededSpace > pageHeight - 35) {
          doc.addPage();
          addHeader();
          y = 45;
        }
      };

      addHeader();
      y = 45;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND_COLORS.primary);
      doc.text(COMPANY_INFO.documentTitle, pageWidth / 2, y, { align: 'center' });
      y += 12;

      doc.setDrawColor(...BRAND_COLORS.primary);
      doc.setLineWidth(1);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND_COLORS.text);
      doc.text("Prepared for:", margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(proposal.customerName || "Valued Customer", margin + 28, y);
      y += 6;

      if (proposal.customerAddress) {
        doc.text(proposal.customerAddress, margin, y);
        y += 6;
      }

      const proposalDate = proposal.createdAt 
        ? new Date(proposal.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      doc.text(`Date: ${proposalDate}`, margin, y);
      y += 12;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND_COLORS.primary);
      const titleLines = doc.splitTextToSize(proposal.quoteTitle || "Home Comfort Proposal", contentWidth);
      titleLines.forEach((line: string) => {
        doc.text(line, margin, y);
        y += 5;
      });
      y += 5;

      if (proposal.packageDescription) {
        checkPageBreak(20);
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...BRAND_COLORS.text);
        const descLines = doc.splitTextToSize(proposal.packageDescription, contentWidth);
        doc.text(descLines, margin, y);
        y += descLines.length * 5 + 8;
      }

      if (quoteData.cartItems && quoteData.cartItems.length > 0) {
        checkPageBreak(20);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_COLORS.primary);
        doc.text("Equipment Selected", margin, y);
        y += 8;

        quoteData.cartItems.forEach((item: any) => {
          checkPageBreak(15);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...BRAND_COLORS.text);
          
          let itemName = "";
          if (item.type === "crawlspace") {
            itemName = `${item.tierName} Crawlspace Encapsulation - ${item.bandSqft} sqft`;
          } else if (item.type === "custom") {
            itemName = `${item.tonnage} Custom Build`;
          } else {
            itemName = `${item.unitTypeName || item.unitType} - ${item.tier} (${item.tonnage})`;
          }
          
          if (item.isElite) {
            itemName += " [Elite]";
          }

          const itemLines = doc.splitTextToSize(`• ${itemName}`, contentWidth - 10);
          doc.text(itemLines, margin + 5, y);
          y += itemLines.length * 4 + 2;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          if (item.outdoor) {
            doc.text(`  Outdoor: ${item.outdoor.brand || ''} ${item.outdoor.name || item.outdoor.model || ''}`, margin + 10, y);
            y += 4;
          }
          if (item.coil) {
            doc.text(`  Coil: ${item.coil.name || item.coil.model || ''}`, margin + 10, y);
            y += 4;
          }
          if (item.indoor) {
            doc.text(`  Indoor: ${item.indoor.name || item.indoor.model || ''}`, margin + 10, y);
            y += 4;
          }
          if (item.thermostat) {
            doc.text(`  Thermostat: ${item.thermostat.name || item.thermostat.model || ''}`, margin + 10, y);
            y += 4;
          }
          y += 3;
        });
      }

      if (quoteData.line_items && quoteData.line_items.length > 0) {
        checkPageBreak(50);
        y += 5;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_COLORS.primary);
        doc.text("Pricing Details", margin, y);
        y += 8;

        const tableStartX = margin;
        const col1Width = contentWidth * 0.55;
        const col2Width = contentWidth * 0.15;
        const col3Width = contentWidth * 0.30;

        doc.setFillColor(...BRAND_COLORS.primary);
        doc.rect(tableStartX, y, contentWidth, 8, 'F');
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_COLORS.white);
        doc.text("Item", tableStartX + 3, y + 5.5);
        doc.text("Qty", tableStartX + col1Width + 3, y + 5.5);
        doc.text("Price", tableStartX + col1Width + col2Width + col3Width - 3, y + 5.5, { align: 'right' });
        y += 8;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(...BRAND_COLORS.text);
        let rowIndex = 0;

        quoteData.line_items.forEach((item: { name: string; qty: number; price: number; description?: string }) => {
          doc.setFontSize(9);
          const nameLines = doc.splitTextToSize(item.name, col1Width - 6);
          const rowHeight = Math.max(8, nameLines.length * 4 + 4);
          
          checkPageBreak(rowHeight + 2);
          if (rowIndex % 2 === 0) {
            doc.setFillColor(...BRAND_COLORS.lightGray);
            doc.rect(tableStartX, y, contentWidth, rowHeight, 'F');
          }
          
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...BRAND_COLORS.text);
          let textY = y + 5;
          nameLines.forEach((line: string) => {
            doc.text(line, tableStartX + 3, textY);
            textY += 4;
          });
          
          doc.setFont("helvetica", "normal");
          doc.text((item.qty || 1).toString(), tableStartX + col1Width + 3, y + 5);
          const price = typeof item.price === 'number' ? item.price : (parseFloat(String(item.price)) || 0);
          doc.text(`$${price.toLocaleString()}`, tableStartX + col1Width + col2Width + col3Width - 3, y + 5, { align: 'right' });
          
          y += rowHeight;
          rowIndex++;
        });

        doc.setDrawColor(...BRAND_COLORS.primary);
        doc.setLineWidth(0.5);
        doc.line(tableStartX, y, tableStartX + contentWidth, y);
        y += 6;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Subtotal:", tableStartX + col1Width, y);
        doc.text(`$${(quoteData.subtotal || 0).toLocaleString()}`, tableStartX + contentWidth - 3, y, { align: 'right' });
        y += 6;

        if (quoteData.elite_discount_active && quoteData.elite_discount_amount) {
          const discountAmount = typeof quoteData.elite_discount_amount === 'number' 
            ? quoteData.elite_discount_amount 
            : (parseFloat(String(quoteData.elite_discount_amount)) || 0);
          if (discountAmount > 0) {
            checkPageBreak(14);
            doc.setFillColor(220, 255, 220);
            doc.rect(tableStartX, y - 4, contentWidth, 12, 'F');
            doc.setDrawColor(...BRAND_COLORS.eliteGreen);
            doc.setLineWidth(1);
            doc.rect(tableStartX, y - 4, contentWidth, 12, 'S');
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...BRAND_COLORS.eliteGreen);
            doc.text(`Elite Package Discount (${quoteData.elite_discount_percent || 0}%):`, tableStartX + col1Width, y + 2);
            doc.text(`-$${discountAmount.toLocaleString()}`, tableStartX + contentWidth - 3, y + 2, { align: 'right' });
            y += 14;
            doc.setTextColor(...BRAND_COLORS.text);
          }
        }

        checkPageBreak(12);
        doc.setFillColor(...BRAND_COLORS.primary);
        doc.rect(tableStartX, y, contentWidth, 10, 'F');
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_COLORS.white);
        doc.text("TOTAL:", tableStartX + col1Width, y + 7);
        const totalValue = quoteData.total || proposal.total;
        const totalNum = typeof totalValue === 'number' ? totalValue : (parseFloat(String(totalValue)) || 0);
        doc.text(`$${totalNum.toLocaleString()}`, tableStartX + contentWidth - 3, y + 7, { align: 'right' });
        y += 16;
        doc.setTextColor(...BRAND_COLORS.text);
      } else {
        checkPageBreak(30);
        y += 5;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_COLORS.primary);
        doc.text("Total Investment", margin, y);
        y += 8;

        doc.setFillColor(...BRAND_COLORS.primary);
        doc.rect(margin, y, contentWidth, 10, 'F');
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...BRAND_COLORS.white);
        doc.text("TOTAL:", margin + contentWidth * 0.55, y + 7);
        const total = typeof proposal.total === 'string' ? parseFloat(proposal.total) : proposal.total;
        doc.text(`$${total.toLocaleString()}`, margin + contentWidth - 3, y + 7, { align: 'right' });
        y += 16;
      }

      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

      const customerNameForFile = proposal.customerName?.replace(/[^a-zA-Z0-9]/g, '_') || 'Customer';
      const dateForFile = proposal.createdAt 
        ? new Date(proposal.createdAt).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      doc.save(`GHVAC_Proposal_${customerNameForFile}_${dateForFile}.pdf`);
      
      toast({
        title: "Downloaded!",
        description: "Proposal saved as PDF.",
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({
        title: "Download Failed",
        description: "Could not generate the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
            <MobileNav />
            <img 
              src={redlogo} 
              alt="Giesbrecht HVAC" 
              className="h-8 sm:h-10 w-auto object-contain flex-shrink-0"
              data-testid="img-company-logo"
            />
            <span className="text-sm sm:text-base font-semibold truncate">Proposal History</span>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
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

                        <div className="pt-3 border-t flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadProposalAsPDF(proposal);
                            }}
                            data-testid={`button-download-pdf-${proposal.id}`}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download PDF
                          </Button>
                        </div>
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
