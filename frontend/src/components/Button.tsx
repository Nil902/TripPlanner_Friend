import type { ReactNode, CSSProperties } from 'react';
import { PINE, BORDER, INK } from '../lib/constants';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  type?: 'button' | 'submit';
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  style,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        borderRadius: 8,
        border: 'none',
        background: disabled ? '#C9C3B5' : PINE,
        color: '#fff',
        fontSize: 15,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  style,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        background: '#fff',
        color: INK,
        fontSize: 15,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
