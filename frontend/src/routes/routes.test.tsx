import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from './routes';

vi.mock('@/features/system/api', () => ({
  fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', checks: { database: 'up' } }),
}));

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('public routes', () => {
  it('shows the mission and both registration calls to action on the landing page', async () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/every unit matters/i);
    expect(screen.getByRole('link', { name: /become a donor/i })).toHaveAttribute(
      'href',
      '/register/donor',
    );
    expect(screen.getByRole('link', { name: /register your hospital/i })).toHaveAttribute(
      'href',
      '/register/hospital',
    );
    expect(await screen.findByText('All systems operational')).toBeInTheDocument();
  });

  it('always shows the medical safety notice on the landing page', () => {
    renderAt('/');
    expect(
      screen.getByRole('complementary', { name: /medical safety notice/i }),
    ).toBeInTheDocument();
  });

  it('renders a not-found page for unknown paths', () => {
    renderAt('/definitely-not-a-page');
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });
});
