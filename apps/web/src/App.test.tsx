import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App';

it('renders the Leather Manager heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: '皮具管理' })).toBeVisible();
});
