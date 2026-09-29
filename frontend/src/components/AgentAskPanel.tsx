import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, RotateCcw, AlertTriangle, ChevronDown } from 'lucide-react';
import { PrimaryButton } from './Button';
import { PINE, BORDER, MUTED, INK } from '../lib/constants';
import { api } from '../lib/api';

interface AgentAskPanelProps {
  tripId: string;
  destination?: string;
}

interface Message {
  role: 'user' | 'agent';
  text: string;
}

const QUICK_QUESTIONS = [
  'Which places are the most popular to visit?',
  "What's the best place to visit here?",
  'Best cheap or free spots?',
  'Where should we eat?',
  'Recommend temples or historic sites',
  'What can I do in the evening?',
];

export default function AgentAskPanel({ tripId, destination }: AgentAskPanelProps) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAsk = async (rawQuestion?: string) => {
    const questionText = (rawQuestion ?? question).trim();
    if (!questionText || isAsking) return;
    setIsAsking(true);
    setError(null);

    // Optimistically add user message
    setMessages((prev) => [...prev, { role: 'user', text: questionText }]);
    setQuestion('');

    try {
      const result = await api.plan.ask(tripId, questionText);
      setMessages((prev) => [...prev, { role: 'agent', text: result.answer }]);
    } catch {
      setError('The agent could not answer right now. Please try again.');
      // Remove the optimistic user message on failure
      setMessages((prev) => prev.slice(0, -1));
      setQuestion(questionText);
    } finally {
      setIsAsking(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    setError(null);
  };

  const placeholder = destination
    ? `Ask about ${destination}…`
    : "e.g. 'Which places are the most popular to visit?'";

  return (
    <div
      style={{
        borderRadius: 12,
        background: '#fff',
        border: `1px solid ${BORDER}`,
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 18px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          borderBottom: isExpanded ? `1px solid ${BORDER}` : 'none',
        }}
      >
        <Sparkles size={16} color={PINE} />
        <span style={{ fontSize: 13, fontWeight: 600, color: INK, flex: 1 }}>
          Ask the AI Agent{destination ? ` · ${destination}` : ''}
        </span>
        {messages.length > 0 && (
          <span
            style={{
              fontSize: 11,
              background: PINE,
              color: '#fff',
              borderRadius: 10,
              padding: '1px 7px',
              marginRight: 4,
            }}
          >
            {messages.filter((m) => m.role === 'user').length}
          </span>
        )}
        <ChevronDown
          size={15}
          color={MUTED}
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease',
          }}
        />
      </button>

      {isExpanded && (
        <div style={{ padding: '12px 18px 16px' }}>
          {/* Conversation history */}
          {messages.length > 0 && (
            <div
              ref={scrollRef}
              style={{
                maxHeight: 320,
                overflowY: 'auto',
                marginBottom: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  {msg.role === 'agent' && (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: PINE,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2,
                      }}
                    >
                      <Sparkles size={12} color="#fff" />
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                      background: msg.role === 'user' ? '#EEF3ED' : '#FAF8F5',
                      border: `1px solid ${BORDER}`,
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: INK,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {isAsking && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: PINE,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    <Sparkles size={12} color="#fff" />
                  </div>
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px 12px 12px 12px',
                      background: '#FAF8F5',
                      border: `1px solid ${BORDER}`,
                      fontSize: 13,
                      color: MUTED,
                    }}
                  >
                    Thinking…
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input area */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAsk();
              }}
              placeholder={placeholder}
              aria-label="Ask the AI agent a question"
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 13,
                outline: 'none',
                background: '#FAF6EE',
              }}
            />
            <PrimaryButton
              onClick={() => handleAsk()}
              disabled={isAsking || !question.trim()}
              style={{
                fontSize: 13,
                padding: '8px 16px',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Send size={13} />
              {isAsking ? 'Asking…' : 'Ask'}
            </PrimaryButton>
          </div>

          {/* Quick questions */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: messages.length > 0 ? 4 : 0 }}>
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleAsk(q)}
                disabled={isAsking}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: '#F8F9FA',
                  border: `1px solid ${BORDER}`,
                  color: MUTED,
                  cursor: 'pointer',
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Clear history button */}
          {messages.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                type="button"
                onClick={handleClearHistory}
                title="Clear conversation"
                aria-label="Clear conversation history"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: MUTED,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                <RotateCcw size={11} /> Clear conversation
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                padding: '8px 12px',
                borderRadius: 8,
                background: '#FDF2EC',
                border: '1px solid #F1C7B2',
                color: '#B4553A',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <AlertTriangle size={14} /> {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}