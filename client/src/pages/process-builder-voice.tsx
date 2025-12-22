import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, MicOff, Loader2, ArrowLeft, Settings, X } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertProcessSchema, type ProcessStep, type Category } from "@shared/schema";
import { nanoid } from "nanoid";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import { queryClient, apiRequest } from "@/lib/queryClient";

const formSchema = insertProcessSchema.extend({
  name: z.string().min(1, "Process name is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
});

type FormData = z.infer<typeof formSchema>;

export default function ProcessBuilderVoice() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [cleanupLevel, setCleanupLevel] = useState(3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [remainingTime, setRemainingTime] = useState(300); // 5 minutes in seconds
  const [timerInterval, setTimerInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [timerInterval]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processes'] });
      toast({
        title: "Process created",
        description: "Your new process has been saved successfully.",
      });
      setLocation('/processes');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create process. Please try again.",
        variant: "destructive",
      });
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await processFullRecording(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRemainingTime(300); // Reset to 5 minutes

      // Start countdown timer
      const interval = setInterval(() => {
        setRemainingTime((prev) => {
          if (prev <= 1) {
            // Time's up - auto-stop recording
            clearInterval(interval);
            if (recorder.state === 'recording') {
              recorder.stop();
              setIsRecording(false);
              setMediaRecorder(null);
              toast({
                title: "Recording timeout",
                description: "Maximum recording time (5 minutes) reached. Processing your audio...",
              });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      setTimerInterval(interval);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Microphone error",
        description: "Could not access your microphone.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      
      // Clear the timer
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const processFullRecording = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('cleanupLevel', cleanupLevel.toString());
      
      const response = await fetch('/api/voice/transcribe-full-process', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const result = await response.json();
      
      // Add IDs to steps
      const stepsWithIds = result.steps.map((step: any) => ({
        ...step,
        id: nanoid(),
      }));

      // Update form with extracted data
      form.setValue('name', result.name);
      form.setValue('description', result.description);
      form.setValue('category', result.category);
      
      // Update steps state
      setSteps(stepsWithIds);
      setHasRecorded(true);

      toast({
        title: "Process extracted!",
        description: `Found ${stepsWithIds.length} steps. Review and edit before saving.`,
      });
    } catch (error) {
      console.error('Error processing recording:', error);
      toast({
        title: "Processing failed",
        description: "Please try recording again or use manual entry.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
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

  const onSubmit = (data: FormData) => {
    if (steps.length === 0) {
      toast({
        title: "No steps recorded",
        description: "Please record a process first",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({ ...data, steps });
  };

  const completionPercentage = () => {
    if (!hasRecorded) return 0;
    let completed = 0;
    if (form.watch('name')) completed += 25;
    if (form.watch('description')) completed += 25;
    if (form.watch('category')) completed += 25;
    if (steps.length > 0) completed += 25;
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
                currentPageTitle="Voice Process Builder"
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Voice Process Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">Record the entire process in one session - AI will format everything</p>
        </div>

        {!hasRecorded ? (
          <div className="space-y-6">
            {/* Instructions Card */}
            <Card>
              <CardContent className="p-6">
                <h2 className="font-semibold mb-3">What to say in your recording:</h2>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p><span className="font-medium text-foreground">1. Process Name:</span> "This is called Split System AC Diagnosis"</p>
                  <p><span className="font-medium text-foreground">2. Description:</span> "This process helps diagnose AC system problems"</p>
                  <p><span className="font-medium text-foreground">3. Category:</span> "It's for troubleshooting"</p>
                  <p><span className="font-medium text-foreground">4. Steps:</span> "First, go to thermostat and set 5 degrees below room temp. Then check return filter. Next, is there airflow at supply register..." (continue with all steps)</p>
                </div>
                <div className="mt-4 p-3 bg-primary/10 rounded-lg text-sm">
                  <strong>Tip:</strong> Speak naturally - the AI will extract all the information and format it properly. You can edit everything before saving.
                </div>
              </CardContent>
            </Card>

            {/* AI Cleanup Level Slider */}
            <div className="space-y-2 p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">AI Cleanup Level: {cleanupLevel}</label>
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

            {/* Record Button */}
            <Card className="border-primary/50">
              <CardContent className="p-8">
                <Button
                  type="button"
                  size="lg"
                  variant={isRecording ? "destructive" : "default"}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isProcessing}
                  className="w-full h-20 text-lg"
                  data-testid="button-record-full-process"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-6 w-6 mr-3 animate-spin" />
                      Processing your recording...
                    </>
                  ) : isRecording ? (
                    <>
                      <MicOff className="h-6 w-6 mr-3" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic className="h-6 w-6 mr-3" />
                      Record Full Process
                    </>
                  )}
                </Button>

                {isRecording && (
                  <div className="space-y-2 mt-4">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                      Recording in progress... Speak naturally about all 4 fields
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-2xl font-mono font-bold text-primary" data-testid="text-timer">
                        {formatTime(remainingTime)}
                      </span>
                      <span className="text-sm text-muted-foreground">remaining</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                  ✓ Process extracted! Review and edit below, then save.
                </p>
              </div>

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
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Brief description"
                        rows={2}
                        data-testid="input-process-description"
                      />
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

              {/* Formatted Steps (Editable) */}
              {steps.length > 0 && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Steps ({steps.length})</h3>
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

              {/* Fixed Bottom Action Bar */}
              <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 shadow-lg">
                <div className="container mx-auto max-w-2xl flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setHasRecorded(false);
                      setSteps([]);
                      form.reset();
                    }}
                    className="flex-1"
                    data-testid="button-record-again"
                  >
                    Record Again
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
        )}
      </main>
    </div>
  );
}
