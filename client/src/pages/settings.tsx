import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, Plus, Trash2, Edit, FolderKanban } from "lucide-react";
import giesbrechtLogo from "../assets/giesbrecht-logo.webp";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Category } from "@shared/schema";

interface SuggestedPart {
  id: string;
  name: string;
  price: string;
  category: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  
  // Category state and queries
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const lastOrder = categories.length > 0 
        ? Math.max(...categories.map(c => parseInt(c.order)))
        : 0;
      return apiRequest('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name, order: String(lastOrder + 1) }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setNewCategoryName("");
      toast({ title: "Category added successfully" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiRequest(`/api/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setEditingCategory(null);
      toast({ title: "Category updated successfully" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/categories/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      toast({ title: "Category deleted successfully" });
    },
  });

  const [suggestedParts, setSuggestedParts] = useState<SuggestedPart[]>([
    { id: "contactor-30a", name: "30A Contactor", price: "45.00", category: "Electrical" },
    { id: "capacitor-dual", name: "Dual Run Capacitor", price: "25.00", category: "Electrical" },
    { id: "disconnect-60a", name: "60A Disconnect Switch", price: "35.00", category: "Electrical" },
    { id: "fuse-30a", name: "30A Time Delay Fuse", price: "8.50", category: "Electrical" },
    { id: "thermostat-digital", name: "Digital Thermostat", price: "125.00", category: "Controls" },
    { id: "filter-16x25", name: "16x25x1 Air Filter", price: "12.00", category: "Filters" },
    { id: "belt-4l", name: "4L Blower Belt", price: "15.00", category: "Parts" },
    { id: "motor-condenser", name: "Condenser Fan Motor", price: "185.00", category: "Motors" },
  ]);

  const [editingPart, setEditingPart] = useState<SuggestedPart | null>(null);
  const [newPart, setNewPart] = useState<Partial<SuggestedPart>>({
    name: "",
    price: "",
    category: "Electrical",
  });

  const partCategories = ["Electrical", "Controls", "Filters", "Parts", "Motors", "Refrigeration"];

  const handleAddPart = () => {
    if (!newPart.name || !newPart.price || !newPart.category) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    const price = parseFloat(newPart.price);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price.",
        variant: "destructive",
      });
      return;
    }

    const id = newPart.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    setSuggestedParts(prev => [...prev, {
      id,
      name: newPart.name!,
      price: price.toFixed(2),
      category: newPart.category!,
    }]);

    setNewPart({ name: "", price: "", category: "Electrical" });
    
    toast({
      title: "Part Added",
      description: "New suggested part has been added.",
    });
  };

  const handleEditPart = (part: SuggestedPart) => {
    setEditingPart({ ...part });
  };

  const handleSaveEdit = () => {
    if (!editingPart?.name || !editingPart?.price || !editingPart?.category) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    const price = parseFloat(editingPart.price);
    if (isNaN(price) || price <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid price.",
        variant: "destructive",
      });
      return;
    }

    setSuggestedParts(prev => 
      prev.map(part => 
        part.id === editingPart.id 
          ? { ...editingPart, price: price.toFixed(2) }
          : part
      )
    );

    setEditingPart(null);
    
    toast({
      title: "Part Updated",
      description: "Part has been successfully updated.",
    });
  };

  const handleDeletePart = (id: string) => {
    setSuggestedParts(prev => prev.filter(part => part.id !== id));
    
    toast({
      title: "Part Deleted",
      description: "Part has been removed from suggested parts.",
    });
  };

  const savePartsToStorage = () => {
    localStorage.setItem('hvac-suggested-parts', JSON.stringify(suggestedParts));
    toast({
      title: "Settings Saved",
      description: "Suggested parts have been saved successfully.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <img 
                src={giesbrechtLogo} 
                alt="Giesbrecht HVAC" 
                className="h-10 w-auto mr-4"
              />
              <h1 className="text-xl font-semibold text-foreground">
                HVAC Quoting System - Settings
              </h1>
            </div>
            <Button 
              variant="outline" 
              onClick={() => window.location.href = '/'}
              data-testid="button-back-to-quotes"
            >
              Back to Quotes
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto py-8 px-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="mr-3 h-5 w-5" />
              Suggested Parts Management
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage the suggested parts that appear in the custom part dropdown
            </p>
          </CardHeader>
        </Card>

        {/* Add New Part */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Plus className="mr-2 h-4 w-4" />
              Add New Suggested Part
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="newPartName">Part Name</Label>
                <Input
                  id="newPartName"
                  placeholder="e.g., 40A Contactor"
                  value={newPart.name || ""}
                  onChange={(e) => setNewPart(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="input-new-part-name"
                />
              </div>
              <div>
                <Label htmlFor="newPartPrice">Price</Label>
                <Input
                  id="newPartPrice"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newPart.price || ""}
                  onChange={(e) => setNewPart(prev => ({ ...prev, price: e.target.value }))}
                  data-testid="input-new-part-price"
                />
              </div>
              <div>
                <Label htmlFor="newPartCategory">Category</Label>
                <Select 
                  value={newPart.category || "Electrical"} 
                  onValueChange={(value) => setNewPart(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger data-testid="select-new-part-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {partCategories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleAddPart}
                  className="w-full"
                  data-testid="button-add-part"
                >
                  Add Part
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing Parts List */}
        <Card>
          <CardHeader>
            <CardTitle>Current Suggested Parts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestedParts.map((part) => (
                <div 
                  key={part.id} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  {editingPart?.id === part.id ? (
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                      <Input
                        value={editingPart.name}
                        onChange={(e) => setEditingPart(prev => prev ? { ...prev, name: e.target.value } : null)}
                        data-testid={`input-edit-name-${part.id}`}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={editingPart.price}
                        onChange={(e) => setEditingPart(prev => prev ? { ...prev, price: e.target.value } : null)}
                        data-testid={`input-edit-price-${part.id}`}
                      />
                      <Select 
                        value={editingPart.category} 
                        onValueChange={(value) => setEditingPart(prev => prev ? { ...prev, category: value } : null)}
                      >
                        <SelectTrigger data-testid={`select-edit-category-${part.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {partCategories.map(category => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex space-x-2">
                        <Button 
                          size="sm" 
                          onClick={handleSaveEdit}
                          data-testid={`button-save-${part.id}`}
                        >
                          Save
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => setEditingPart(null)}
                          data-testid={`button-cancel-${part.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="font-medium">{part.name}</div>
                        <div className="text-sm text-muted-foreground">
                          ${part.price} • {part.category}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditPart(part)}
                          data-testid={`button-edit-${part.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeletePart(part.id)}
                          data-testid={`button-delete-${part.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-6 pt-4 border-t">
              <Button 
                onClick={savePartsToStorage}
                className="w-full"
                data-testid="button-save-settings"
              >
                Save All Settings
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Process Categories Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FolderKanban className="mr-3 h-5 w-5" />
              Process Categories
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage categories for organizing your processes and systems
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add New Category */}
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter new category name"
                onKeyPress={(e) => e.key === 'Enter' && newCategoryName && createCategoryMutation.mutate(newCategoryName)}
                data-testid="input-new-category"
              />
              <Button 
                onClick={() => newCategoryName && createCategoryMutation.mutate(newCategoryName)}
                disabled={!newCategoryName || createCategoryMutation.isPending}
                data-testid="button-add-category"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>

            {/* Categories List */}
            <div className="space-y-2">
              {categories.map((category) => (
                <div 
                  key={category.id} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                  data-testid={`category-item-${category.id}`}
                >
                  {editingCategory?.id === category.id ? (
                    <div className="flex-1 flex gap-2">
                      <Input
                        value={editingCategory.name}
                        onChange={(e) => setEditingCategory(prev => prev ? { ...prev, name: e.target.value } : null)}
                        data-testid={`input-edit-category-${category.id}`}
                      />
                      <Button 
                        size="sm" 
                        onClick={() => updateCategoryMutation.mutate({ id: category.id, name: editingCategory.name })}
                        disabled={!editingCategory.name}
                        data-testid={`button-save-category-${category.id}`}
                      >
                        Save
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setEditingCategory(null)}
                        data-testid={`button-cancel-category-${category.id}`}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 font-medium" data-testid={`text-category-${category.id}`}>
                        {category.name}
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCategory(category)}
                          data-testid={`button-edit-category-${category.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteCategoryMutation.mutate(category.id)}
                          disabled={deleteCategoryMutation.isPending}
                          data-testid={`button-delete-category-${category.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
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