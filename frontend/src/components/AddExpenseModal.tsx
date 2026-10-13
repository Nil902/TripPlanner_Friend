import React, { useState } from 'react';
import { X, DollarSign, Receipt } from 'lucide-react';
import { BORDER, INK, MUTED, PINE, SERIF, ExpenseItem, Member } from '../lib/constants';
import { PrimaryButton, SecondaryButton } from './Button';

export interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  onAdd: (expense: ExpenseItem) => void | Promise<void>;
}

export default function AddExpenseModal({
  isOpen,
  onClose,
  members,
  onAdd,
}: AddExpenseModalProps) {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(members[0]?.id || '');
  const [category, setCategory] = useState('Food');
  const [splitBetween, setSplitBetween] = useState<string[]>(
    members.map((m) => m.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const num = parseFloat(amount);
    if (!desc.trim() || !Number.isFinite(num) || num <= 0) {
      setError('Please enter a valid description and positive amount.');
      return;
    }

    if (splitBetween.length === 0) {
      setError('Please select at least one person to split between.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onAdd({
        id: `exp-${Date.now()}`,
        desc: desc.trim(),
        amount: num,
        paidBy,
        category,
        splitBetween,
      });
      setDesc('');
      setAmount('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Expense could not be saved. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleMember = (name: string) => {
    setSplitBetween((curr) =>
      curr.includes(name) ? curr.filter((n) => n !== name) : [...curr, name],
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(36, 33, 28, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          maxWidth: 460,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FAF6EE',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: PINE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Receipt color="#fff" size={16} />
            </div>
            <div>
              <h2
                id="expense-modal-title"
                style={{
                  ...SERIF,
                  fontSize: 20,
                  fontWeight: 400,
                  margin: 0,
                  color: INK,
                }}
              >
                Log Group Expense
              </h2>
              <span style={{ fontSize: 12, color: MUTED }}>
                Split evenly across members for automatic settle-up
              </span>
            </div>
          </div>
          <button
            disabled={isSaving}
            type="button"
            onClick={onClose}
            aria-label="Close expense modal"
            title="Close"
            style={{
              border: 'none',
              background: 'transparent',
              color: MUTED,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              margin: '16px 24px 0',
              padding: '8px 12px',
              borderRadius: 8,
              background: '#FBF0E8',
              color: '#C1683F',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto' }}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="expense-description"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              What was this for?
            </label>
            <input
              id="expense-description"
              type="text"
              required
              placeholder="e.g. Pasteis tasting or Sintra Train Tickets"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${BORDER}`,
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label
                htmlFor="expense-amount"
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: INK,
                }}
              >
                Amount ($)
              </label>
              <div style={{ position: 'relative' }}>
                <DollarSign
                  size={15}
                  color={MUTED}
                  style={{ position: 'absolute', left: 10, top: 11 }}
                />
                <input
                  id="expense-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px 9px 30px',
                    borderRadius: 8,
                    border: `1px solid ${BORDER}`,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: INK,
                }}
              >
                Paid By
              </label>
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  fontSize: 14,
                  background: '#fff',
                  outline: 'none',
                }}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Category
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Food', 'Lodging', 'Activities', 'Transit'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 16,
                    border: `1px solid ${category === cat ? PINE : BORDER}`,
                    background: category === cat ? '#EFEAE0' : '#fff',
                    color: category === cat ? PINE : INK,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 6,
                color: INK,
              }}
            >
              Split Between
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {members.map((m) => {
                const isSelected = splitBetween.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isSelected ? PINE : BORDER}`,
                      background: isSelected ? PINE : '#fff',
                      color: isSelected ? '#fff' : INK,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {m.name} {isSelected ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <SecondaryButton type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Log Expense'}</PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
