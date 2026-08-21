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
import { setCustomer, setDesignBankCount, setScope } from '../../store/slices/general_slices/kc-slice';
import { resetStore } from '../../store/slices/auth/logout-slice';
import { persistor } from '../../store/store';

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

        const redirectUrl =
          isPwdChg === 0
            ? '/forgot_password'
            : AFTER_LOGIN_REDIRECT_URL || '/';

        await router.replace(redirectUrl);

        requestAnimationFrame(() => {
          dispatch(setDesignBankCount(count));

          dispatch(setCustomer(null));
          
          dispatch(
            setScope({
              label: 'PDCM Design Bank',
              value: 'PDCM Design Bank',
            })
          );

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
