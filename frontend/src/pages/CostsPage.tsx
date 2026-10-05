import { useState, useEffect, useCallback } from 'react';
import type { SettleUpReport } from '@shared/types';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Wallet,
} from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadExpenseData = useCallback(async () => {
    if (!tripId) {
      setIsLoading(false);
      setLoadError('Choose a trip before viewing expenses.');
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const [data, report] = await Promise.all([
        api.expenses.list(tripId),
        api.expenses.settleUp(tripId),
      ]);
      const mapped: ExpenseItem[] = data.map((expense) => ({
        id: expense.id,
        paidBy: expense.paid_by,
        amount: expense.amount,
        desc: expense.description,
        category: expense.category || 'activity',
        splitBetween: expense.split_between || [],
      }));
      setExpenses(mapped);
      setSettleUpReport(report);
    } catch (error: unknown) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load expenses and settle-up details.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void loadExpenseData();
  }, [loadExpenseData]);

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
    await api.expenses.create(tripId, {
      paid_by: expense.paidBy,
      amount: expense.amount,
      description: expense.desc,
      category: expense.category || 'activity',
      split_between: expense.splitBetween || members.map((m) => m.id),
    });
    await loadExpenseData();
  };

  const canAddExpense = members.length > 0 && !isLoading && loadError === null;

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
          disabled={!canAddExpense}
          aria-describedby={members.length === 0 ? 'expense-members-help' : undefined}
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
            cursor: canAddExpense ? 'pointer' : 'not-allowed',
            opacity: canAddExpense ? 1 : 0.55,
          }}
        >
          <Plus size={15} /> Add Expense
        </button>
      </div>

      {members.length === 0 && (
        <p
          id="expense-members-help"
          role="status"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          Add at least one trip member before logging a shared expense.
        </p>
      )}

      {isLoading && (
        <div
          role="status"
          className="mb-5 flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-10 text-sm text-stone-600"
        >
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
          Loading expenses and settle-up details…
        </div>
      )}

      {!isLoading && loadError && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <AlertTriangle aria-hidden="true" size={18} />
          <span className="min-w-0 flex-1">
            {loadError}
          </span>
          <button
            type="button"
            onClick={() => void loadExpenseData()}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            <RefreshCw aria-hidden="true" size={14} /> Retry
          </button>
        </div>
      )}

      {!isLoading && !loadError && (
        <>
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
          disabled={!canAddExpense}
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
            cursor: canAddExpense ? 'pointer' : 'not-allowed',
            opacity: canAddExpense ? 1 : 0.55,
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
          {balances.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13, margin: 0 }}>
              {expenses.length === 0
                ? 'Balances will appear after the first expense is logged.'
                : 'No member balance details are available yet.'}
            </p>
          ) : balances.map((b) => (
            <div
              key={b.id}
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
                  ? `Is owed $${b.net.toFixed(2)}`
                  : `Owes $${Math.abs(b.net).toFixed(2)}`}
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

        {expenses.length === 0 ? (
          <div
            style={{
              padding: '16px',
              borderRadius: 8,
              background: '#FAF6EE',
              fontSize: 13,
              color: MUTED,
            }}
          >
            No transfers to calculate yet. Log an expense to create the first
            settle-up summary.
          </div>
        ) : transfers.length === 0 ? (
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
        </>
      )}

      <AddExpenseModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        members={members}
        onAdd={handleAddExpense}
      />
    </div>
  );
}
