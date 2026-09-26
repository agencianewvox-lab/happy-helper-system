import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AccountPasswordForm } from '@/components/config/AccountPasswordForm';
import MinhaConta from '@/pages/MinhaConta';

const auth = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn(), reauthenticate: vi.fn() }));
const session = vi.hoisted(() => ({ user: { id: 'own-user', email: 'team@example.test' } as { id: string; email: string } | null, loading: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => session }));

const testPassword = 'only-a-test-password-123!';
const renderForm = () => render(<AccountPasswordForm userId="own-user" email="team@example.test" />);
function fill(password = testPassword, confirmation = password) {
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: confirmation } });
}
const submit = () => fireEvent.submit(screen.getByRole('button', { name: 'Salvar nova senha' }).closest('form')!);

beforeEach(() => {
  vi.resetAllMocks();
  session.user = { id: 'own-user', email: 'team@example.test' }; session.loading = false;
  auth.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
  auth.updateUser.mockResolvedValue({ data: { user: session.user }, error: null });
  auth.reauthenticate.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe('Personal password settings', () => {
  it('keeps password fields hidden and does not call Auth before submitting', () => {
    renderForm(); expect(screen.getByLabelText('Nova senha')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirmar nova senha')).toHaveAttribute('autocomplete', 'new-password');
    expect(auth.updateUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senhas' }));
    expect(screen.getByLabelText('Nova senha')).toHaveAttribute('type', 'text');
  });
  it('rejects short passwords before making any Auth request', () => {
    renderForm(); fill('short'); submit(); expect(screen.getByRole('alert')).toHaveTextContent('12 a 128');
    expect(auth.getUser).not.toHaveBeenCalled(); expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('rejects mismatched confirmations', () => {
    renderForm(); fill(testPassword, 'different-test-password'); submit();
    expect(screen.getByRole('alert')).toHaveTextContent('iguais'); expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('rejects expired sessions and clears passwords', async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });
    renderForm(); fill(); submit(); await screen.findByRole('alert');
    expect(auth.updateUser).not.toHaveBeenCalled(); expect(screen.getByLabelText('Nova senha')).toHaveValue('');
  });
  it('does not update a different signed-in account', async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: 'different-user' } }, error: null });
    renderForm(); fill(); submit(); await screen.findByRole('alert'); expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('updates only the session password, confirms success and clears fields', async () => {
    renderForm(); fill(); submit(); expect(await screen.findByRole('status')).toHaveTextContent('Senha alterada com sucesso');
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: testPassword });
    expect(screen.getByLabelText('Nova senha')).toHaveValue(''); expect(screen.getByLabelText('Confirmar nova senha')).toHaveValue('');
  });
  it('does not claim success for rejected weak passwords or leak provider payloads', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: null }, error: { code: 'weak_password', message: 'provider-private-detail' } });
    renderForm(); fill(); submit(); expect(await screen.findByRole('alert')).toHaveTextContent('mais forte');
    expect(screen.queryByRole('status')).not.toBeInTheDocument(); expect(screen.queryByText('provider-private-detail')).not.toBeInTheDocument();
  });
  it('supports provider reauthentication without weakening the policy', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'reauthentication_needed' } });
    renderForm(); fill(); submit(); await screen.findByLabelText('Código de confirmação');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código de confirmação' }));
    await waitFor(() => expect(auth.reauthenticate).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Código de confirmação'), { target: { value: '123456' } });
    submit(); await screen.findByText(/Senha alterada com sucesso/);
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: testPassword, nonce: '123456' });
  });
  it('honors a current-password requirement returned by Auth', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'current_password_required' } });
    renderForm(); fill(); submit(); await screen.findByLabelText('Senha atual');
    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'old-test-password-only' } });
    submit(); await screen.findByText(/Senha alterada com sucesso/);
    expect(auth.updateUser).toHaveBeenLastCalledWith({ password: testPassword, current_password: 'old-test-password-only' });
  });
  it('guards duplicate submissions while Auth is pending', async () => {
    let finish!: (value: unknown) => void;
    auth.updateUser.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    renderForm(); fill(); const form = screen.getByRole('button', { name: 'Salvar nova senha' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledOnce());
    finish({ data: { user: session.user }, error: null }); await screen.findByText(/Senha alterada com sucesso/);
  });
  it('handles network errors without logging or displaying secrets', async () => {
    auth.updateUser.mockRejectedValue(new Error(testPassword));
    renderForm(); fill(); submit(); expect(await screen.findByRole('alert')).not.toHaveTextContent(testPassword);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('My account route', () => {
  const page = () => render(<MemoryRouter initialEntries={['/configuracoes/minha-conta']}><Routes><Route path="/configuracoes/minha-conta" element={<MinhaConta />} /><Route path="/login" element={<p>Login obrigatório</p>} /></Routes></MemoryRouter>);
  it('redirects anonymous visitors to login', () => { session.user = null; page(); expect(screen.getByText('Login obrigatório')).toBeInTheDocument(); expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument(); });
  it('is available to an authenticated user without any Master role', () => { page(); expect(screen.getByRole('heading', { name: 'Alterar minha senha' })).toBeInTheDocument(); expect(screen.getByText('team@example.test')).toBeInTheDocument(); });
  it('does not expose the form while a session is loading', () => { session.loading = true; page(); expect(screen.getByRole('status')).toHaveTextContent('Verificando'); expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument(); });
});
