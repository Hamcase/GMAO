'use client';

import { ScrollArea } from '@kit/ui/scroll-area';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Clock, ThumbsUp, ThumbsDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@kit/ui/utils';

interface ResponseHistoryItem {
  id: string;
  responseData: any;
  feedbackRating: 1 | -1 | null;
  regenerationCount: number;
  isAccepted: boolean;
  createdAt: Date;
}

interface AIResponseHistoryProps {
  history: ResponseHistoryItem[];
  currentResponseId: string;
  onSelectResponse: (id: string) => void;
}

export function AIResponseHistory({
  history,
  currentResponseId,
  onSelectResponse,
}: AIResponseHistoryProps) {
  if (history.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Historique des réponses</h3>
        <Badge variant="outline" className="text-xs">
          {history.length}
        </Badge>
      </div>

      <ScrollArea className="h-[300px] rounded-md border">
        <div className="space-y-2 p-3">
          {history.map((item, index) => {
            const isActive = item.id === currentResponseId;
            const ratingIcon = item.feedbackRating === 1 ? (
              <ThumbsUp className="h-3 w-3 text-green-600" />
            ) : item.feedbackRating === -1 ? (
              <ThumbsDown className="h-3 w-3 text-red-600" />
            ) : null;

            return (
              <Button
                key={item.id}
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onSelectResponse(item.id)}
                className={cn(
                  'w-full justify-start text-left',
                  isActive && 'border-2 border-primary'
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">
                      #{history.length - index}
                    </span>
                    {item.isAccepted && (
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                    )}
                    {ratingIcon}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      <p className="text-xs text-muted-foreground">
        Les réponses refusées peuvent être consultées pour comparaison
      </p>
    </div>
  );
}
