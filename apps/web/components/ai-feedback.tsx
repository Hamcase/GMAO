'use client';

import { useState } from 'react';
import { Button } from '@kit/ui/button';
import { Textarea } from '@kit/ui/textarea';
import { Badge } from '@kit/ui/badge';
import { ThumbsUp, ThumbsDown, RefreshCw, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@kit/ui/utils';

interface AIFeedbackProps {
  onFeedback: (rating: 1 | -1, comment?: string) => Promise<void>;
  onRegenerate: (comment?: string) => Promise<void>;
  regenerationCount: number;
  maxRegenerations?: number;
  isAccepted: boolean;
  currentRating: 1 | -1 | null;
  disabled?: boolean;
}

export function AIFeedback({
  onFeedback,
  onRegenerate,
  regenerationCount,
  maxRegenerations = 5,
  isAccepted,
  currentRating,
  disabled = false,
}: AIFeedbackProps) {
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const handleThumbsUp = async () => {
    setLoading(true);
    setFeedbackStatus('submitting');
    try {
      await onFeedback(1, comment || undefined);
      setFeedbackStatus('success');
      setTimeout(() => setFeedbackStatus('idle'), 2000);
    } catch (error) {
      setFeedbackStatus('idle');
      console.error('Feedback error:', error);
    } finally {
      setLoading(false);
      setShowCommentBox(false);
      setComment('');
    }
  };

  const handleThumbsDown = async () => {
    if (!showCommentBox) {
      setShowCommentBox(true);
      return;
    }

    setLoading(true);
    setFeedbackStatus('submitting');
    try {
      await onFeedback(-1, comment || undefined);
      setFeedbackStatus('idle');
      setShowCommentBox(false);
      setComment('');
    } catch (error) {
      setFeedbackStatus('idle');
      console.error('Feedback error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenerationCount >= maxRegenerations) return;
    
    setLoading(true);
    try {
      await onRegenerate(comment || undefined);
      setShowCommentBox(false);
      setComment('');
    } catch (error) {
      console.error('Regeneration error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isAccepted) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/20">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">
          Réponse acceptée et sauvegardée
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Cette réponse vous convient-elle ?
          </span>
          {regenerationCount > 0 && (
            <Badge variant="outline" className="text-xs">
              Tentative {regenerationCount + 1}/{maxRegenerations}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={currentRating === 1 ? 'default' : 'outline'}
            onClick={handleThumbsUp}
            disabled={disabled || loading || currentRating === -1}
            className={cn(
              'gap-1.5',
              currentRating === 1 && 'bg-green-600 hover:bg-green-700'
            )}
          >
            <ThumbsUp className="h-4 w-4" />
            {currentRating === 1 ? 'Acceptée' : 'Valider'}
          </Button>

          <Button
            size="sm"
            variant={currentRating === -1 ? 'destructive' : 'outline'}
            onClick={handleThumbsDown}
            disabled={disabled || loading || currentRating === 1}
            className="gap-1.5"
          >
            <ThumbsDown className="h-4 w-4" />
            {showCommentBox ? 'Confirmer' : 'Refuser'}
          </Button>
        </div>
      </div>

      {showCommentBox && (
        <div className="space-y-2 pt-2">
          <div className="flex items-start gap-2">
            <MessageSquare className="mt-2 h-4 w-4 text-muted-foreground" />
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder="Pourquoi cette réponse ne convient pas ? (optionnel mais recommandé pour améliorer la régénération)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
              
              {regenerationCount < maxRegenerations ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={loading}
                    className="gap-1.5"
                  >
                    <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                    {loading ? 'Régénération...' : 'Régénérer la réponse'}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {maxRegenerations - regenerationCount} tentatives restantes
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-2 dark:border-orange-900 dark:bg-orange-950/20">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <span className="text-xs text-orange-700 dark:text-orange-300">
                    Limite de régénération atteinte. Essayez de reformuler votre demande initiale.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {feedbackStatus === 'success' && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2 dark:border-green-900 dark:bg-green-950/20">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="text-sm text-green-700 dark:text-green-300">
            Merci pour votre retour ! Réponse sauvegardée.
          </span>
        </div>
      )}
    </div>
  );
}
