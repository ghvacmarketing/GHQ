import { Button } from "@/components/ui/button";
import { Calculator, Copy, RotateCcw } from "lucide-react";
import trelloIcon from "@assets/trello_1757379276597.png";

interface QuoteActionsProps {
  onGenerateQuote: () => void;
  onCopyQuote: () => void;
  onMarkAccepted: () => void;
  onMarkPending: () => void;
  onStartOver: () => void;
  isGenerating: boolean;
  quoteGenerated: boolean;
}

export default function QuoteActions({
  onGenerateQuote,
  onCopyQuote,
  onMarkAccepted,
  onMarkPending,
  onStartOver,
  isGenerating,
  quoteGenerated,
}: QuoteActionsProps) {
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

          <div className="grid grid-cols-2 gap-3 slide-in">
            <Button
              onClick={onMarkAccepted}
              className="bg-white hover:bg-gray-50 border border-gray-200 font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              style={{ color: '#0055cc' }}
              data-testid="button-mark-accepted"
            >
              <img src={trelloIcon} alt="Trello" className="h-4 w-4" />
              <span>Accepted</span>
            </Button>
            <Button
              onClick={onMarkPending}
              className="bg-white hover:bg-gray-50 border border-gray-200 font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              style={{ color: '#0055cc' }}
              data-testid="button-mark-pending"
            >
              <img src={trelloIcon} alt="Trello" className="h-4 w-4" />
              <span>Pending</span>
            </Button>
          </div>
          
          <Button
            onClick={onStartOver}
            variant="outline"
            className="w-full border-muted-foreground/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 mt-3"
            data-testid="button-start-over"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Start New Quote</span>
          </Button>
        </>
      )}
    </div>
  );
}
