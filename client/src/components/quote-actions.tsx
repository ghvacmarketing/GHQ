import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Calculator, Copy, RotateCcw, UserPlus } from "lucide-react";
import trelloIcon from "@assets/trello_1757379276597.png";

interface QuoteActionsProps {
  onGenerateQuote: () => void;
  onCopyQuote: () => void;
  onMarkAccepted: () => void;
  onMarkPending: () => void;
  onStartOver: () => void;
  onConvertToLead?: () => void;
  isGenerating: boolean;
  quoteGenerated: boolean;
  quoteStatus?: string;
}

export default function QuoteActions({
  onGenerateQuote,
  onCopyQuote,
  onMarkAccepted,
  onMarkPending,
  onStartOver,
  onConvertToLead,
  isGenerating,
  quoteGenerated,
  quoteStatus,
}: QuoteActionsProps) {
  const buttonsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to buttons when quote is generated
  useEffect(() => {
    if (quoteGenerated && buttonsRef.current) {
      setTimeout(() => {
        buttonsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 500); // Small delay to allow slide-in animation to complete
    }
  }, [quoteGenerated]);
  return (
    <div className="space-y-4">
      {!quoteGenerated && (
        <Button
          onClick={onGenerateQuote}
          disabled={isGenerating}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
          data-testid="button-generate-quote"
        >
          <Calculator className="h-5 w-5" />
          <span>Generate Quote</span>
        </Button>
      )}

      {quoteGenerated && (
        <>
          <Button
            onClick={onCopyQuote}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 pulse-success slide-in"
            data-testid="button-copy-quote"
          >
            <Copy className="h-4 w-4" />
            <span>Copy Quote</span>
          </Button>

          {onConvertToLead && (
            <Button
              onClick={onConvertToLead}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 slide-in"
              data-testid="button-convert-to-lead"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add as Sales Lead</span>
            </Button>
          )}

          <div ref={buttonsRef} className="grid grid-cols-2 gap-3 slide-in">
            <Button
              onClick={onMarkAccepted}
              disabled={quoteStatus === 'accepted' || quoteStatus === 'pending'}
              className={`font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 ${
                quoteStatus === 'accepted'
                  ? 'bg-gray-100 border border-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-white hover:bg-gray-50 border border-gray-200'
              }`}
              style={quoteStatus === 'accepted' ? { color: '#9ca3af' } : { color: '#0055cc' }}
              data-testid="button-mark-accepted"
            >
              <img src={trelloIcon} alt="Trello" className={`h-4 w-4 ${quoteStatus === 'accepted' ? 'opacity-50' : ''}`} />
              <span>{quoteStatus === 'accepted' ? 'Accepted ✓' : 'Accepted'}</span>
            </Button>
            <Button
              onClick={onMarkPending}
              disabled={quoteStatus === 'accepted' || quoteStatus === 'pending'}
              className={`font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 ${
                quoteStatus === 'pending'
                  ? 'bg-gray-100 border border-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-white hover:bg-gray-50 border border-gray-200'
              }`}
              style={quoteStatus === 'pending' ? { color: '#9ca3af' } : { color: '#0055cc' }}
              data-testid="button-mark-pending"
            >
              <img src={trelloIcon} alt="Trello" className={`h-4 w-4 ${quoteStatus === 'pending' ? 'opacity-50' : ''}`} />
              <span>{quoteStatus === 'pending' ? 'Pending ✓' : 'Pending'}</span>
            </Button>
          </div>
          
          <Button
            onClick={onStartOver}
            variant="outline"
            className="w-full border-muted-foreground/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 mt-3"
            data-testid="button-start-over"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Start New Service Quote</span>
          </Button>
        </>
      )}
    </div>
  );
}
