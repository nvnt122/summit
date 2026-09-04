import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { TypeLoginAPIParams, TypeLoginForm } from '../../interfaces/login-params-interface';
import getTokenFromLoginAPI, { emrLogin } from '../../services/api/auth/get-token-from-login-api';
import { setShowSessionExpiredModalFalse, storeToken, setUserName } from '../../store/slices/auth/token-login-slice';
import { CONSTANTS } from '../../services/config/app-config';
import { setDefaultCurrencyValue } from '../../store/slices/general_slices/multi-currency-slice';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../store/slices/general_slices/multilingual-slice';
import { languageDisplayOptions } from '../../utils/addon-utils/language-options';
import { Option } from '../../store/slices/general_slices/multilingual-slice';
import i18n from '../../i18n/i18n';
import useCurrencyLanguageHandler from '../GeneralHooks/LanguageHandler';
import { currencyOptions } from '../../utils/addon-utils/currency-map';
import useUserDefaultData from '../addon-hooks/kc-hooks/useUserData';
import { setCustomer, setCurrentScope, setDesignBankCount, setScope, setAutoFilterPreApply, setAutoFilterScopeResolving } from '../../store/slices/general_slices/kc-slice';
import { resetStore } from '../../store/slices/auth/logout-slice';
import { persistor } from '../../store/store';
import fetchDynamicConfig from '../../services/api/general-apis/get-dynamic-config';
import { AUTO_FILTER_SECTION_TYPE, AUTO_FILTER_SCOPE_FIELD_CODE, AUTO_FILTER_PRE_APPLY_FIELD_CODE } from '../../utils/addon-utils/auto-filter-config';
import { SCOPE_LABEL_TO_VALUE, ScopeLabel } from '../../components/addon-components/TwoLevelSidebar/filterConfig';

