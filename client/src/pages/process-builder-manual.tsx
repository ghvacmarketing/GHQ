import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, X, Settings } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertProcessSchema, type ProcessStep, type Category } from "@shared/schema";
import { nanoid } from "nanoid";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import { queryClient } from "@/lib/queryClient";

const formSchema = insertProcessSchema.extend({
  name: z.string().min(1, "Process name is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  rationale: z.string().min(1, "Rationale is required"),
});

type FormData = z.infer<typeof formSchema>;

export default function ProcessBuilderManual() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [currentStep, setCurrentStep] = useState("");
  
  // Refs for auto-scroll and field navigation
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLButtonElement>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);
  const stepInputRef = useRef<HTMLInputElement>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      rationale: "",
      steps: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch('/api/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create process');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processes'] });
      toast({
        title: "Process created",
        description: "Your new process has been saved successfully.",
      });
      setLocation('/processes');
    },
  });

  const addStep = () => {
    if (currentStep.trim()) {
      const newStep: ProcessStep = {
        id: nanoid(),
        stepNumber: steps.length + 1,
        instruction: currentStep.trim(),
      };
      setSteps([...steps, newStep]);
      setCurrentStep("");
      // Keep focus on step input
      setTimeout(() => stepInputRef.current?.focus(), 0);
    }
  };

  const removeStep = (id: string) => {
    const updatedSteps = steps
      .filter(s => s.id !== id)
      .map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setSteps(updatedSteps);
  };

  const onSubmit = (data: FormData) => {
    createMutation.mutate({ ...data, steps });
  };

  // Auto-scroll to focused element with offset for keyboard
  const handleFocus = (element: HTMLElement | null) => {
    if (element) {
      setTimeout(() => {
        const elementTop = element.getBoundingClientRect().top;
        const offset = window.innerHeight * 0.3; // Scroll so input is in top 30% of screen
        window.scrollBy({
          top: elementTop - offset,
          behavior: 'smooth'
        });
      }, 300); // Delay to let keyboard appear
    }
  };

  // Handle Enter key to move to next field
  const handleKeyDown = (e: React.KeyboardEvent, nextRef: React.RefObject<any>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      nextRef.current?.focus();
      nextRef.current?.click?.(); // For select triggers
    }
  };

  const completionPercentage = () => {
    let completed = 0;
    if (form.watch('name')) completed += 20;
    if (form.watch('description')) completed += 20;
    if (form.watch('category')) completed += 20;
    if (form.watch('rationale')) completed += 20;
    if (steps.length > 0) completed += 20;
    return completed;
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Fixed Header */}
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
                currentPageTitle="New Process"
                items={[
                  { label: "Home", path: "/" },
                  { label: "Processes and Systems", path: "/processes" },
                ]}
              />
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
        
        {/* Progress Bar */}
        <div className="h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${completionPercentage()}%` }}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation('/processes')}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Processes
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Create New Process</h1>
          <p className="text-sm text-muted-foreground mt-1">Fill out the form below to document a new process</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Process Name *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      ref={nameRef}
                      placeholder="e.g., Compressor Replacement"
                      data-testid="input-process-name"
                      onFocus={(e) => handleFocus(e.target)}
                      onKeyDown={(e) => handleKeyDown(e, descriptionRef)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      ref={descriptionRef}
                      placeholder="Brief description of this process"
                      rows={3}
                      data-testid="input-process-description"
                      onFocus={(e) => handleFocus(e.target)}
                      onKeyDown={(e) => handleKeyDown(e, categoryRef)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger
                        ref={categoryRef}
                        data-testid="select-process-category"
                        onFocus={(e) => handleFocus(e.target)}
                      >
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map(category => (
                        <SelectItem key={category.id} value={category.name}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rationale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rationale & Details *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      ref={rationaleRef}
                      placeholder="Why this process is necessary and other relevant information"
                      rows={4}
                      data-testid="input-process-rationale"
                      onFocus={(e) => handleFocus(e.target)}
                      onKeyDown={(e) => handleKeyDown(e, stepInputRef)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <FormLabel>Steps *</FormLabel>
              <p className="text-sm text-muted-foreground">Add step-by-step instructions. Press Enter to add each step.</p>
              <div className="flex gap-2">
                <Input
                  ref={stepInputRef}
                  value={currentStep}
                  onChange={(e) => setCurrentStep(e.target.value)}
                  placeholder="Enter step instruction"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
                  onFocus={(e) => handleFocus(e.target)}
                  data-testid="input-step-instruction"
                />
                <Button type="button" onClick={addStep} size="icon" data-testid="button-add-step">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {steps.length > 0 && (
                <div className="mt-4 space-y-2">
                  {steps.map((step) => (
                    <div key={step.id} className="flex items-start gap-2 p-3 bg-muted rounded-lg" data-testid={`step-item-${step.id}`}>
                      <span className="text-sm font-semibold min-w-[28px] flex-shrink-0 mt-0.5">{step.stepNumber}.</span>
                      <p className="flex-1 text-sm">{step.instruction}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => removeStep(step.id)}
                        data-testid={`button-remove-step-${step.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Fixed Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 shadow-lg">
              <div className="container mx-auto max-w-2xl flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation('/processes')}
                  className="flex-1"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || steps.length === 0}
                  className="flex-1"
                  data-testid="button-save-process"
                >
                  {createMutation.isPending ? "Saving..." : "Save Process"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
