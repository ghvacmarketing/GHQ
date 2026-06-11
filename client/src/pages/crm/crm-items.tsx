import { useEffect, useState, useMemo } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor from "@/components/rich-text-editor";
import {
  Search,
  Package,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Eye,
  Loader2,
  Check,
  X,
  Lock,
  Percent,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import { useToast } from "@/hooks/use-toast";
import { 
  crmItemTypeEnum, 
  crmItemCategoryEnum, 
  type CrmUser, 
  type CrmItem, 
  type CrmItemType, 
  type CrmItemCategory 
} from "@shared/schema";

const categoryTabs = [
  { key: "all", label: "All Categories" },
  { key: "install", label: "Install" },
  { key: "service", label: "Service" },
  { key: "maintenance", label: "Maintenance" },
  { key: "protection", label: "Protection Plans" },
  { key: "discount", label: "Discounts" },
];

const categoryLabels: Record<string, string> = {
  install: "Install",
  service: "Service",
  maintenance: "Maintenance",
  protection: "Protection Plans",
  discount: "Discount",
};

type SortField = "name" | "category" | "itemType" | "rate";
type SortDirection = "asc" | "desc";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function CrmItems() {
  usePageTitle("Items");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState<CrmItem | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    category: "install" as CrmItemCategory,
    itemType: "residential" as CrmItemType,
    rate: "",
    costPrice: "",
  });

  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: items = [], isLoading: itemsLoading, error: itemsError } = useQuery<CrmItem[]>({
    queryKey: ["/api/crm/items"],
    enabled: !!currentUser,
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      category?: string;
      itemType?: string;
      rate?: string;
      costPrice?: string;
      partNumber?: string;
      unit?: string;
      inStock?: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/crm/items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/items"] });
      toast({ title: "Item created successfully" });
      setShowCreateDialog(false);
      setCreateForm({
        name: "",
        description: "",
        category: "install",
        itemType: "residential",
        rate: "",
        costPrice: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create item",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    crmItemCategoryEnum.forEach((cat) => {
      counts[cat] = 0;
    });
    items.forEach((item) => {
      if (item.category && item.category in counts) counts[item.category]++;
    });
    return counts;
  }, [items]);

  const filteredAndSortedItems = useMemo(() => {
    let filtered = [...items];

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter((item) => {
        const name = item.name.toLowerCase();
        const description = (item.description || "").toLowerCase();
        return (
          name.includes(searchLower) ||
          description.includes(searchLower)
        );
      });
    }

    if (activeCategory !== "all") {
      filtered = filtered.filter((item) => item.category === activeCategory);
    }

    filtered.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "category":
          aVal = a.category || "";
          bVal = b.category || "";
          break;
        case "itemType":
          aVal = a.itemType || "";
          bVal = b.itemType || "";
          break;
        case "rate":
          aVal = parseFloat(a.rate || "0");
          bVal = parseFloat(b.rate || "0");
          break;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (sortDirection === "asc") {
        return (aVal as number) - (bVal as number);
      }
      return (bVal as number) - (aVal as number);
    });

    return filtered;
  }, [items, debouncedSearch, activeCategory, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    }
    return sortDirection === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-[#711419]" />
      : <ArrowDown className="h-3 w-3 ml-1 text-[#711419]" />;
  };

  const resetFilters = () => {
    setActiveCategory("all");
    setSearchInput("");
    setSortField("name");
    setSortDirection("asc");
  };

  const hasActiveFilters = activeCategory !== "all" || debouncedSearch;

  const formatCurrency = (value: string | number | null | undefined) => {
    const num = typeof value === "string" ? parseFloat(value) : value || 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  const getCategoryBadgeClass = (category: string | null | undefined) => {
    switch (category) {
      case "parts":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "equipment":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "install":
        return "bg-indigo-100 text-indigo-700 border-indigo-200";
      case "maintenance":
        return "bg-cyan-100 text-cyan-700 border-cyan-200";
      case "protection":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "service":
        return "bg-green-100 text-green-700 border-green-200";
      case "supplies":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "fees":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "discount":
        return "bg-pink-100 text-pink-700 border-pink-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getTypeBadgeClass = (itemType: string | null | undefined) => {
    switch (itemType) {
      case "residential":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "commercial":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "crawlspace":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const formatCategoryLabel = (category: string | null | undefined) => {
    if (!category) return "Uncategorized";
    return categoryLabels[category] || category.charAt(0).toUpperCase() + category.slice(1);
  };

  const formatTypeLabel = (itemType: string | null | undefined) => {
    if (!itemType) return "—";
    return itemType.charAt(0).toUpperCase() + itemType.slice(1);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      toast({ title: "Item name is required", variant: "destructive" });
      return;
    }
    if (!createForm.rate || parseFloat(createForm.rate) < 0) {
      toast({ title: "Valid unit price is required", variant: "destructive" });
      return;
    }
    createItemMutation.mutate({
      name: createForm.name,
      description: createForm.description || undefined,
      category: createForm.category || undefined,
      itemType: createForm.category === "install" ? createForm.itemType : undefined,
      rate: createForm.rate || undefined,
      costPrice: createForm.costPrice || undefined,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-4">
        <div className="flex justify-center mb-2">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name or description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 h-10 text-sm bg-white border-slate-300 focus:border-[#711419] focus:ring-[#711419] rounded-lg"
              data-testid="input-search"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900" data-testid="text-items-title">
              Items
            </h1>
            <p className="text-sm text-slate-500">
              {itemsLoading ? "Loading..." : `${filteredAndSortedItems.length} item${filteredAndSortedItems.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 text-xs text-slate-600"
                data-testid="button-reset-filters"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            )}
            {activeCategory !== "discount" && (
              <Button
                size="sm"
                className="bg-[#711419] hover:bg-[#5a1014]"
                onClick={() => setShowCreateDialog(true)}
                data-testid="button-add-item"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 bg-transparent p-0">
            {categoryTabs.map((tab) => {
              const count = tab.key !== "all" ? categoryCounts[tab.key] || 0 : items.length;
              return (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="px-3 py-2 text-sm font-medium border-b-2 border-transparent rounded-none data-[state=active]:border-[#711419] data-[state=active]:text-[#711419] data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-slate-900 hover:border-slate-300"
                  data-testid={`tab-category-${tab.key}`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded ${
                      activeCategory === tab.key ? "bg-[#711419] text-white" : "bg-slate-200 text-slate-600"
                    }`}>
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <Card className="bg-white border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {itemsLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
                <p className="text-slate-500">Loading items...</p>
              </div>
            ) : itemsError ? (
              <div className="p-12 text-center">
                <Package className="h-12 w-12 text-red-300 mx-auto mb-3" />
                <p className="text-red-500 font-medium">Error loading items</p>
                <p className="text-slate-400 text-sm mt-1">Please try again later</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead
                      className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                      onClick={() => handleSort("name")}
                      data-testid="sort-name"
                    >
                      <div className="flex items-center">
                        Name
                        {getSortIcon("name")}
                      </div>
                    </TableHead>
                    {activeCategory === "discount" ? (
                      <>
                        <TableHead className="font-semibold">Description</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold text-right">Amount</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead
                          className="font-semibold cursor-pointer hover:bg-slate-100 select-none"
                          onClick={() => handleSort("category")}
                          data-testid="sort-category"
                        >
                          <div className="flex items-center">
                            Category
                            {getSortIcon("category")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="font-semibold cursor-pointer hover:bg-slate-100 select-none text-right"
                          onClick={() => handleSort("rate")}
                          data-testid="sort-rate"
                        >
                          <div className="flex items-center justify-end">
                            Rate
                            {getSortIcon("rate")}
                          </div>
                        </TableHead>
                      </>
                    )}
                    <TableHead className="font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12">
                        {activeCategory === "discount" ? (
                          <>
                            <Percent className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">No discount items found</p>
                            <p className="text-slate-400 text-sm mt-1">
                              System discount items will appear here
                            </p>
                          </>
                        ) : (
                          <>
                            <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">No items found</p>
                            <p className="text-slate-400 text-sm mt-1">
                              {hasActiveFilters
                                ? "Try adjusting your search or filters"
                                : "Add your first item to get started"}
                            </p>
                            {!hasActiveFilters && (
                              <Button
                                variant="outline"
                                className="mt-4"
                                onClick={() => setShowCreateDialog(true)}
                                data-testid="button-add-first-item"
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Item
                              </Button>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAndSortedItems.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        data-testid={`row-item-${item.id}`}
                        onClick={() => setSelectedItem(item)}
                      >
                        <TableCell className="font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            {item.category === "discount" && (
                              <Lock className="h-3.5 w-3.5 text-slate-400" />
                            )}
                            {item.name}
                            {item.category === "discount" && (
                              <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200">
                                System
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        {activeCategory === "discount" ? (
                          <>
                            <TableCell className="text-slate-600 max-w-xs">
                              <div className="prose prose-sm max-w-none line-clamp-2" dangerouslySetInnerHTML={{ __html: item.description || "—" }} />
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={item.itemType === "service" 
                                  ? "bg-cyan-100 text-cyan-700 border-cyan-200" 
                                  : "bg-green-100 text-green-700 border-green-200"}
                              >
                                {item.itemType === "service" ? "Maintenance" : "Promotion"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="italic text-slate-500">Variable Amount</span>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={getCategoryBadgeClass(item.category)}
                              >
                                {formatCategoryLabel(item.category)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-900 font-medium text-right">
                              {formatCurrency(item.rate)}
                            </TableCell>
                          </>
                        )}
                        <TableCell>
                          {item.category === "discount" ? (
                            (currentUser?.role === "owner" || currentUser?.role === "admin" || currentUser?.role === "sales") ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedItem(item);
                                }}
                                data-testid={`button-view-item-${item.id}`}
                              >
                                <Eye className="h-4 w-4 text-slate-500" />
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400 italic">View only</span>
                            )
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem(item);
                              }}
                              data-testid={`button-view-item-${item.id}`}
                            >
                              <Eye className="h-4 w-4 text-slate-500" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle data-testid="text-item-detail-title">{selectedItem?.name}</DialogTitle>
              <DialogDescription>{selectedItem?.description || "No description"}</DialogDescription>
            </DialogHeader>
            {selectedItem && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-slate-500">Category</Label>
                    <Badge variant="outline" className={getCategoryBadgeClass(selectedItem.category)}>
                      {formatCategoryLabel(selectedItem.category)}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Rate</Label>
                    <p className="font-medium text-green-600">{formatCurrency(selectedItem.rate)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Cost Price</Label>
                    <p className="font-medium text-slate-600">{formatCurrency(selectedItem.costPrice)}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedItem(null)} data-testid="button-close-item-detail">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle data-testid="text-create-item-title">Add New Item</DialogTitle>
              <DialogDescription>
                Add a new part, product, or service to your catalog.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit}>
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="Item name"
                    data-testid="input-create-name"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <RichTextEditor
                    content={createForm.description}
                    onChange={(content) => setCreateForm({ ...createForm, description: content })}
                    placeholder="Item description..."
                    minHeight="min-h-[100px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={createForm.category}
                      onValueChange={(value) => setCreateForm({ ...createForm, category: value as CrmItemCategory })}
                    >
                      <SelectTrigger data-testid="select-create-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {crmItemCategoryEnum.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {categoryLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="rate">Rate (Price) *</Label>
                    <Input
                      id="rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.rate}
                      onChange={(e) => setCreateForm({ ...createForm, rate: e.target.value })}
                      placeholder="0.00"
                      data-testid="input-create-rate"
                    />
                  </div>
                  <div>
                    <Label htmlFor="costPrice">Cost Price</Label>
                    <Input
                      id="costPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.costPrice}
                      onChange={(e) => setCreateForm({ ...createForm, costPrice: e.target.value })}
                      placeholder="0.00"
                      data-testid="input-create-cost-price"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#711419] hover:bg-[#5a1014]"
                  disabled={createItemMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createItemMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Item
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </CrmLayout>
  );
}
