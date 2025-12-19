import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Check, ChevronRight, Plus, Minus, ShoppingCart, Trash2, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import NavDropdown from "@/components/nav-dropdown";
import UserMenu from "@/components/user-menu";
import redlogo from "@assets/redlogo.webp";
import type { Equipment, EquipmentCategory, ProposalEquipment } from "@shared/schema";

export default function ProposalBuilder() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [cart, setCart] = useState<ProposalEquipment[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const { data: categories, isLoading } = useQuery<EquipmentCategory[]>({
    queryKey: ['/api/equipment'],
  });

  const currentCategory = useMemo(() => {
    if (!categories || !selectedCategory) return null;
    return categories.find(c => c.name === selectedCategory);
  }, [categories, selectedCategory]);

  const filteredEquipment = useMemo(() => {
    if (!currentCategory) return [];
    if (!selectedSubcategory || selectedSubcategory === 'all') {
      return currentCategory.equipment;
    }
    return currentCategory.equipment.filter(e => e.subcategory === selectedSubcategory);
  }, [currentCategory, selectedSubcategory]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const addToCart = (equipment: Equipment) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === equipment.id);
      if (existing) {
        return prev.map(item =>
          item.id === equipment.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...equipment, quantity: 1 }];
    });
  };

  const removeFromCart = (equipmentId: string) => {
    setCart(prev => prev.filter(item => item.id !== equipmentId));
  };

  const updateQuantity = (equipmentId: string, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === equipmentId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean) as ProposalEquipment[];
    });
  };

  const getItemInCart = (equipmentId: string) => {
    return cart.find(item => item.id === equipmentId);
  };

  const handleBack = () => {
    if (selectedSubcategory) {
      setSelectedSubcategory(null);
    } else if (selectedCategory) {
      setSelectedCategory(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
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
              <NavDropdown
                currentPageTitle="Proposal Builder"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation", path: "/installation" },
                  { label: "Proposal Builder", path: "/proposal" },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative min-h-[44px] min-w-[44px]"
                  data-testid="button-cart"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {cartItemCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                    >
                      {cartItemCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Proposal Cart ({cartItemCount} items)
                  </SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-200px)] mt-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Your proposal is empty</p>
                      <p className="text-sm">Add equipment to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map(item => (
                        <Card key={item.id} className="p-3" data-testid={`cart-item-${item.id}`}>
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{item.description}</p>
                              <p className="text-xs text-muted-foreground">{item.brand} {item.model}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.tonnage && <Badge variant="secondary" className="text-xs">{item.tonnage}</Badge>}
                                {item.seer && <Badge variant="secondary" className="text-xs">{item.seer}</Badge>}
                                {item.afue && <Badge variant="secondary" className="text-xs">{item.afue}</Badge>}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => removeFromCart(item.id)}
                              data-testid={`button-remove-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateQuantity(item.id, -1)}
                                data-testid={`button-decrease-${item.id}`}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center font-medium">{item.quantity}</span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateQuantity(item.id, 1)}
                                data-testid={`button-increase-${item.id}`}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="font-semibold">{formatPrice(item.price * item.quantity)}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                {cart.length > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-card border-t">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-lg font-medium">Equipment Total</span>
                      <span className="text-xl font-bold text-primary">{formatPrice(cartTotal)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground text-center mb-3">
                      <Info className="h-3 w-3 inline mr-1" />
                      Final price will include labor, materials, and applicable taxes
                    </p>
                    <Button className="w-full min-h-[44px]" data-testid="button-continue-proposal">
                      Continue to Quote Details
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-4">
          {(selectedCategory || selectedSubcategory) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="min-h-[44px]"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          ) : (
            <Link href="/">
              <Button variant="ghost" size="sm" className="min-h-[44px]" data-testid="button-home">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Home
              </Button>
            </Link>
          )}
          <div className="text-sm text-muted-foreground">
            {selectedCategory && (
              <span className="inline-flex items-center">
                <ChevronRight className="h-3 w-3 mx-1" />
                {selectedCategory}
              </span>
            )}
            {selectedSubcategory && selectedSubcategory !== 'all' && (
              <span className="inline-flex items-center">
                <ChevronRight className="h-3 w-3 mx-1" />
                {selectedSubcategory}
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : !selectedCategory ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">Select Equipment Category</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories?.map(category => (
                <Card
                  key={category.name}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setSelectedCategory(category.name)}
                  data-testid={`category-${category.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      {category.name}
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {category.equipment.length} items
                    </p>
                    {category.subcategories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {category.subcategories.slice(0, 3).map(sub => (
                          <Badge key={sub} variant="secondary" className="text-xs">
                            {sub}
                          </Badge>
                        ))}
                        {category.subcategories.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{category.subcategories.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : currentCategory && currentCategory.subcategories.length > 0 && !selectedSubcategory ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">{selectedCategory}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setSelectedSubcategory('all')}
                data-testid="subcategory-all"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    View All
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {currentCategory.equipment.length} items
                  </p>
                </CardContent>
              </Card>
              {currentCategory.subcategories.map(sub => (
                <Card
                  key={sub}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setSelectedSubcategory(sub)}
                  data-testid={`subcategory-${sub.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      {sub}
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {currentCategory.equipment.filter(e => e.subcategory === sub).length} items
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-semibold mb-4">
              {selectedCategory}
              {selectedSubcategory && selectedSubcategory !== 'all' && ` - ${selectedSubcategory}`}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEquipment.map(equipment => {
                const inCart = getItemInCart(equipment.id);
                return (
                  <Card
                    key={equipment.id}
                    className={`relative ${inCart ? 'border-primary ring-1 ring-primary' : ''}`}
                    data-testid={`equipment-${equipment.id}`}
                  >
                    {inCart && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-primary">
                          <Check className="h-3 w-3 mr-1" />
                          {inCart.quantity} in cart
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <div className="pr-20">
                        <p className="text-xs text-muted-foreground">{equipment.brand}</p>
                        <CardTitle className="text-base">{equipment.model}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {equipment.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {equipment.tonnage && (
                          <Badge variant="outline" className="text-xs">{equipment.tonnage}</Badge>
                        )}
                        {equipment.btu && (
                          <Badge variant="outline" className="text-xs">{equipment.btu}</Badge>
                        )}
                        {equipment.seer && (
                          <Badge variant="outline" className="text-xs">{equipment.seer}</Badge>
                        )}
                        {equipment.afue && (
                          <Badge variant="outline" className="text-xs">{equipment.afue}</Badge>
                        )}
                        {equipment.hspf && (
                          <Badge variant="outline" className="text-xs">{equipment.hspf}</Badge>
                        )}
                        {equipment.warranty && (
                          <Badge variant="secondary" className="text-xs">{equipment.warranty}</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xl font-bold text-primary">
                          {formatPrice(equipment.price)}
                        </p>
                        <Button
                          size="sm"
                          className="min-h-[44px]"
                          onClick={() => addToCart(equipment)}
                          data-testid={`button-add-${equipment.id}`}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                      {equipment.laborHours && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Est. labor: {equipment.laborHours} hours
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {cart.length > 0 && !cartOpen && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80">
            <Button
              className="w-full min-h-[52px] shadow-lg"
              onClick={() => setCartOpen(true)}
              data-testid="button-view-cart"
            >
              <ShoppingCart className="h-5 w-5 mr-2" />
              View Proposal ({cartItemCount} items) - {formatPrice(cartTotal)}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
