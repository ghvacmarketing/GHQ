import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, X, ArrowLeft } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertProcessSchema, type ProcessStep, type Process, type Category } from "@shared/schema";
import { nanoid } from "nanoid";
import { queryClient } from "@/lib/queryClient";

const formSchema = insertProcessSchema.extend({
  name: z.string().min(1, "Process name is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  rationale: z.string().min(1, "Rationale is required"),
});

type FormData = z.infer<typeof formSchema>;

interface ProcessEditFormProps {
  process: Process;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ProcessEditForm({ process, onSuccess, onCancel }: ProcessEditFormProps) {
  const [steps, setSteps] = useState<ProcessStep[]>(process.steps || []);
  const [currentStep, setCurrentStep] = useState("");

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: process.name,
      description: process.description,
      category: process.category,
      rationale: process.rationale,
      steps: process.steps || [],
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch(`/api/processes/${process.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update process');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processes'] });
      onSuccess();
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
    }
  };

  const removeStep = (id: string) => {
    const updatedSteps = steps
      .filter(s => s.id !== id)
      .map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setSteps(updatedSteps);
  };

  const updateStep = (id: string, instruction: string) => {
    setSteps(steps.map(s => s.id === id ? { ...s, instruction } : s));
  };

  const onSubmit = (data: FormData) => {
    updateMutation.mutate({ ...data, steps });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" onClick={onCancel} data-testid="button-cancel-edit">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <h2 className="text-xl font-semibold">Edit Process</h2>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Process Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., Compressor Replacement" data-testid="input-edit-process-name" />
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
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Brief description of this process" rows={2} data-testid="input-edit-process-description" />
                </FormControl>
                <p className="text-xs text-muted-foreground mt-1">
                  💡 Tip: Add links using <code className="bg-muted px-1 py-0.5 rounded">[keyword](url)</code> or paste plain URLs
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-edit-process-category">
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
                <FormLabel>Rationale & Details</FormLabel>
                <FormControl>
                  <Textarea 
                    {...field} 
                    placeholder="Why this process is necessary and other relevant information" 
                    rows={3}
                    data-testid="input-edit-process-rationale"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <FormLabel>Steps</FormLabel>
            
            {steps.length > 0 && (
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-start gap-2 p-2 bg-muted rounded" data-testid={`edit-step-item-${step.id}`}>
                    <span className="text-sm font-semibold min-w-[24px] mt-2">{step.stepNumber}.</span>
                    <Textarea
                      value={step.instruction}
                      onChange={(e) => updateStep(step.id, e.target.value)}
                      className="flex-1"
                      rows={2}
                      data-testid={`textarea-edit-step-${step.id}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removeStep(step.id)}
                      data-testid={`button-remove-edit-step-${step.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={currentStep}
                onChange={(e) => setCurrentStep(e.target.value)}
                placeholder="Add new step instruction"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
                data-testid="input-add-edit-step"
              />
              <Button type="button" onClick={addStep} size="icon" data-testid="button-add-edit-step">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button"
              variant="outline"
              onClick={onCancel}
              data-testid="button-cancel-edit-submit"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={updateMutation.isPending || steps.length === 0}
              data-testid="button-save-edit-process"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
