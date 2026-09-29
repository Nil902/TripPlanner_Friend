import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthPage from './AuthPage';
import { api } from '../lib/api';

describe('AuthPage Show Password Feature', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles password visibility in Sign In (Login) mode', () => {
    const onSuccess = vi.fn();
    const onCancel = vi.fn();

    render(
      <AuthPage
        onSuccess={onSuccess}
        onCancel={onCancel}
        initialMode="login"
      />
    );

    const passwordInput = screen.getByLabelText(/^Password$/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    // Toggle button should initially offer to show characters
    const toggleBtn = screen.getByRole('button', { name: /Show characters/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByTitle(/Show password/i)).toBeInTheDocument();

    // Click show password
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe('text');

    // Toggle button should now offer to hide characters
    const hideBtn = screen.getByRole('button', { name: /Hide characters/i });
    expect(hideBtn).toBeInTheDocument();
    expect(screen.getByTitle(/Hide password/i)).toBeInTheDocument();

    // Click hide password
    fireEvent.click(hideBtn);
    expect(passwordInput.type).toBe('password');
    expect(screen.getByRole('button', { name: /Show characters/i })).toBeInTheDocument();
  });

  it('toggles password visibility in Create Account (Sign Up) mode', () => {
    const onSuccess = vi.fn();
    const onCancel = vi.fn();

    render(
      <AuthPage
        onSuccess={onSuccess}
        onCancel={onCancel}
        initialMode="signup"
      />
    );

    const passwordInput = screen.getByLabelText(/^Password$/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: /Show characters/i });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe('text');

    const hideBtn = screen.getByRole('button', { name: /Hide characters/i });
    expect(hideBtn).toBeInTheDocument();

    fireEvent.click(hideBtn);
    expect(passwordInput.type).toBe('password');
  });

  it('resets password visibility to hidden when switching tabs', () => {
    const onSuccess = vi.fn();
    const onCancel = vi.fn();

    render(
      <AuthPage
        onSuccess={onSuccess}
        onCancel={onCancel}
        initialMode="login"
      />
    );

    const passwordInput = screen.getByLabelText(/^Password$/i) as HTMLInputElement;
    const showBtn = screen.getByRole('button', { name: /Show characters/i });

    // Show password in login mode
    fireEvent.click(showBtn);
    expect(passwordInput.type).toBe('text');

    // Switch to Sign Up
    const createAccountTab = screen.getByRole('button', { name: /Create Account/i });
    fireEvent.click(createAccountTab);

    // Password should be reset to hidden
    expect(passwordInput.type).toBe('password');
    expect(screen.getByRole('button', { name: /Show characters/i })).toBeInTheDocument();

    // Show password in sign up mode
    fireEvent.click(screen.getByRole('button', { name: /Show characters/i }));
    expect(passwordInput.type).toBe('text');

    // Switch back to Sign In
    const signInTab = screen.getByRole('button', { name: /Sign In/i });
    fireEvent.click(signInTab);

    // Password should again be hidden
    expect(passwordInput.type).toBe('password');
    expect(screen.getByRole('button', { name: /Show characters/i })).toBeInTheDocument();
  });

  it('submits login credentials properly while toggling password', async () => {
    const onSuccess = vi.fn();
    const onCancel = vi.fn();
    const loginSpy = vi.spyOn(api.auth, 'login').mockResolvedValueOnce({
      token: 'jwt-123',
      user: { id: 'u1', email: 'test@example.com', name: 'Tester' },
    });

    render(
      <AuthPage
        onSuccess={onSuccess}
        onCancel={onCancel}
        initialMode="login"
      />
    );

    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'test@example.com' },
    });
    const passwordInput = screen.getByLabelText(/^Password$/i);
    fireEvent.change(passwordInput, { target: { value: 'secretPass!' } });

    // Reveal password to inspect
    fireEvent.click(screen.getByRole('button', { name: /Show characters/i }));
    expect((passwordInput as HTMLInputElement).type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /Sign In to Trips/i }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'secretPass!',
      });
      expect(onSuccess).toHaveBeenCalledWith({
        id: 'u1',
        email: 'test@example.com',
        name: 'Tester',
      });
    });
  });
});
