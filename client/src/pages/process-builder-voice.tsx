import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form } from "@/components/ui/form";
import { Mic, MicOff, Loader2, Check, Keyboard, ArrowLeft, Settings } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { insertProcessSchema, type ProcessStep, type Category } from "@shared/schema";
import { nanoid } from "nanoid";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import NavDropdown from "@/components/nav-dropdown";
import redlogo from "@assets/redlogo.webp";
import { queryClient } from "@/lib/queryClient";

const formSchema = insertProcessSchema;
type FormData = z.infer<typeof formSchema>;

const prompts = [
  { field: "name", prompt: "What is the name of this process?", context: "the process name (a short title)" },
  { field: "description", prompt: "Please provide a brief description of this process.", context: "a brief description of the process" },
  { field: "category", prompt: "What category does this process belong to?", context: "the category name (e.g., Maintenance, Repair, Installation)" },
  { field: "rationale", prompt: "Why is this process necessary? Provide details and relevant information.", context: "the rationale explaining why this process is necessary" },
  { field: "steps", prompt: "Now, please describe each step one by one. Say 'next step' between each instruction. Say 'finished' when done.", context: "step-by-step instructions" },
];

export default function ProcessBuilderVoice() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [skippedToType, setSkippedToType] = useState(false);
  const [processData, setProcessData] = useState<Partial<FormData>>({
    name: "",
    description: "",
    category: "",
    rationale: "",
    steps: [],
  });

  const mainContentRef = useRef<HTMLDivElement>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: processData,
  });

  const transcribeMutation = useMutation({
    mutationFn: async ({ audioBlob, context }: { audioBlob: Blob; context: string }) => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('context', context);
      
      const response = await fetch('/api/voice/transcribe-with-context', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Transcription failed');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.summary === "NO_AUDIO_DETECTED") {
        toast({
          title: "No audio detected",
          description: "Please try recording again.",
          variant: "destructive",
        });
        return;
      }
      handleTranscriptionResult(data.summary);
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

  const handleTranscriptionResult = (text: string) => {
    const currentPrompt = prompts[currentPromptIndex];
    
    if (currentPrompt.field === "steps") {
      const stepTexts = text
        .split(/next step|step \d+|then|after that/i)
        .map(s => s.trim())
        .filter(s => s && !s.toLowerCase().includes('finished'));
      
      const newSteps: ProcessStep[] = stepTexts.map((instruction, idx) => ({
        id: nanoid(),
        stepNumber: (processData.steps?.length || 0) + idx + 1,
        instruction,
      }));
      
      const updatedSteps = [...(processData.steps || []), ...newSteps];
      setProcessData(prev => ({
        ...prev,
        steps: updatedSteps,
      }));
      
      if (text.toLowerCase().includes('finished')) {
        if (currentPromptIndex < prompts.length - 1) {
          setCurrentPromptIndex(currentPromptIndex + 1);
        }
      }
    } else {
      setProcessData(prev => ({
        ...prev,
        [currentPrompt.field]: text,
      }));
      
      if (currentPromptIndex < prompts.length - 1) {
        setCurrentPromptIndex(currentPromptIndex + 1);
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const currentPrompt = prompts[currentPromptIndex];
        transcribeMutation.mutate({ audioBlob, context: currentPrompt.context });
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
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
    }
  };

  const handleSkipToType = () => {
    setSkippedToType(true);
  };

  const handleNext = () => {
    const currentField = prompts[currentPromptIndex].field;
    if (processData[currentField as keyof Partial<FormData>]) {
      setSkippedToType(false);
      if (currentPromptIndex < prompts.length - 1) {
        setCurrentPromptIndex(currentPromptIndex + 1);
      }
    } else {
      toast({
        title: "Please fill in the field",
        description: "Enter a value before moving to the next step.",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    const finalData: FormData = {
      name: processData.name || "",
      description: processData.description || "",
      category: processData.category || "",
      rationale: processData.rationale || "",
      steps: processData.steps || [],
    };
    createMutation.mutate(finalData);
  };

  const currentPrompt = prompts[currentPromptIndex];
  const allFieldsFilled = processData.name && processData.description && processData.category && processData.rationale && (processData.steps?.length || 0) > 0;

  const completionPercentage = () => {
    let completed = 0;
    if (processData.name) completed += 20;
    if (processData.description) completed += 20;
    if (processData.category) completed += 20;
    if (processData.rationale) completed += 20;
    if ((processData.steps?.length || 0) > 0) completed += 20;
    return completed;
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
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
      <main ref={mainContentRef} className="container mx-auto px-4 py-6 max-w-2xl">
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
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Voice-Guided Process Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">Create a process using voice or keyboard input</p>
        </div>

        <Form {...form}>
          <div className="space-y-6">
            {/* Prompt Progress List */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Progress:</p>
                <div className="space-y-2">
                  {prompts.map((p, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-start gap-2 text-sm p-2 rounded ${
                        idx === currentPromptIndex ? 'bg-primary/10 text-primary font-medium' : 
                        idx < currentPromptIndex ? 'text-muted-foreground' : 
                        'text-muted-foreground'
                      }`}
                      data-testid={`prompt-item-${idx}`}
                    >
                      <span className="min-w-[24px] flex-shrink-0">
                        {idx < currentPromptIndex ? <Check className="h-4 w-4 text-green-500" /> : `${idx + 1}.`}
                      </span>
                      <span>{p.prompt}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Current Prompt */}
            <Card className="border-primary/50">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground mb-2">Current Step:</p>
                <p className="text-lg font-medium" data-testid="text-current-prompt">{currentPrompt.prompt}</p>
                
                {/* Recording Controls */}
                {!skippedToType ? (
                  <div className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Button
                        type="button"
                        size="lg"
                        variant={isRecording ? "destructive" : "default"}
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={transcribeMutation.isPending || createMutation.isPending}
                        className="h-14"
                        data-testid="button-record-toggle"
                      >
                        {transcribeMutation.isPending || createMutation.isPending ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : isRecording ? (
                          <>
                            <MicOff className="h-5 w-5 mr-2" />
                            Stop Recording
                          </>
                        ) : (
                          <>
                            <Mic className="h-5 w-5 mr-2" />
                            Start Recording
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        onClick={handleSkipToType}
                        disabled={transcribeMutation.isPending || createMutation.isPending}
                        className="h-14"
                        data-testid="button-skip-to-type"
                      >
                        <Keyboard className="h-5 w-5 mr-2" />
                        Type Instead
                      </Button>
                    </div>

                    {isRecording && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
                        Recording in progress...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 space-y-4">
                    {currentPrompt.field === "category" ? (
                      <Select 
                        value={processData.category || ""} 
                        onValueChange={(value) => setProcessData(prev => ({ ...prev, category: value }))}
                      >
                        <SelectTrigger data-testid="select-voice-category">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(category => (
                            <SelectItem key={category.id} value={category.name}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : currentPrompt.field === "description" || currentPrompt.field === "rationale" ? (
                      <Textarea
                        value={processData[currentPrompt.field as keyof Partial<FormData>] as string || ""}
                        onChange={(e) => setProcessData(prev => ({ ...prev, [currentPrompt.field]: e.target.value }))}
                        placeholder={`Enter ${currentPrompt.field}...`}
                        rows={4}
                        data-testid={`textarea-type-${currentPrompt.field}`}
                      />
                    ) : (
                      <Input
                        value={processData[currentPrompt.field as keyof Partial<FormData>] as string || ""}
                        onChange={(e) => setProcessData(prev => ({ ...prev, [currentPrompt.field]: e.target.value }))}
                        placeholder={`Enter ${currentPrompt.field}...`}
                        data-testid={`input-type-${currentPrompt.field}`}
                      />
                    )}
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSkippedToType(false)}
                        className="flex-1"
                      >
                        Back to Voice
                      </Button>
                      <Button
                        type="button"
                        onClick={handleNext}
                        className="flex-1"
                        data-testid="button-next-prompt"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Captured Data Preview */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Captured Data:</p>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="font-medium">{processData.name || <span className="text-muted-foreground italic">Not yet captured</span>}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Description:</span>{" "}
                    <span className="font-medium">{processData.description || <span className="text-muted-foreground italic">Not yet captured</span>}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Category:</span>{" "}
                    <span className="font-medium">{processData.category || <span className="text-muted-foreground italic">Not yet captured</span>}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rationale:</span>{" "}
                    <span className="font-medium">{processData.rationale || <span className="text-muted-foreground italic">Not yet captured</span>}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Steps:</span>{" "}
                    <span className="font-medium">{processData.steps?.length || 0} step(s)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Form>
      </main>

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
            onClick={handleSave}
            disabled={!allFieldsFilled || createMutation.isPending}
            className="flex-1"
            data-testid="button-save-voice-process"
          >
            {createMutation.isPending ? "Saving..." : "Save Process"}
          </Button>
        </div>
      </div>
    </div>
  );
}
