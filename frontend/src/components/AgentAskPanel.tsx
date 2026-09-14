import { useState } from 'react';
import { Sparkles, Send, RotateCcw, AlertTriangle } from 'lucide-react';
import { PrimaryButton } from './Button';
import { PINE, BORDER, MUTED, INK } from '../lib/constants';
import { api } from '../lib/api';

interface AgentAskPanelProps {
  tripId: string;
}

const QUICK_QUESTIONS = [
  'Which places are the most popular to visit?',
  "What's the best place to visit here?",
  'Best cheap or free spots?',
  'Where should we eat?',
];

export default function AgentAskPanel({ tripId }: AgentAskPanelProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [askedQuestion, setAskedQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async (rawQuestion?: string) => {
    const questionText = (rawQuestion ?? question).trim();
    if (!questionText || isAsking) return;
    setIsAsking(true);
    setError(null);
    try {
      const result = await api.plan.ask(tripId, questionText);
      setAnswer(result.answer);
      setAskedQuestion(result.question);
      setQuestion('');
    } catch {
      setError('The agent could not answer right now. Please try again.');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div
      style={{
        padding: '14px 18px',
        borderRadius: 12,
        background: '#fff',
        border: `1px solid ${BORDER}`,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Sparkles size={16} color={PINE} />
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>
          Ask the AI Agent
        </span>
        <span style={{ fontSize: 11, color: MUTED }}>
          Popular spots, best places, budget picks & more
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAsk();
          }}
          placeholder="e.g. 'Which places are the most popular to visit?'"
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
          {isAsking ? 'Asking...' : 'Ask'}
        </PrimaryButton>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

      {answer && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            background: '#FAF8F5',
            border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: MUTED,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Q: {askedQuestion}
            </span>
            <button
              type="button"
              onClick={() => {
                setAnswer(null);
                setAskedQuestion('');
              }}
              title="Clear answer"
              aria-label="Clear answer"
              style={{
                background: 'none',
                border: 'none',
                padding: 2,
                color: MUTED,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <RotateCcw size={13} />
            </button>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.55,
              color: INK,
              whiteSpace: 'pre-line',
            }}
          >
            {answer}
          </p>
        </div>
      )}
    </div>
  );
}