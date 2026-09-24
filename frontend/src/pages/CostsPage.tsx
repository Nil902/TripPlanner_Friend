import { useState, useEffect, useCallback } from 'react';
import type { SettleUpReport } from '@shared/types';
import { Plus, ArrowRight, CheckCircle2, Wallet } from 'lucide-react';
import {
  BORDER,
  CLAY,
  INK,
  MUTED,
  PINE,
  SERIF,
  ExpenseItem,
  Member,
} from '../lib/constants';
import AddExpenseModal from '../components/AddExpenseModal';
import { api } from '../lib/api';

export interface CostsPageProps {
  tripId: string;
  members: Member[];
}

export default function CostsPage({
  tripId,
  members,
}: CostsPageProps) {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [settleUpReport, setSettleUpReport] = useState<SettleUpReport | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const loadExpenses = useCallback(() => {
    if (!tripId) return;
    api.expenses
      .list(tripId)
      .then((data) => {
        if (Array.isArray(data)) {
          const mapped: ExpenseItem[] = data.map((e) => ({
            id: e.id,
            paidBy: e.paid_by,
            amount: e.amount,
            desc: e.description,
            category: e.category || 'activity',
            splitBetween: e.split_between || [],
          }));
          setExpenses(mapped);
        }
      })
      .catch(() => {
        // Fallback
      });
  }, [tripId]);

  const loadSettleUp = useCallback(() => {
    if (!tripId) return;
    api.expenses
      .settleUp(tripId)
      .then((report) => setSettleUpReport(report))
      .catch(() => setSettleUpReport(null));
  }, [tripId]);

  useEffect(() => {
    loadExpenses();
    loadSettleUp();
  }, [loadExpenses, loadSettleUp]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const perPerson = members.length > 0 ? total / members.length : 0;

  const balances = (settleUpReport?.user_balances ?? []).map((b) => ({
    name: members.find((m) => m.id === b.user_id)?.name || b.user_id,
    id: b.user_id,
    paid: b.total_paid,
    net: b.net_balance,
  }));

  const transfers = (settleUpReport?.transfers ?? []).map((t) => ({
    from: members.find((m) => m.id === t.debtor_id)?.name || t.debtor_id,
    to: members.find((m) => m.id === t.creditor_id)?.name || t.creditor_id,
    amount: t.amount,
  }));

  const getMemberName = (id: string): string => {
    const member = members.find((m) => m.id === id);
    return member?.name || id;
  };

  const handleAddExpense = async (expense: ExpenseItem) => {
    try {
      await api.expenses.create(tripId, {
        paid_by: expense.paidBy,
        amount: expense.amount,
        description: expense.desc,
        category: expense.category || 'activity',
        split_between: expense.splitBetween || members.map((m) => m.id),
      });
      loadExpenses();
    } catch {
      setExpenses((prev) => [...prev, expense]);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 700, margin: '0 auto' }}>
      {/* Title & Summary banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              ...SERIF,
              fontSize: 'clamp(22px, 5vw, 26px)',
              fontWeight: 400,
              margin: '0 0 4px',
              color: INK,
            }}
          >
            Expenses & Settle-Up
          </h1>
          <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>
            Split evenly across all members using greedy debt cancellation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: PINE,
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} /> Add Expense
        </button>
      </div>

      {/* Metrics Card */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            background: '#fff',
            border: `1px solid ${BORDER}`,
          }}
        >
          <span style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 2 }}>
            Total Group Spend
          </span>
          <span style={{ fontSize: 22, fontWeight: 600, color: INK }}>
            ${total.toFixed(2)}
          </span>
        </div>
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            background: '#fff',
            border: `1px solid ${BORDER}`,
          }}
        >
          <span style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 2 }}>
            Per Person Average
          </span>
          <span style={{ fontSize: 22, fontWeight: 600, color: PINE }}>
            ${perPerson.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Logged Expenses List */}
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          background: '#fff',
          marginBottom: 24,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${BORDER}`,
            background: '#FAF6EE',
            fontSize: 13,
            fontWeight: 600,
            color: INK,
          }}
        >
          Logged Expenses ({expenses.length})
        </div>

        {expenses.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: MUTED, fontSize: 13, fontStyle: 'italic' }}>
            No expenses logged yet. Add group expenses below to split costs and compute settle-up transfers.
          </div>
        ) : (
          expenses.map((e, i) => (
            <div
              key={e.id || i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom:
                  i < expenses.length - 1 ? `1px solid ${BORDER}` : 'none',
              }}
            >
              <div>
                <span style={{ fontSize: 14, fontWeight: 500, color: INK, display: 'block' }}>
                  {e.desc}
                </span>
                <span style={{ fontSize: 12, color: MUTED }}>
                  Paid by <strong>{getMemberName(e.paidBy)}</strong> {e.category ? `• ${e.category}` : ''}
                </span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>
                ${e.amount.toFixed(2)}
              </span>
            </div>
          ))
        )}

        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          style={{
            width: '100%',
            padding: '12px 16px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'center',
            color: PINE,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          <Plus size={15} /> Add another expense
        </button>
      </div>

      {/* Net Balances Breakdown */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: `1px solid ${BORDER}`,
          padding: '18px 20px',
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            display: 'block',
            marginBottom: 12,
            color: INK,
          }}
        >
          Member Net Balances
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {balances.map((b) => (
            <div
              key={b.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 0',
                fontSize: 14,
                borderBottom: `1px dashed ${BORDER}`,
              }}
            >
              <span>
                <strong>{b.name}</strong>{' '}
                <span style={{ fontSize: 12, color: MUTED }}>
                  (paid ${b.paid.toFixed(2)})
                </span>
              </span>
              <span
                style={{
                  color: b.net >= 0 ? PINE : CLAY,
                  fontWeight: 600,
                  background: b.net >= 0 ? '#EEF3ED' : '#FAF0EB',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                {b.net >= 0
                  ? `+is owed $${b.net.toFixed(2)}`
                  : `-owes $${Math.abs(b.net).toFixed(2)}`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Greedy Settle-Up Report */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: `1px solid ${BORDER}`,
          padding: '18px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <Wallet size={16} color={PINE} />
          <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>
            Greedy Settle-Up Transfers ({transfers.length})
          </span>
        </div>

        {transfers.length === 0 ? (
          <div
            style={{
              padding: '16px',
              borderRadius: 8,
              background: '#EEF3ED',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: PINE,
            }}
          >
            <CheckCircle2 size={16} /> All group expenses are fully settled!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {transfers.map((t, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: '#FAF6EE',
                  border: `1px solid ${BORDER}`,
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{t.from}</strong>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      color: MUTED,
                    }}
                  >
                    pays <ArrowRight size={12} />
                  </span>
                  <strong>{t.to}</strong>
                </div>
                <span
                  style={{
                    fontWeight: 700,
                    color: PINE,
                    fontFamily: 'monospace',
                    fontSize: 14,
                  }}
                >
                  ${t.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddExpenseModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        members={members}
        onAdd={handleAddExpense}
      />
    </div>
  );
}
