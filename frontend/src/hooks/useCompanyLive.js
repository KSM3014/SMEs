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
import { getApiUrl } from '../services/apiConfig';

const INITIAL_STATE = {
  status: 'idle',       // idle | connecting | db_loaded | dart_loaded | complete | error
  company: null,        // current company data (mapEntityToCompanyDetail format)
  dartAvailable: null,  // null = unknown, true/false after dart_data event
  sminfoAvailable: null, // null = unknown, true/false after sminfo_data event
  patentAvailable: null, // null = unknown, true/false after patent_data event
  patentData: null,     // KIPRIS patent data { patents, trademarks, ipScore }
  procurementAvailable: null, // null = unknown, true/false after procurement_data event
  procurementData: null, // 조달청 procurement data { contracts, awards, ... }
  diff: null,           // { added, updated, removed, unchangedCount, hasChanges }
  meta: null,           // { apisAttempted, apisSucceeded, durationMs }
  conflicts: [],        // cross-check conflicts from complete event
  error: null,          // error message string
  events: [],           // received event names for debugging/UI
  fetchedAt: null,      // ISO timestamp when SSE data fetch completed
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

    let cancelled = false;

    // Async: resolve API URL from runtime config, then open SSE
    getApiUrl().then(apiBase => {
      if (cancelled) return;
      const es = new EventSource(`${apiBase}/api/company/live/${brno}`);
      esRef.current = es;

    // Timeout: close SSE if no complete event within 120s
    const timeoutId = setTimeout(() => {
      if (es.readyState !== EventSource.CLOSED) {
        console.warn('[useCompanyLive] SSE timeout after 120s');
        es.close();
        esRef.current = null;
        setState(prev => ({
          ...prev,
          status: prev.status === 'complete' ? prev.status : 'complete',
          error: prev.status === 'complete' ? null : 'SSE 응답 시간 초과 (120초)',
          events: [...prev.events, 'timeout'],
        }));
      }
    }, 120000);

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
            phone: payload.phone || prev.company.phone,
            website: payload.website || prev.company.website,
            corp_registration_no: payload.corp_registration_no || prev.company.corp_registration_no,
            corp_cls: payload.corp_cls || prev.company.corp_cls,
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
            latest_annual: payload.latest_annual || prev.company.latest_annual,
            red_flags: payload.red_flags || prev.company.red_flags,
            report_period: payload.report_period || prev.company.report_period,
            report_year: payload.report_year ?? prev.company.report_year,
            // DART extended data
            employee_status: payload.employee_status || prev.company.employee_status,
            directors_compensation: payload.directors_compensation || prev.company.directors_compensation,
            dividend_details: payload.dividend_details || prev.company.dividend_details,
            financial_indicators: payload.financial_indicators || prev.company.financial_indicators,
            _hasDart: true,
          } : {
            // No DB data yet — create from DART only
            company_name: payload.company_name,
            ceo_name: payload.ceo_name,
            address: payload.address,
            phone: payload.phone,
            website: payload.website,
            corp_registration_no: payload.corp_registration_no,
            corp_cls: payload.corp_cls,
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
            latest_annual: payload.latest_annual,
            red_flags: payload.red_flags,
            report_period: payload.report_period,
            report_year: payload.report_year,
            employee_status: payload.employee_status,
            directors_compensation: payload.directors_compensation,
            dividend_details: payload.dividend_details,
            financial_indicators: payload.financial_indicators,
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
        setState(prev => {
          const base = prev.company || {};
          return {
            ...prev,
            sminfoAvailable: true,
            company: {
              ...base,
              financial_statements: payload.financial_statements || base.financial_statements,
              revenue: payload.revenue ?? base.revenue,
              operating_margin: payload.operating_margin ?? base.operating_margin,
              roe: payload.roe ?? base.roe,
              debt_ratio: payload.debt_ratio ?? base.debt_ratio,
              total_assets: payload.total_assets ?? base.total_assets,
              net_profit: payload.net_profit ?? base.net_profit,
              _hasSminfo: true,
              _sminfoMatchScore: payload.matchScore,
              _sminfoMatchedCompany: payload.matchedCompany,
            },
            events: [...prev.events, 'sminfo_data'],
          };
        });
      } catch (err) {
        console.error('[useCompanyLive] sminfo_data parse error:', err);
      }
    });

    // --- Event: patent_data (KIPRIS patent/trademark data) ---
    es.addEventListener('patent_data', (e) => {
      try {
        const payload = JSON.parse(e.data);

        if (payload.available === false) {
          setState(prev => ({
            ...prev,
            patentAvailable: false,
            events: [...prev.events, 'patent_data'],
          }));
          return;
        }

        setState(prev => ({
          ...prev,
          patentAvailable: true,
          patentData: {
            patents: payload.patents,
            trademarks: payload.trademarks,
            ipScore: payload.ipScore,
            searchedName: payload.searchedName,
          },
          company: prev.company ? {
            ...prev.company,
            patent_data: {
              patents: payload.patents,
              trademarks: payload.trademarks,
              ipScore: payload.ipScore,
              searchedName: payload.searchedName,
            },
          } : prev.company,
          events: [...prev.events, 'patent_data'],
        }));
      } catch (err) {
        console.error('[useCompanyLive] patent_data parse error:', err);
      }
    });

    // --- Event: procurement_data (조달청 procurement contracts/awards) ---
    es.addEventListener('procurement_data', (e) => {
      try {
        const payload = JSON.parse(e.data);

        if (payload.available === false) {
          setState(prev => ({
            ...prev,
            procurementAvailable: false,
            events: [...prev.events, 'procurement_data'],
          }));
          return;
        }

        setState(prev => ({
          ...prev,
          procurementAvailable: true,
          procurementData: {
            contracts: payload.contracts,
            awards: payload.awards,
            contractCount: payload.contractCount,
            awardCount: payload.awardCount,
            totalValue: payload.totalValue,
            totalContractValue: payload.totalContractValue,
            totalAwardValue: payload.totalAwardValue,
            avgContractAmount: payload.avgContractAmount,
            avgAwardRate: payload.avgAwardRate,
            isGovernmentVendor: payload.isGovernmentVendor,
            latestContract: payload.latestContract,
            latestAward: payload.latestAward,
            searchPeriod: payload.searchPeriod,
          },
          company: prev.company ? {
            ...prev.company,
            procurement: {
              isGovernmentVendor: payload.isGovernmentVendor,
              contractCount: payload.contractCount,
              awardCount: payload.awardCount,
              totalValue: payload.totalValue,
              contracts: payload.contracts,
              awards: payload.awards,
              searchPeriod: payload.searchPeriod,
            },
          } : prev.company,
          events: [...prev.events, 'procurement_data'],
        }));
      } catch (err) {
        console.error('[useCompanyLive] procurement_data parse error:', err);
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
          fetchedAt: new Date().toISOString(),
          events: [...prev.events, 'complete'],
        }));
      } catch (err) {
        console.error('[useCompanyLive] complete parse error:', err);
      }
      clearTimeout(timeoutId);
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
    }); // end getApiUrl().then()

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
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
    hasPatent: state.patentAvailable === true,
    hasProcurement: state.procurementAvailable === true,
    hasDiff: state.diff !== null && state.diff.hasChanges,
  };
}

export default useCompanyLive;
