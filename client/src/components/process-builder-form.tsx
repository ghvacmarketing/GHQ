import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { insertProcessSchema, type ProcessStep } from "@shared/schema";
import { nanoid } from "nanoid";

const formSchema = insertProcessSchema.extend({
  name: z.string().min(1, "Process name is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
  rationale: z.string().min(1, "Rationale is required"),
});

type FormData = z.infer<typeof formSchema>;

interface ProcessBuilderFormProps {
  onSuccess: () => void;
}

export default function ProcessBuilderForm({ onSuccess }: ProcessBuilderFormProps) {
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [currentStep, setCurrentStep] = useState("");

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

  const onSubmit = (data: FormData) => {
    createMutation.mutate({ ...data, steps });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Process Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., Compressor Replacement" data-testid="input-process-name" />
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
                <Textarea {...field} placeholder="Brief description of this process" rows={2} data-testid="input-process-description" />
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
              <FormLabel>Category</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g., Maintenance, Repair, Installation" data-testid="input-process-category" />
              </FormControl>
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
                  data-testid="input-process-rationale"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <FormLabel>Steps</FormLabel>
          <div className="flex gap-2">
            <Input
              value={currentStep}
              onChange={(e) => setCurrentStep(e.target.value)}
              placeholder="Enter step instruction"
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addStep())}
              data-testid="input-step-instruction"
            />
            <Button type="button" onClick={addStep} size="icon" data-testid="button-add-step">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {steps.length > 0 && (
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {steps.map((step) => (
                <div key={step.id} className="flex items-start gap-2 p-2 bg-muted rounded" data-testid={`step-item-${step.id}`}>
                  <span className="text-sm font-semibold min-w-[24px]">{step.stepNumber}.</span>
                  <p className="flex-1 text-sm">{step.instruction}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeStep(step.id)}
                    data-testid={`button-remove-step-${step.id}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button 
            type="submit" 
            disabled={createMutation.isPending || steps.length === 0}
            data-testid="button-save-process"
          >
            {createMutation.isPending ? "Creating..." : "Save Process"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
