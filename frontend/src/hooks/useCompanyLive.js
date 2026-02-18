/**
 * useCompanyLive — SSE Hook for progressive company data loading
 *
 * State machine:
 *   idle → connecting → db_loaded → dart_loaded → complete
 *                                                → error
 *
 * Connects to /api/company/live/:brno and processes 5 SSE events:
 *   db_data    → instant DB cache (~50ms)
 *   live_start → 86 API fetch notification
 *   dart_data  → DART financials/officers/shareholders (~3s)
 *   live_diff  → DB vs live diff comparison (~20-30s)
 *   complete   → final merged data
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const INITIAL_STATE = {
  status: 'idle',       // idle | connecting | db_loaded | dart_loaded | complete | error
  company: null,        // current company data (mapEntityToCompanyDetail format)
  dartAvailable: null,  // null = unknown, true/false after dart_data event
  sminfoAvailable: null, // null = unknown, true/false after sminfo_data event
  diff: null,           // { added, updated, removed, unchangedCount, hasChanges }
  meta: null,           // { apisAttempted, apisSucceeded, durationMs }
  conflicts: [],        // cross-check conflicts from complete event
  error: null,          // error message string
  events: [],           // received event names for debugging/UI
};

export function useCompanyLive(brno) {
  const [state, setState] = useState(INITIAL_STATE);
  const esRef = useRef(null);

  const reset = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    if (!brno) {
      reset();
      return;
    }

    // Reset state for new brno
    setState({ ...INITIAL_STATE, status: 'connecting' });

    const es = new EventSource(`/api/company/live/${brno}`);
    esRef.current = es;

    // --- Event: db_data (instant DB cache) ---
    es.addEventListener('db_data', (e) => {
      try {
        const payload = JSON.parse(e.data);
        setState(prev => ({
          ...prev,
          status: payload.company ? 'db_loaded' : prev.status,
          company: payload.company || prev.company,
          events: [...prev.events, 'db_data'],
        }));
      } catch (err) {
        console.error('[useCompanyLive] db_data parse error:', err);
      }
    });

    // --- Event: live_start (86 APIs fetch starting) ---
    es.addEventListener('live_start', () => {
      setState(prev => ({
        ...prev,
        events: [...prev.events, 'live_start'],
      }));
    });

    // --- Event: dart_data (DART financials/officers/shareholders) ---
    es.addEventListener('dart_data', (e) => {
      try {
        const payload = JSON.parse(e.data);

        if (payload.available === false) {
          // DART data not available (non-listed company)
          setState(prev => ({
            ...prev,
            dartAvailable: false,
            events: [...prev.events, 'dart_data'],
          }));
          return;
        }

        // Merge DART fields into existing company object
        setState(prev => ({
          ...prev,
          status: 'dart_loaded',
          dartAvailable: true,
          company: prev.company ? {
            ...prev.company,
            // Override with DART-enriched fields
            company_name: payload.company_name || prev.company.company_name,
            ceo_name: payload.ceo_name || prev.company.ceo_name,
            address: payload.address || prev.company.address,
            listed: payload.listed ?? prev.company.listed,
            stock_code: payload.stock_code || prev.company.stock_code,
            revenue: payload.revenue ?? prev.company.revenue,
            operating_margin: payload.operating_margin ?? prev.company.operating_margin,
            roe: payload.roe ?? prev.company.roe,
            debt_ratio: payload.debt_ratio ?? prev.company.debt_ratio,
            // DART-specific sections
            financial_statements: payload.financial_statements || prev.company.financial_statements,
            financial_history: payload.financial_history || prev.company.financial_history,
            officers: payload.officers || prev.company.officers,
            shareholders: payload.shareholders || prev.company.shareholders,
            three_year_average: payload.three_year_average || prev.company.three_year_average,
            red_flags: payload.red_flags || prev.company.red_flags,
            _hasDart: true,
          } : {
            // No DB data yet — create from DART only
            company_name: payload.company_name,
            ceo_name: payload.ceo_name,
            address: payload.address,
            listed: payload.listed,
            stock_code: payload.stock_code,
            revenue: payload.revenue,
            operating_margin: payload.operating_margin,
            roe: payload.roe,
            debt_ratio: payload.debt_ratio,
            financial_statements: payload.financial_statements,
            financial_history: payload.financial_history,
            officers: payload.officers,
            shareholders: payload.shareholders,
            three_year_average: payload.three_year_average,
            red_flags: payload.red_flags,
            _hasDart: true,
          },
          events: [...prev.events, 'dart_data'],
        }));
      } catch (err) {
        console.error('[useCompanyLive] dart_data parse error:', err);
      }
    });

    // --- Event: sminfo_data (non-listed company financial data) ---
    es.addEventListener('sminfo_data', (e) => {
      try {
        const payload = JSON.parse(e.data);

        if (payload.available === false) {
          setState(prev => ({
            ...prev,
            sminfoAvailable: false,
            events: [...prev.events, 'sminfo_data'],
          }));
          return;
        }

        // Merge sminfo financial data into company
        setState(prev => ({
          ...prev,
          sminfoAvailable: true,
          company: prev.company ? {
            ...prev.company,
            financial_statements: payload.financial_statements || prev.company.financial_statements,
            revenue: payload.revenue ?? prev.company.revenue,
            operating_margin: payload.operating_margin ?? prev.company.operating_margin,
            roe: payload.roe ?? prev.company.roe,
            debt_ratio: payload.debt_ratio ?? prev.company.debt_ratio,
            total_assets: payload.total_assets ?? prev.company.total_assets,
            net_profit: payload.net_profit ?? prev.company.net_profit,
            _hasSminfo: true,
            _sminfoMatchScore: payload.matchScore,
            _sminfoMatchedCompany: payload.matchedCompany,
          } : null,
          events: [...prev.events, 'sminfo_data'],
        }));
      } catch (err) {
        console.error('[useCompanyLive] sminfo_data parse error:', err);
      }
    });

    // --- Event: live_diff (DB vs live comparison) ---
    es.addEventListener('live_diff', (e) => {
      try {
        const payload = JSON.parse(e.data);
        setState(prev => ({
          ...prev,
          diff: payload.diff || null,
          meta: payload.meta || null,
          events: [...prev.events, 'live_diff'],
        }));
      } catch (err) {
        console.error('[useCompanyLive] live_diff parse error:', err);
      }
    });

    // --- Event: complete (final merged data) ---
    es.addEventListener('complete', (e) => {
      try {
        const payload = JSON.parse(e.data);
        setState(prev => ({
          ...prev,
          status: 'complete',
          company: payload.company || prev.company,
          conflicts: payload.conflicts || [],
          events: [...prev.events, 'complete'],
        }));
      } catch (err) {
        console.error('[useCompanyLive] complete parse error:', err);
      }
      es.close();
      esRef.current = null;
    });

    // --- Event: error (server-sent error) ---
    es.addEventListener('error', () => {
      // SSE spec: error events can be reconnection attempts or fatal
      if (es.readyState === EventSource.CLOSED) {
        setState(prev => ({
          ...prev,
          status: prev.status === 'idle' || prev.status === 'connecting' ? 'error' : prev.status,
          error: 'SSE connection closed unexpectedly',
          events: [...prev.events, 'error'],
        }));
      }
    });

    // Cleanup on unmount or brno change
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [brno, reset]);

  return {
    ...state,
    // Derived booleans for convenience
    isLoading: state.status === 'connecting' || state.status === 'db_loaded' || state.status === 'dart_loaded',
    isComplete: state.status === 'complete',
    hasData: state.company !== null,
    hasDart: state.dartAvailable === true,
    hasSminfo: state.sminfoAvailable === true,
    hasDiff: state.diff !== null && state.diff.hasChanges,
  };
}

export default useCompanyLive;
