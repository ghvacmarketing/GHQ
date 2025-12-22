import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Settings, Sparkles, Clipboard, X, Loader2, Info } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertProcessSchema, type ProcessStep, type Category } from "@shared/schema";
import { nanoid } from "nanoid";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import { queryClient, apiRequest } from "@/lib/queryClient";
import FileUploadSection, { type PendingFile } from "@/components/file-upload-section";
import TiptapEditor from "@/components/tiptap-editor";

const formSchema = insertProcessSchema.extend({
  name: z.string().min(1, "Process name is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
});

type FormData = z.infer<typeof formSchema>;

export default function ProcessBuilderManual() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [stepsText, setStepsText] = useState("");
  const [aiCleanupEnabled, setAiCleanupEnabled] = useState(true);
  const [cleanupLevel, setCleanupLevel] = useState(3);
  const [isFormatting, setIsFormatting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [createdProcessId, setCreatedProcessId] = useState<string | null>(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      steps: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest('POST', '/api/processes', data);
      return response.json();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create process. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setStepsText(text);
      toast({
        title: "Pasted",
        description: "Text pasted from clipboard",
      });
    } catch (error) {
      toast({
        title: "Paste failed",
        description: "Please paste manually using Ctrl+V or Cmd+V",
        variant: "destructive",
      });
    }
  };

  const handleFormat = async () => {
    if (!stepsText.trim()) {
      toast({
        title: "No text to format",
        description: "Please enter or paste some text first",
        variant: "destructive",
      });
      return;
    }

    setIsFormatting(true);
    try {
      let stepsWithIds: ProcessStep[];

      if (aiCleanupEnabled) {
        // Use AI formatting
        const response = await apiRequest('POST', '/api/format-text', {
          text: stepsText,
          cleanupLevel,
        });
        const result = await response.json();
        
        // Add IDs to steps
        stepsWithIds = result.steps.map((step: any) => ({
          ...step,
          id: nanoid(),
        }));
      } else {
        // Simple manual parsing without AI
        const lines = stepsText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => {
            // Remove common prefixes like numbers, bullets, dashes
            return line.replace(/^(\d+\.|\d+\)|-|\*|\•)\s*/, '');
          });
        
        stepsWithIds = lines.map((instruction, index) => ({
          id: nanoid(),
          stepNumber: index + 1,
          instruction,
        }));
      }
      
      setSteps(stepsWithIds);
      toast({
        title: "Formatted!",
        description: aiCleanupEnabled 
          ? `Created ${stepsWithIds.length} steps at cleanup level ${cleanupLevel}` 
          : `Created ${stepsWithIds.length} steps from raw text`,
      });
    } catch (error) {
      toast({
        title: "Formatting failed",
        description: "Please try again or adjust the cleanup level",
        variant: "destructive",
      });
    } finally {
      setIsFormatting(false);
    }
  };

  const updateStep = (id: string, instruction: string) => {
    setSteps(steps.map(s => s.id === id ? { ...s, instruction } : s));
  };

  const removeStep = (id: string) => {
    const updatedSteps = steps
      .filter(s => s.id !== id)
      .map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    setSteps(updatedSteps);
  };

  const onSubmit = async (data: FormData) => {
    // Either steps or files must be present
    if (steps.length === 0 && pendingFiles.length === 0) {
      toast({
        title: "Nothing to save",
        description: "Please add steps or attach files before saving",
        variant: "destructive",
      });
      return;
    }

    try {
      let processId = createdProcessId;
      
      // Create process only if not already created
      if (!processId) {
        const processData = {
          ...data,
          steps: steps.length > 0 ? steps : null,
        };
        
        const process = await createMutation.mutateAsync(processData);
        processId = process.id;
        setCreatedProcessId(processId);
      }
      
      // Upload files if any
      if (pendingFiles.length > 0 && processId) {
        setIsUploadingFiles(true);
        await uploadFiles(processId);
        setIsUploadingFiles(false);
      }

      // Success - invalidate queries and navigate
      queryClient.invalidateQueries({ queryKey: ['/api/processes'] });
      toast({
        title: "Process created",
        description: pendingFiles.length > 0 
          ? `Process saved with ${pendingFiles.length} file(s)`
          : "Your new process has been saved successfully.",
      });
      setLocation('/processes');
    } catch (error) {
      console.error('Error creating/uploading process:', error);
      setIsUploadingFiles(false);
      // Error toasts already shown by mutation or uploadFiles
      // Keep createdProcessId so retry will reuse existing process
    }
  };

  const uploadFiles = async (processId: string) => {
    const failedFiles: PendingFile[] = [];
    const successfulFiles: PendingFile[] = [];
    
    for (const pendingFile of pendingFiles) {
      try {
        const formData = new FormData();
        formData.append('file', pendingFile.file);
        
        const response = await fetch(`/api/processes/${processId}/attachments`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          failedFiles.push(pendingFile);
        } else {
          successfulFiles.push(pendingFile);
        }
      } catch (error) {
        failedFiles.push(pendingFile);
      }
    }
    
    // Remove successfully uploaded files from pendingFiles
    if (successfulFiles.length > 0) {
      setPendingFiles(prev => prev.filter(pf => 
        !successfulFiles.some(sf => sf.id === pf.id)
      ));
    }
    
    // If any files failed, throw error to prevent navigation
    if (failedFiles.length > 0) {
      const failedNames = failedFiles.map(f => f.file.name);
      const fileList = failedNames.length <= 3 
        ? failedNames.join(', ')
        : `${failedNames.slice(0, 3).join(', ')} and ${failedNames.length - 3} more`;
      
      const errorMessage = failedFiles.length === pendingFiles.length
        ? `All files failed: ${fileList}`
        : `Failed to upload: ${fileList}`;
      
      toast({
        title: "File upload error",
        description: errorMessage,
        variant: "destructive",
      });
      
      throw new Error(errorMessage);
    }
  };

  const completionPercentage = () => {
    let completed = 0;
    if (form.watch('name')) completed += 25;
    if (form.watch('description')) completed += 25;
    if (form.watch('category')) completed += 25;
    if (steps.length > 0 || pendingFiles.length > 0) completed += 25;
    return completed;
  };

  const getCleanupLabel = (level: number) => {
    const labels: Record<number, string> = {
      1: "Minimal cleanup",
      2: "Light cleanup",
      3: "Moderate cleanup",
      4: "Heavy cleanup",
      5: "Maximum polish"
    };
    return labels[level] || labels[3];
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
                  { label: "Sales Prospects", path: "/sales-prospects" },
                  { label: "Installation Department", path: "/installation" },
                  { label: "Service Department", path: "/service-pipeline" },
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
          <p className="text-sm text-muted-foreground mt-1">Enter process details and paste or type steps to format with AI</p>
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
                      placeholder="e.g., Split System AC Diagnosis"
                      data-testid="input-process-name"
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
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                    <Info className="h-3 w-3" />
                    Tip: Paste markdown-formatted text from AI tools or other sources
                  </p>
                  <FormControl>
                    <TiptapEditor
                      content={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Brief description of this process. Use the toolbar to add formatting, images, and links."
                      attachedFiles={pendingFiles.map(pf => ({
                        id: pf.id,
                        filename: pf.file.name,
                        fileType: pf.file.type.startsWith('image/') ? 'image' : 'file',
                      }))}
                      processId={createdProcessId}
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
                      <SelectTrigger data-testid="select-process-category">
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

            {/* Steps Input Section */}
            <div className="space-y-3">
              <FormLabel>Steps (optional)</FormLabel>
              <p className="text-sm text-muted-foreground">
                Paste or type all steps below, then click "Format with AI" to organize them. Or skip steps and just attach files below.
              </p>
              
              <Textarea
                ref={textareaRef}
                value={stepsText}
                onChange={(e) => setStepsText(e.target.value)}
                placeholder="Paste or type your steps here. Examples:&#10;- Plain text list&#10;- Numbered steps from another source&#10;- Natural language instructions&#10;&#10;The AI will format them into clean, numbered steps."
                rows={8}
                className="font-mono text-sm"
                data-testid="textarea-steps-input"
              />

              {/* AI Cleanup Toggle and Settings */}
              <div className="space-y-3 p-4 bg-muted rounded-lg">
                {/* AI Cleanup Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="ai-cleanup-toggle" className="text-sm font-medium">
                      AI Cleanup
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Use OpenAI to format and polish your steps
                    </p>
                  </div>
                  <Switch
                    id="ai-cleanup-toggle"
                    checked={aiCleanupEnabled}
                    onCheckedChange={setAiCleanupEnabled}
                    data-testid="switch-ai-cleanup"
                  />
                </div>

                {/* AI Cleanup Level Slider (only shown when AI is enabled) */}
                {aiCleanupEnabled && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Cleanup Level: {cleanupLevel}</label>
                      <span className="text-xs text-muted-foreground">{getCleanupLabel(cleanupLevel)}</span>
                    </div>
                    <Slider
                      value={[cleanupLevel]}
                      onValueChange={(value) => setCleanupLevel(value[0])}
                      min={1}
                      max={5}
                      step={1}
                      className="w-full"
                      data-testid="slider-cleanup-level"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Lower = keeps your wording | Higher = more professional polish
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePaste}
                  className="flex-1"
                  data-testid="button-paste"
                >
                  <Clipboard className="h-4 w-4 mr-2" />
                  Paste
                </Button>
                <Button
                  type="button"
                  onClick={handleFormat}
                  disabled={!stepsText.trim() || isFormatting}
                  className="flex-1"
                  data-testid="button-format"
                >
                  {isFormatting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Formatting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Format with AI
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Formatted Steps Preview (Editable) */}
            {steps.length > 0 && (
              <div className="space-y-3 p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Formatted Steps ({steps.length})</h3>
                  <p className="text-xs text-muted-foreground">Edit any step before saving</p>
                </div>
                <div className="space-y-2">
                  {steps.map((step) => (
                    <div key={step.id} className="flex items-start gap-2 p-3 bg-background rounded-lg" data-testid={`step-item-${step.id}`}>
                      <span className="text-sm font-semibold min-w-[28px] flex-shrink-0 mt-2">{step.stepNumber}.</span>
                      <Textarea
                        value={step.instruction}
                        onChange={(e) => updateStep(step.id, e.target.value)}
                        className="flex-1 min-h-[60px] text-sm resize-none"
                        data-testid={`textarea-step-${step.id}`}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 mt-1"
                        onClick={() => removeStep(step.id)}
                        data-testid={`button-remove-step-${step.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* File Attachments Section */}
            <FileUploadSection
              files={pendingFiles}
              onFilesChange={setPendingFiles}
              maxTotalSizeMB={50}
              disabled={createMutation.isPending || isUploadingFiles}
            />

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
                  disabled={createMutation.isPending || isUploadingFiles || (steps.length === 0 && pendingFiles.length === 0)}
                  className="flex-1"
                  data-testid="button-save-process"
                >
                  {isUploadingFiles ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading files...
                    </>
                  ) : createMutation.isPending ? (
                    "Saving..."
                  ) : (
                    "Save Process"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}