const useLoginHook = () => {
  const { AFTER_LOGIN_REDIRECT_URL } = CONSTANTS;
  const dispatch = useDispatch();
  const router = useRouter();
  const { t } = useTranslation('common');
  const { handleCurrencyShallowUpdate, handleLanguageShallowUpdate } = useCurrencyLanguageHandler();
  const { fetchUserDefaultData } = useUserDefaultData();
  const [loginForm, setLoginForm] = useState<TypeLoginForm>({ usr: '', pwd: '' });
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [isLoginThroughOTP, setIsLoginThroughOTP] = useState<boolean>(false);
  const [isLoginThroughGoogle, setIsLoginThroughGoogle] = useState<boolean>(false);
  const [loginBtnLoader, setLoginBtnLoader] = useState<boolean>(false);
  // Set when login returns 409 SESSION_ACTIVE — holds what the confirmation
  // modal needs to display (device/activeSince) plus the submitted values, so
  // confirming can resubmit the exact same login with kill_previous_session.
  const [sessionConflict, setSessionConflict] = useState<{ device: string; activeSince: string; values: TypeLoginForm } | null>(null);
  const togglePasswordIcon = (e: React.MouseEvent) => {
    e.preventDefault();
    setPasswordHidden(!passwordHidden);
  };

  // Resolves which scope the product-category page should preselect (and
  // whether that scope's filters should be auto-applied) from the
  // 'AutoFilter' dynamic-config section — scoped 'All', personalised per the
  // logged-in user via the auth token. Falls back to the previous hardcoded
  // Design Bank / no-auto-apply behaviour if the config is missing or the
  // call fails, so login never breaks on account of this lookup.
  const { SUMMIT_APP_CONFIG }: any = CONSTANTS;
  const applyAutoFilterScope = async (token: string) => {
    const fallback = { label: 'PDCM Design Bank', value: 'PDCM Design Bank' };
    // `scope` is never null (defaults to PDCM Design Bank), so a consumer
    // that needs to fetch scope-specific data (the dynamic Filter config)
    // can't tell "no auto-filter, genuinely Design Bank" apart from "this
    // lookup hasn't landed yet" by reading `scope` alone. This flag is the
    // explicit signal for that window — set for the duration of this
    // lookup, cleared on every exit path (success, preApply=N, and error)
    // via `finally` so a consumer waiting on it never hangs.
    dispatch(setAutoFilterScopeResolving(true));
    try {
      const response: any = await fetchDynamicConfig(
        SUMMIT_APP_CONFIG,
        { scope: 'All', sectionType: AUTO_FILTER_SECTION_TYPE },
        token
      );

      if (response?.status !== 200 || !response?.data?.success) {
        dispatch(setScope(fallback));
        return;
      }

      const sectionData = response?.data?.data?.find((item: any) => item.code === AUTO_FILTER_SECTION_TYPE);
      const fields = sectionData?.fields || [];
      const scopeLabel = fields.find((f: any) => f.code === AUTO_FILTER_SCOPE_FIELD_CODE)?.value as ScopeLabel | undefined;
      const preApply = fields.find((f: any) => f.code === AUTO_FILTER_PRE_APPLY_FIELD_CODE)?.value === 'Y';

      // preApply gates the scope preselection itself, not just whether its
      // filter defaults get auto-applied on top — 'N' means behave exactly
      // as before this feature existed (Design Bank), ignoring whatever
      // scope the config resolved to.
      if (!preApply) {
        dispatch(setScope(fallback));
        dispatch(setCurrentScope(fallback.value));
        dispatch(setAutoFilterPreApply(false));
        return;
      }

      const resolvedValue = scopeLabel && SCOPE_LABEL_TO_VALUE[scopeLabel] ? SCOPE_LABEL_TO_VALUE[scopeLabel] : fallback.value;
      const resolvedScope = { label: resolvedValue, value: resolvedValue };

      dispatch(setScope(resolvedScope));
      dispatch(setCurrentScope(resolvedValue));
      dispatch(setAutoFilterPreApply(preApply));
      // Every actual filter default (company code, voucher type, voucher no,
      // etc.) is intentionally NOT read from this config — it comes from the
      // resolved scope's own 'Filter' dynamic config instead, applied as-is,
      // exactly like a manual scope switch. This lookup only ever decides
      // which scope to preselect and whether to auto-apply it.
    } catch (error) {
      dispatch(setScope(fallback));
    } finally {
      dispatch(setAutoFilterScopeResolving(false));
    }
  };

  const fetchToken = async (values: TypeLoginForm, killPreviousSession = false) => {
    setLoginBtnLoader(true);

    try {
      const userParams: TypeLoginAPIParams = {
        values: { ...values },
        isGuest: false,
        loginViaOTP: false,
        LoginViaGoogle: false,
        killPreviousSession,
      };

      const tokenData = await emrLogin(userParams);

      if (
        tokenData?.success === true &&
        tokenData?.msg === 'success' &&
        tokenData?.data?.access_token
      ) {
        const { access_token, isPwdChg, count, full_name } = tokenData.data;
        await persistor.purge();
        dispatch(resetStore());
        localStorage.clear();
        if (isPwdChg !== 0) {
          dispatch(storeToken(tokenData.data));
        }

        // Set BEFORE navigating, not inside applyAutoFilterScope itself —
        // that only runs from the requestAnimationFrame callback below, which
        // fires after router.replace has already committed the destination
        // page's first render. A consumer mounting on that first render (the
        // product-category dynamic-config-fetch-trigger effect) would read
        // autoFilterScopeResolving still at its reset-store default (false)
        // and fetch the wrong (default-scope) config before this resolution
        // ever started, wrongly winning the race against the real resolved
        // scope. Dispatching here means it's already true by that first
        // render, so that consumer waits instead.
        dispatch(setAutoFilterScopeResolving(true));

        const redirectUrl =
          isPwdChg === 0
            ? '/forgot_password'
            : AFTER_LOGIN_REDIRECT_URL || '/';

        await router.replace(redirectUrl);

        requestAnimationFrame(() => {
          dispatch(setDesignBankCount(count));

          dispatch(setCustomer(null));

          applyAutoFilterScope(access_token);

          fetchUserDefaultData(access_token);

          dispatch(setUserName(values.usr));

          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('user', values.usr);
          localStorage.setItem('party_name', full_name);
        });
      }
    } catch (error: any) {
      if (
        error?.response?.status === 409 &&
        error?.response?.data?.code === 'SESSION_ACTIVE'
      ) {
        const { activeSince, device } = error?.response?.data?.data || {};
        setSessionConflict({ device, activeSince, values });
      } else if (
        error?.status === 400 &&
        error?.response?.data?.error === 'Invalid username or password'
      ) {
        toast.error(t('invalid_credentials'));
      } else {
        toast.error(t('error_while_login'));
      }
    } finally {
      setLoginBtnLoader(false);
    }
  };

  // "Log in here" on the session-conflict modal — resubmits the exact same
  // credentials with kill_previous_session so the other session is dropped.
  const confirmKillPreviousSession = () => {
    if (!sessionConflict) return;
    const { values } = sessionConflict;
    setSessionConflict(null);
    fetchToken(values, true);
  };

  // "Continue that session" — abandons this login attempt, leaves the other
  // session untouched.
  const dismissSessionConflict = () => setSessionConflict(null);

  useEffect(() => {
    dispatch(setShowSessionExpiredModalFalse());
  }, []);

  return {
    passwordHidden,
    togglePasswordIcon,
    fetchToken,
    loginBtnLoader,
    sessionConflict,
    confirmKillPreviousSession,
    dismissSessionConflict,
  };
};

export default useLoginHook;
