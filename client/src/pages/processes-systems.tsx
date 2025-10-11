import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Search, Plus, FileText, Mic } from "lucide-react";
import { useLocation } from "wouter";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import type { Process } from "@shared/schema";
import ProcessDetailView from "@/components/process-detail-view";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ProcessesSystems() {
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);

  const { data: processes = [], isLoading } = useQuery<Process[]>({
    queryKey: ['/api/processes'],
  });

  // Get unique categories
  const uniqueCategories = new Set(processes.map(p => p.category));
  const categories = ["all", ...Array.from(uniqueCategories)];

  // Filter processes
  const filteredProcesses = processes.filter(process => {
    const matchesSearch = process.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         process.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || process.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
                currentPageTitle="Processes and Systems"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Quote Generator", path: "/quote" },
                  { label: "Price Book", path: "/price-book" },
                  { label: "Processes and Systems", path: "/processes" },
                ]}
              />
              <p className="text-xs text-muted-foreground hidden sm:block">Field Technician Tool</p>
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => window.location.href = '/admin'}
              data-testid="button-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-md md:max-w-2xl lg:max-w-4xl">
        {selectedProcess ? (
          <ProcessDetailView 
            process={selectedProcess} 
            onBack={() => setSelectedProcess(null)}
          />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Wiki</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-testid="button-create-process">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Process
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => setLocation('/processes/new')}
                      data-testid="menu-item-manual"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Manual Entry
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setLocation('/processes/new/voice')}
                      data-testid="menu-item-voice"
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      Voice Guided
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search and Filter */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search processes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-processes"
                    />
                  </div>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-2 border rounded-md bg-background"
                    data-testid="select-category-filter"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat === "all" ? "All Categories" : cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Process List */}
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading processes...</div>
                ) : filteredProcesses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm || selectedCategory !== "all" 
                      ? "No processes found matching your filters." 
                      : "No processes yet. Create your first one!"}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProcesses.map((process) => (
                      <Card 
                        key={process.id} 
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => setSelectedProcess(process)}
                        data-testid={`card-process-${process.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-lg" data-testid={`text-process-name-${process.id}`}>
                                {process.name}
                              </h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                {process.description}
                              </p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded" data-testid={`text-category-${process.id}`}>
                                  {process.category}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {process.steps?.length || 0} steps
                                </span>
                              </div>
                            </div>
                            <FileText className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
