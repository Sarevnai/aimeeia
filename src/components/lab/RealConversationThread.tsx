import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { User, Bot, Headphones } from 'lucide-react';

interface Message {
  id: number;
  direction: 'inbound' | 'outbound';
  body: string | null;
  sender_type: string | null;
  created_at: string | null;
}

interface TurnAnalysis {
  turn_number: number;
  score: number;
  summary: string;
}

interface RealConversationThreadProps {
  messages: Message[];
  loading: boolean;
  turnAnalyses?: TurnAnalysis[];
  selectedTurn?: number | null;
  onTurnSelect?: (turnNumber: number) => void;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getScoreBadgeColor(score: number): string {
  if (score >= 9) return 'bg-green-100 text-green-700 border-green-200';
  if (score >= 7) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  if (score >= 5) return 'bg-orange-100 text-orange-700 border-orange-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

export default function RealConversationThread({
  messages,
  loading,
  turnAnalyses,
  selectedTurn,
  onTurnSelect,
}: RealConversationThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Carregando mensagens...</div>;
  }

  if (messages.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">Selecione uma conversa</div>;
  }

  // Map outbound messages to turn numbers for score display
  let turnCounter = 0;
  const messageToTurn = new Map<number, number>();
  let hadInbound = false;

  for (const msg of messages) {
    if (msg.direction === 'inbound') {
      hadInbound = true;
    } else if (msg.direction === 'outbound' && msg.body) {
      turnCounter++;
      messageToTurn.set(msg.id, turnCounter);
      hadInbound = false;
    }
  }

  const turnAnalysisMap = new Map<number, TurnAnalysis>();
  turnAnalyses?.forEach(ta => turnAnalysisMap.set(ta.turn_number, ta));

  let lastDate = '';

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
      {messages.map((msg) => {
        const msgDate = formatDate(msg.created_at);
        const showDate = msgDate !== lastDate;
        lastDate = msgDate;

        const isInbound = msg.direction === 'inbound';
        const isOperator = msg.sender_type === 'operator';
        const turnNum = messageToTurn.get(msg.id);
        const turnAnalysis = turnNum ? turnAnalysisMap.get(turnNum) : undefined;
        const isSelected = turnNum != null && selectedTurn === turnNum;

        return (
          <React.Fragment key={msg.id}>
            {showDate && (
              <div className="text-center text-[10px] text-muted-foreground py-1">
                {msgDate}
              </div>
            )}
            <div
              className={cn(
                'flex gap-2',
                isInbound ? 'justify-start' : 'justify-end',
                isSelected && 'ring-2 ring-primary/30 rounded-lg'
              )}
              onClick={() => turnNum && onTurnSelect?.(turnNum)}
              role={turnNum ? 'button' : undefined}
            >
              {isInbound && (
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-1">
                  <User className="h-3 w-3 text-blue-600" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[75%] rounded-lg px-3 py-2 text-xs',
                  isInbound
                    ? 'bg-muted'
                    : isOperator
                      ? 'bg-amber-50 border border-amber-200'
                      : 'bg-primary/10',
                  turnNum && 'cursor-pointer hover:opacity-80'
                )}
              >
                {!isInbound && (
                  <div className="flex items-center gap-1 mb-0.5">
                    {isOperator ? (
                      <Headphones className="h-2.5 w-2.5 text-amber-600" />
                    ) : (
                      <Bot className="h-2.5 w-2.5 text-primary" />
                    )}
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {isOperator ? 'Operador' : 'Aimee'}
                    </span>
                    {turnAnalysis && (
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1 py-0 h-3.5 ml-1 font-mono', getScoreBadgeColor(turnAnalysis.score))}
                      >
                        {turnAnalysis.score.toFixed(1)}
                      </Badge>
                    )}
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.body || '(mídia)'}</p>
                <span className="text-[9px] text-muted-foreground float-right mt-0.5">
                  {formatTime(msg.created_at)}
                </span>
              </div>
              {!isInbound && !isOperator && (
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
