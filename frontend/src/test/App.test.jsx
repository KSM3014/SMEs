import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { describe, it, expect } from 'vitest';
import App from '../App';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
});

function renderApp() {
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('App', () => {
  it('renders header', () => {
    renderApp();
    expect(document.querySelector('.app')).toBeInTheDocument();
  });

  it('renders home page by default', () => {
    renderApp();
    expect(document.querySelector('.main-content')).toBeInTheDocument();
  });
});
